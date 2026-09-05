import { getRoundedNumber } from '@/components/shared';
import DBotStore from '../../../scratch/dbot-store';
import { api_base } from '../../api/api-base';
import { contract as broadcastContract, contractStatus } from '../utils/broadcast';
import { openContractReceived, sell } from './state/actions';

export default Engine =>
    class OpenContract extends Engine {
        observeOpenContract() {
            if (!api_base.api) return;
            const subscription = api_base.api.onMessage().subscribe(({ data }) => {
                if (data.msg_type === 'proposal_open_contract') {
                    const contract = data.proposal_open_contract;

                    if (!contract || !this.expectedContractId(contract?.contract_id)) {
                        return;
                    }

                    // Deriv delivers subscription.id at the root message level, not inside proposal_open_contract
                    if (data.subscription?.id && contract.contract_id) {
                        if (!this.contract_subscription_ids) {
                            this.contract_subscription_ids = new Map();
                        }
                        this.contract_subscription_ids.set(String(contract.contract_id), data.subscription.id);
                    }

                    if (this.bulk_group_map && this.bulk_group_map[contract.contract_id]) {
                        contract.bulk_group_id = this.bulk_group_map[contract.contract_id];
                    }

                    broadcastContract({ accountID: api_base.account_info?.loginid, ...contract });

                    const isContractFinished = Boolean(
                        contract.is_sold ||
                        contract.is_expired ||
                        (contract.status && contract.status !== 'open')
                    );

                    if (isContractFinished) {
                        this.handleContractSold(contract);
                    } else {
                        this.setContractFlags(contract);
                        this.data.contract = contract;
                        this.store.dispatch(openContractReceived());
                    }
                }
            });
            api_base.pushSubscription(subscription);
        }

        handleContractSold(contract) {
            if (!contract) return;
            const cId = String(contract.contract_id);
            if (!this.bulk_sold_contract_ids) {
                this.bulk_sold_contract_ids = new Set();
            }

            if (this.bulk_sold_contract_ids.has(cId)) {
                return;
            }
            this.bulk_sold_contract_ids.add(cId);

            // Enrich contract if sell_price is not yet populated on immediate is_expired exit
            const enrichedContract = { ...contract };
            const buyPrice = Number(enrichedContract.buy_price || 0);
            if (enrichedContract.sell_price === undefined || enrichedContract.sell_price === null) {
                if (enrichedContract.profit !== undefined && enrichedContract.profit !== null) {
                    enrichedContract.sell_price = buyPrice + Number(enrichedContract.profit);
                } else if (enrichedContract.status === 'won') {
                    enrichedContract.sell_price = Number(enrichedContract.payout || buyPrice * 1.95);
                } else if (enrichedContract.status === 'lost') {
                    enrichedContract.sell_price = 0;
                }
            }
            if (enrichedContract.profit === undefined || enrichedContract.profit === null) {
                if (enrichedContract.sell_price !== undefined) {
                    enrichedContract.profit = Number(enrichedContract.sell_price) - buyPrice;
                }
            }

            // Post win/loss result in Journal & update statistics for this contract
            this.updateTotals(enrichedContract);

            // Clean up Deriv contract stream immediately so WebSocket does not accumulate subscriptions
            try {
                const subId = this.contract_subscription_ids?.get(cId) || contract?.subscription?.id;
                if (subId) {
                    api_base.api?.send({ forget: subId }).catch(() => {});
                    this.contract_subscription_ids?.delete(cId);
                }
            } catch (e) {}

            const isBulk = Boolean(this.bulk_contract_ids && this.bulk_contract_ids.size > 1);
            const allBulkDone = !isBulk || this.bulk_sold_contract_ids.size >= this.bulk_contract_ids.size;

            if (allBulkDone) {
                // Cancel any pending watchdog timers immediately
                if (typeof this._clearWatchdog === 'function') {
                    this._clearWatchdog();
                }

                this.setContractFlags(contract);
                this.data.contract = contract;
                this.isSold = true;
                this.contractId = '';
                if (this.bulk_contract_ids) this.bulk_contract_ids.clear();
                if (this.bulk_sold_contract_ids) this.bulk_sold_contract_ids.clear();
                this.lastPurchasedTickEpoch = undefined;
                clearTimeout(this.transaction_recovery_timeout);

                contractStatus({
                    id: 'contract.sold',
                    data: contract.transaction_ids?.sell,
                    contract,
                });

                if (this.afterPromise) {
                    this.afterPromise();
                    this.afterPromise = null;
                }

                // If no more open contracts, ensure all contract streams on WebSocket are forgotten
                try {
                    if (!this.contract_subscription_ids || this.contract_subscription_ids.size === 0) {
                        api_base.api?.send({ forget_all: 'proposal_open_contract' }).catch(() => {});
                    }
                } catch (e) {}

                // Request fresh balance upon contract settlement
                try {
                    if (api_base.api) {
                        api_base.api.send({ balance: 1 }).then(res => {
                            if (res?.balance && typeof res.balance.balance === 'number') {
                                const { client } = DBotStore.instance || {};
                                if (client?.setBalance) {
                                    client.setBalance(
                                        res.balance.balance.toString(),
                                        res.balance.loginid || this.accountInfo?.loginid || client.loginid
                                    );
                                }
                            }
                        }).catch(() => {});
                    }
                } catch (e) {}

                this.store.dispatch(sell());
            }
        }

        waitForAfter() {
            if (this.isSold) {
                return Promise.resolve();
            }
            return new Promise(resolve => {
                this.afterPromise = resolve;
            });
        }

        setContractFlags(contract) {
            const { is_expired, is_valid_to_sell, is_sold, entry_tick, status } = contract;

            this.isSold = Boolean(is_sold || is_expired || (status && status !== 'open'));
            this.isSellAvailable = !this.isSold && Boolean(is_valid_to_sell);
            this.isExpired = Boolean(is_expired);
            this.hasEntryTick = Boolean(entry_tick);
        }

        expectedContractId(contractId) {
            if (!contractId) return false;
            const cIdStr = String(contractId);
            if (this.bulk_contract_ids && this.bulk_contract_ids.has(cIdStr)) {
                return true;
            }
            return Boolean(this.contractId && String(this.contractId) === cIdStr);
        }

        getSellPrice() {
            const { bid_price: bidPrice, buy_price: buyPrice, currency } = this.data.contract;
            return getRoundedNumber(Number(bidPrice) - Number(buyPrice), currency);
        }
    };
