import { getRoundedNumber } from '@/components/shared';
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

                    if (this.bulk_group_map && this.bulk_group_map[contract.contract_id]) {
                        contract.bulk_group_id = this.bulk_group_map[contract.contract_id];
                    }

                    broadcastContract({ accountID: api_base.account_info?.loginid, ...contract });

                    if (contract.is_sold) {
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

            // Post win/loss result in Journal & update statistics for this contract
            this.updateTotals(contract);

            const isBulk = Boolean(this.bulk_contract_ids && this.bulk_contract_ids.size > 1);
            const allBulkDone = !isBulk || this.bulk_sold_contract_ids.size >= this.bulk_contract_ids.size;

            if (allBulkDone) {
                this.setContractFlags(contract);
                this.data.contract = contract;
                this.contractId = '';
                if (this.bulk_contract_ids) this.bulk_contract_ids.clear();
                if (this.bulk_sold_contract_ids) this.bulk_sold_contract_ids.clear();
                clearTimeout(this.transaction_recovery_timeout);

                contractStatus({
                    id: 'contract.sold',
                    data: contract.transaction_ids?.sell,
                    contract,
                });

                if (this.afterPromise) {
                    this.afterPromise();
                }

                this.store.dispatch(sell());
            }
        }

        waitForAfter() {
            return new Promise(resolve => {
                this.afterPromise = resolve;
            });
        }

        setContractFlags(contract) {
            const { is_expired, is_valid_to_sell, is_sold, entry_tick } = contract;

            this.isSold = Boolean(is_sold);
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
