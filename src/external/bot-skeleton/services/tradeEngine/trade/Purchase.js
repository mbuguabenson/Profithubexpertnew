import { LogTypes } from '../../../constants/messages';
import { api_base } from '../../api/api-base';
import { contractStatus, info, log } from '../utils/broadcast';
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from '../utils/helpers';
import { purchaseSuccessful, sell } from './state/actions';
import { BEFORE_PURCHASE } from './state/constants';
import { observer as globalObserver } from '../../../utils/observer';

let delayIndex = 0;
let purchase_reference;

export default Engine =>
    class Purchase extends Engine {
        bulkPurchase(contract_type, count) {
            this.purchase_block_allow_bulk = 'yes';
            this.purchase_block_bulk_count = count;
            return this.purchase(contract_type);
        }
        
        purchase(contract_type) {
            // Prevent calling purchase twice
            const speed = localStorage.getItem('bot_execution_speed') || '1';
            const isSpeedMode = speed !== '1';
            if (!isSpeedMode && this.store.getState().scope !== BEFORE_PURCHASE) {
                return Promise.resolve();
            }

            if (isSpeedMode) {
                const now = Date.now();
                const lastPurchase = this.lastPurchaseTime || 0;
                const symbol = this.symbol || this.tradeOptions?.symbol || (this.trade_option && this.trade_option.underlying_symbol) || '';
                const is1sMarket = symbol && (symbol.startsWith('1HZ') || symbol.includes('1s') || symbol.includes('1S'));
                const minDelay = speed === '3' ? 50 : (is1sMarket ? 1000 : 2000);
                if (now - lastPurchase < minDelay) {
                    return Promise.resolve();
                }
                this.lastPurchaseTime = now;
            }

            const onSuccess = response => {
                const { buy } = response;

                contractStatus({
                    id: 'contract.purchase_received',
                    data: buy.transaction_id,
                    buy,
                });

                this.contractId = String(buy.contract_id);
                this.bulk_contract_ids = new Set([String(buy.contract_id)]);
                this.bulk_sold_contract_ids = new Set();
                this.store.dispatch(purchaseSuccessful());

                if (this.is_proposal_subscription_required) {
                    this.renewProposalsOnPurchase();
                }

                if (api_base.api && buy.contract_id) {
                    try {
                        api_base.api.send({
                            proposal_open_contract: 1,
                            contract_id: buy.contract_id,
                            subscribe: 1,
                        });
                    } catch {}
                }

                // 🛡️ POC Watchdog Recovery Timer: Auto-poll contract completion if stream is delayed
                const purchasedContractId = buy.contract_id;
                const watchdogDuration = (Number(this.tradeOptions?.duration || 5) * 1200) + 3500;

                const watchdogTimer = setTimeout(async () => {
                    if (this.contractId === String(purchasedContractId) && !this.isSold) {
                        try {
                            const res = await api_base.api?.send({
                                proposal_open_contract: 1,
                                contract_id: purchasedContractId,
                            });
                            if (res && res.proposal_open_contract) {
                                const poc = res.proposal_open_contract;
                                if (poc.is_sold) {
                                    this.handleContractSold(poc);
                                }
                            }
                        } catch {}
                    }
                }, watchdogDuration);

                if (isSpeedMode) {
                    const postDelay = speed === '3' ? 10 : 50;
                    setTimeout(() => {
                        clearTimeout(watchdogTimer);
                        this.contractId = '';
                        if (this.afterPromise) {
                            this.afterPromise();
                        }
                        this.store.dispatch(sell());
                    }, postDelay);
                }

                delayIndex = 0;
                log(LogTypes.PURCHASE, { transaction_id: buy.transaction_id });
                info({
                    accountID: this.accountInfo?.loginid,
                    totalRuns: this.updateAndReturnTotalRuns(),
                    transaction_ids: { buy: buy.transaction_id },
                    contract_type,
                    buy_price: buy.buy_price,
                });
            };

            const isBulkEnabled = (this.purchase_block_allow_bulk === 'yes') || (window.scanner_store?.is_bulk_trades_enabled);
            const bulkCount = isBulkEnabled ? Math.max(1, Math.min(100, Number(this.purchase_block_bulk_count || window.scanner_store?.bulk_trades_count || 2))) : 1;

            if (bulkCount > 1) {
                log(LogTypes.INFO, { message: `🚀 [BULK TRADES] Placing ${bulkCount} parallel contracts simultaneously on Deriv...` });
                const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions);

                try {
                    globalObserver.emit('replicator.purchase', {
                        mode: 'parameters',
                        request: trade_option,
                        tradeOptions: this.tradeOptions,
                        contract_type,
                        account_id: this.accountInfo?.loginid,
                    });
                } catch {}

                const bulkGroupId = `BULK_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                this.isSold = false;
                contractStatus({
                    id: 'contract.purchase_sent',
                    data: this.tradeOptions.amount,
                });

                // Send all requests simultaneously without stagger/delay
                const reqs = Array.from({ length: bulkCount }, () =>
                    api_base.api.send(trade_option).catch(err => ({ error: err }))
                );

                return Promise.all(reqs).then(responses => {
                    this.purchase_block_allow_bulk = 'no';
                    const validResponses = responses.filter(r => r && r.buy && !r.error);

                    if (validResponses.length === 0) {
                        const errObj = responses.find(r => r && r.error);
                        const errMsg = errObj?.error?.message || errObj?.error || 'Bulk trade purchase failed';
                        log(LogTypes.ERROR, { message: `❌ [BULK TRADES FAILED] ${errMsg}` });

                        this.store.dispatch(purchaseSuccessful());
                        if (this.afterPromise) {
                            this.afterPromise();
                        }
                        return null;
                    }

                    this.bulk_group_map = this.bulk_group_map || {};
                    this.bulk_contract_ids = new Set(validResponses.map(r => String(r.buy.contract_id)));
                    this.bulk_sold_contract_ids = new Set();
                    this.contractId = String(validResponses[0].buy.contract_id);

                    validResponses.forEach((res) => {
                        const { buy } = res;
                        buy.bulk_group_id = bulkGroupId; // Inject bulk group ID
                        this.bulk_group_map[buy.contract_id] = bulkGroupId;

                        // Subscribe to proposal_open_contract for EACH contract in the bulk batch
                        if (api_base.api && buy.contract_id) {
                            try {
                                api_base.api.send({
                                    proposal_open_contract: 1,
                                    contract_id: buy.contract_id,
                                    subscribe: 1,
                                });
                            } catch {}
                        }

                        contractStatus({
                            id: 'contract.purchase_received',
                            data: buy.transaction_id,
                            buy,
                        });
                        log(LogTypes.PURCHASE, { transaction_id: buy.transaction_id });
                        info({
                            accountID: this.accountInfo?.loginid,
                            totalRuns: this.updateAndReturnTotalRuns(),
                            transaction_ids: { buy: buy.transaction_id },
                            contract_type,
                            buy_price: buy.buy_price,
                        });
                    });

                    this.store.dispatch(purchaseSuccessful());

                    if (this.is_proposal_subscription_required) {
                        this.renewProposalsOnPurchase();
                    }

                    // 🛡️ Watchdog Recovery Timer across all contracts in the bulk batch
                    const watchdogDuration = (Number(this.tradeOptions?.duration || 5) * 1200) + 4000;
                    const contractIdsToCheck = new Set(this.bulk_contract_ids);
                    setTimeout(async () => {
                        for (const cid of contractIdsToCheck) {
                            if (!this.bulk_sold_contract_ids.has(cid)) {
                                try {
                                    const res = await api_base.api?.send({
                                        proposal_open_contract: 1,
                                        contract_id: Number(cid),
                                    });
                                    if (res?.proposal_open_contract?.is_sold) {
                                        const poc = res.proposal_open_contract;
                                        if (this.bulk_group_map && this.bulk_group_map[poc.contract_id]) {
                                            poc.bulk_group_id = this.bulk_group_map[poc.contract_id];
                                        }
                                        this.handleContractSold(poc);
                                    }
                                } catch {}
                            }
                        }
                    }, watchdogDuration);

                    return validResponses[0];
                }).catch(err => {
                    this.purchase_block_allow_bulk = 'no';
                    log(LogTypes.ERROR, { message: `❌ [BULK TRADES ERROR] ${err?.message || err}` });
                    this.store.dispatch(purchaseSuccessful());
                    if (this.afterPromise) {
                        this.afterPromise();
                    }
                    return null;
                });
            }

            const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions);

            let selectedProposal = null;
            if (this.is_proposal_subscription_required) {
                try {
                    selectedProposal = this.selectProposal(contract_type);
                } catch (propErr) {
                    console.warn('[Purchase] Proposal selection failed, falling back to parameters:', propErr);
                }
            }

            if (selectedProposal && selectedProposal.id) {
                const { id, askPrice } = selectedProposal;

                try {
                    globalObserver.emit('replicator.purchase', {
                        mode: 'proposal_id',
                        request: { buy: id, price: askPrice },
                        tradeOptions: this.tradeOptions,
                        contract_type,
                        account_id: this.accountInfo?.loginid,
                    });
                } catch {}

                const action = () => api_base.api.send({ buy: id, price: askPrice });
                this.isSold = false;

                contractStatus({
                    id: 'contract.purchase_sent',
                    data: askPrice,
                });

                return action().then(onSuccess).catch(err => {
                    console.warn('[Purchase] Proposal purchase failed, retrying with parameters:', err);
                    const paramAction = () => api_base.api.send(trade_option);
                    return paramAction().then(onSuccess).catch(paramErr => {
                        const errMsg = paramErr?.error?.message || paramErr?.message || 'Purchase failed';
                        log(LogTypes.ERROR, { message: `❌ [PURCHASE FAILED] ${errMsg}` });
                        this.store.dispatch(purchaseSuccessful());
                        if (this.afterPromise) {
                            this.afterPromise();
                        }
                    });
                });
            }

            try {
                globalObserver.emit('replicator.purchase', {
                    mode: 'parameters',
                    request: trade_option,
                    tradeOptions: this.tradeOptions,
                    contract_type,
                    account_id: this.accountInfo?.loginid,
                });
            } catch {}

            const action = () => api_base.api.send(trade_option);
            this.isSold = false;

            contractStatus({
                id: 'contract.purchase_sent',
                data: this.tradeOptions.amount,
            });

            return action().then(onSuccess).catch(err => {
                const errMsg = err?.error?.message || err?.message || 'Purchase failed';
                log(LogTypes.ERROR, { message: `❌ [PURCHASE FAILED] ${errMsg}` });
                this.store.dispatch(purchaseSuccessful());
                if (this.afterPromise) {
                    this.afterPromise();
                }
            });
        }
        getPurchaseReference = () => purchase_reference;
        regeneratePurchaseReference = () => {
            purchase_reference = getUUID();
        };
    };
