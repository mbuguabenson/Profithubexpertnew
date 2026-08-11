import { action, makeObservable, observable, runInAction } from 'mobx';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { normalizeTradeParameters } from '@/utils/trade-purchase';

export type TTradeCategory = 
    | 'rise_fall' 
    | 'high_low' 
    | 'digits_match_diff' 
    | 'digits_over_under' 
    | 'digits_even_odd' 
    | 'touch_no_touch' 
    | 'accumulator' 
    | 'multiplier';

export interface TProposalData {
    id?: string;
    proposal_id?: string;
    ask_price?: number;
    payout?: number;
    spot?: number;
    spot_time?: number;
    contract_type?: string;
    longcode?: string;
    display_value?: string;
    error?: string;
}

export interface TContractPurchaseResult {
    buy_price: number;
    contract_id: number;
    longcode: string;
    purchase_time: number;
    balance_after?: number;
}

export default class TraderStore {
    root_store: any;

    @observable accessor symbol: string = '1HZ100V';
    @observable accessor symbol_display_name: string = 'Volatility 100 (1s) Index';
    @observable accessor category: TTradeCategory = 'rise_fall';
    @observable accessor trade_type: string = 'RISEFALL';

    // Parameters
    @observable accessor amount: number = 10;
    @observable accessor basis: 'stake' | 'payout' = 'stake';
    @observable accessor duration: number = 5;
    @observable accessor duration_unit: 't' | 's' | 'm' | 'h' | 'd' = 't';
    @observable accessor barrier: string = '+0.5';
    @observable accessor prediction: number = 5;
    @observable accessor growth_rate: number = 0.02; // 2% for Accumulators
    @observable accessor multiplier: number = 10;

    // Proposals State
    @observable accessor proposal_1: TProposalData | null = null; // e.g., CALL / MATCHES / EVEN / HIGHER
    @observable accessor proposal_2: TProposalData | null = null; // e.g., PUT / DIFFERS / ODD / LOWER
    @observable accessor is_proposal_loading: boolean = false;
    @observable accessor proposal_error: string | null = null;

    // Purchase State
    @observable accessor is_purchasing: boolean = false;
    @observable accessor purchase_error: string | null = null;
    @observable accessor last_purchase_result: TContractPurchaseResult | null = null;

    // Active contract tracking
    @observable accessor active_contracts: any[] = [];

    private proposal_timer: any = null;

    constructor(root_store: any) {
        makeObservable(this);
        this.root_store = root_store;
    }

    @action
    setSymbol(symbol: string, displayName?: string) {
        this.symbol = symbol;
        if (displayName) {
            this.symbol_display_name = displayName;
        }
        this.requestProposals();
    }

    @action
    setCategory(category: TTradeCategory) {
        this.category = category;
        switch (category) {
            case 'rise_fall':
                this.trade_type = 'RISEFALL';
                break;
            case 'high_low':
                this.trade_type = 'HIGH_LOW';
                break;
            case 'digits_match_diff':
                this.trade_type = 'MATCHDIFF';
                break;
            case 'digits_over_under':
                this.trade_type = 'OVERUNDER';
                break;
            case 'digits_even_odd':
                this.trade_type = 'EVENODD';
                break;
            case 'touch_no_touch':
                this.trade_type = 'TOUCH';
                break;
            case 'accumulator':
                this.trade_type = 'ACCUMULATOR';
                break;
            case 'multiplier':
                this.trade_type = 'MULTIPLIER';
                break;
        }
        this.requestProposals();
    }

    @action
    setAmount(amount: number) {
        this.amount = Math.max(0.35, amount);
        this.debouncedRequestProposals();
    }

    @action
    setBasis(basis: 'stake' | 'payout') {
        this.basis = basis;
        this.requestProposals();
    }

    @action
    setDuration(duration: number) {
        this.duration = Math.max(1, duration);
        this.requestProposals();
    }

    @action
    setDurationUnit(unit: 't' | 's' | 'm' | 'h' | 'd') {
        this.duration_unit = unit;
        this.requestProposals();
    }

    @action
    setBarrier(barrier: string) {
        this.barrier = barrier;
        this.debouncedRequestProposals();
    }

    @action
    setPrediction(prediction: number) {
        this.prediction = Math.min(9, Math.max(0, prediction));
        this.requestProposals();
    }

    @action
    setGrowthRate(rate: number) {
        this.growth_rate = rate;
        this.requestProposals();
    }

    @action
    setMultiplier(multiplier: number) {
        this.multiplier = multiplier;
        this.requestProposals();
    }

    private debouncedRequestProposals() {
        if (this.proposal_timer) {
            clearTimeout(this.proposal_timer);
        }
        this.proposal_timer = setTimeout(() => {
            this.requestProposals();
        }, 300);
    }

    @action
    async requestProposals() {
        if (!api_base?.api) return;

        this.is_proposal_loading = true;
        this.proposal_error = null;

        const contractTypes = this.getContractTypesForCurrentCategory();

        try {
            // Request proposal 1
            const req1 = this.buildProposalRequest(contractTypes[0]);
            const res1 = await api_base.api.send(req1);

            runInAction(() => {
                if (res1.error) {
                    this.proposal_1 = { error: res1.error.message };
                } else if (res1.proposal) {
                    this.proposal_1 = {
                        proposal_id: res1.proposal.id,
                        ask_price: Number(res1.proposal.ask_price),
                        payout: Number(res1.proposal.payout),
                        spot: Number(res1.proposal.spot),
                        contract_type: contractTypes[0],
                        longcode: res1.proposal.longcode,
                        display_value: res1.proposal.display_value,
                    };
                }
            });

            // Request proposal 2 (if applicable)
            if (contractTypes[1]) {
                const req2 = this.buildProposalRequest(contractTypes[1]);
                const res2 = await api_base.api.send(req2);

                runInAction(() => {
                    if (res2.error) {
                        this.proposal_2 = { error: res2.error.message };
                    } else if (res2.proposal) {
                        this.proposal_2 = {
                            proposal_id: res2.proposal.id,
                            ask_price: Number(res2.proposal.ask_price),
                            payout: Number(res2.proposal.payout),
                            spot: Number(res2.proposal.spot),
                            contract_type: contractTypes[1],
                            longcode: res2.proposal.longcode,
                            display_value: res2.proposal.display_value,
                        };
                    }
                });
            } else {
                runInAction(() => {
                    this.proposal_2 = null;
                });
            }
        } catch (err: any) {
            runInAction(() => {
                this.proposal_error = err?.message || 'Failed to fetch contract proposals';
            });
        } finally {
            runInAction(() => {
                this.is_proposal_loading = false;
            });
        }
    }

    private getContractTypesForCurrentCategory(): [string, string?] {
        switch (this.category) {
            case 'rise_fall':
                return ['CALL', 'PUT'];
            case 'high_low':
                return ['HIGHER', 'LOWER'];
            case 'digits_match_diff':
                return ['DIGITMATCH', 'DIGITDIFF'];
            case 'digits_over_under':
                return ['DIGITOVER', 'DIGITUNDER'];
            case 'digits_even_odd':
                return ['DIGITEVEN', 'DIGITODD'];
            case 'touch_no_touch':
                return ['ONETOUCH', 'NOTOUCH'];
            case 'accumulator':
                return ['ACCU'];
            case 'multiplier':
                return ['MULTUP', 'MULTDOWN'];
            default:
                return ['CALL', 'PUT'];
        }
    }

    private buildProposalRequest(contractType: string): any {
        const currency = this.root_store?.client?.currency || 'USD';
        return normalizeTradeParameters({
            proposal: 1,
            amount: this.amount,
            basis: this.basis,
            contract_type: contractType,
            currency: currency,
            symbol: this.symbol,
            ...(this.category === 'accumulator' ? { growth_rate: this.growth_rate } : {}),
            ...(this.category === 'multiplier' ? { multiplier: this.multiplier } : {}),
            ...(this.category !== 'accumulator' && this.category !== 'multiplier'
                ? { duration: this.duration, duration_unit: this.duration_unit }
                : {}),
            ...(this.category === 'digits_match_diff' || this.category === 'digits_over_under'
                ? { barrier: String(this.prediction) }
                : {}),
            ...((this.category === 'high_low' || this.category === 'touch_no_touch') ? { barrier: this.barrier } : {}),
        });
    }

    @action
    async buyContract(proposalId: string, price: number) {
        if (!api_base?.api || !proposalId) return;

        this.is_purchasing = true;
        this.purchase_error = null;

        try {
            const res = await api_base.api.send({
                buy: proposalId,
                price: price,
            });

            runInAction(() => {
                if (res.error) {
                    this.purchase_error = res.error.message;
                } else if (res.buy) {
                    this.last_purchase_result = {
                        buy_price: res.buy.buy_price,
                        contract_id: res.buy.contract_id,
                        longcode: res.buy.longcode,
                        purchase_time: res.buy.purchase_time,
                        balance_after: res.buy.balance_after,
                    };
                    this.active_contracts.unshift(res.buy);
                }
            });
        } catch (err: any) {
            runInAction(() => {
                this.purchase_error = err?.message || 'Contract purchase failed';
            });
        } finally {
            runInAction(() => {
                this.is_purchasing = false;
            });
        }
    }
}
