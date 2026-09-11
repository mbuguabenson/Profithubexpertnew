/**
 * DTrader Adapter
 * Core trading engine and adapter connecting UI to Deriv WebSocket API.
 * Follows the same robust streaming and transport patterns as smartcharts-champion adapter.
 */

import { api_base, observer as globalObserver } from '@/external/bot-skeleton';
import type {
    ContractType,
    OpenPosition,
    ProposalData,
    SettledContract,
    TradeCategory,
    TradeParams,
} from './types';

type ProposalListener = (proposals: Record<string, ProposalData>) => void;
type PositionsListener = (positions: OpenPosition[]) => void;
type SettledListener = (contract: SettledContract) => void;

import chart_api from '@/external/bot-skeleton/services/api/chart-api';

export class DTraderAdapter {
    private activeProposalSubs: Map<string, { subId?: string; reqId?: string }> = new Map();
    private proposals: Record<string, ProposalData> = {};
    private proposalListeners: Set<ProposalListener> = new Set();

    private openPositions: Map<number, OpenPosition> = new Map();
    private positionSubscriptions: Map<number, { subId?: string; unsubscribe?: () => void }> = new Map();
    private positionsListeners: Set<PositionsListener> = new Set();

    private settledContracts: SettledContract[] = [];
    private settledListeners: Set<SettledListener> = new Set();

    private messageSubscription: { unsubscribe: () => void } | null = null;
    private isInitialized = false;

    constructor() {
        this.loadSettledContractsFromStorage();
    }

    private async getApi() {
        if (chart_api.api?.connection?.readyState === WebSocket.OPEN) {
            return chart_api.api;
        }
        if (api_base.api?.connection?.readyState === WebSocket.OPEN) {
            return api_base.api;
        }
        if (typeof chart_api.waitForConnection === 'function') {
            await chart_api.waitForConnection(6000);
            return chart_api.api || api_base.api;
        }
        return api_base.api || chart_api.api;
    }

    public init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        this.setupMessageListener();
    }

    public destroy() {
        this.clearAllProposals();
        this.clearAllPositionStreams();
        if (this.messageSubscription) {
            this.messageSubscription.unsubscribe();
            this.messageSubscription = null;
        }
        this.proposalListeners.clear();
        this.positionsListeners.clear();
        this.settledListeners.clear();
        this.isInitialized = false;
    }

    /**
     * Listen to global Deriv WS incoming messages
     */
    private async setupMessageListener() {
        const api = await this.getApi();
        if (!api) {
            // Try again when api becomes available
            setTimeout(() => {
                if (!this.messageSubscription) this.setupMessageListener();
            }, 500);
            return;
        }

        try {
            if (this.messageSubscription) {
                this.messageSubscription.unsubscribe();
            }
            this.messageSubscription = api.onMessage?.().subscribe(({ data }: { data: any }) => {
                if (!data) return;

                // Handle Proposal stream
                if (data.msg_type === 'proposal' && data.proposal) {
                    this.handleProposalMessage(data);
                } else if (data.error && data.echo_req?.proposal) {
                    this.handleProposalError(data);
                }

                // Handle Proposal Open Contract stream
                if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
                    this.handleOpenContractMessage(data.proposal_open_contract);
                }
            });
        } catch (err) {
            console.warn('[DTraderAdapter] Error setting up WS message listener:', err);
        }
    }

    // ==========================================
    // PROPOSALS MANAGEMENT
    // ==========================================

    public subscribeProposals(params: TradeParams, currency: string) {
        this.init();
        this.clearAllProposals();

        const contractTypes = this.getContractTypesForCategory(params.category);

        contractTypes.forEach(type => {
            this.requestProposalForType(type, params, currency);
        });
    }

    private getContractTypesForCategory(category: TradeCategory): ContractType[] {
        switch (category) {
            case 'rise_fall':
                return ['CALL', 'PUT'];
            case 'high_low':
                return ['HIGHER', 'LOWER'];
            case 'digits_matches_differs':
                return ['DIGITMATCH', 'DIGITDIFF'];
            case 'digits_even_odd':
                return ['DIGITEVEN', 'DIGITODD'];
            case 'digits_over_under':
                return ['DIGITOVER', 'DIGITUNDER'];
            case 'touch_notouch':
                return ['ONETOUCH', 'NOTOUCH'];
            case 'multiplier':
                return ['MULTUP', 'MULTDOWN'];
            case 'accumulator':
                return ['ACCU'];
            default:
                return ['CALL', 'PUT'];
        }
    }

    private async requestProposalForType(type: ContractType, params: TradeParams, currency: string) {
        const api = await this.getApi();
        if (!api) return;

        const safeCurrency = (api_base.is_authorized || (window as any)?.api_base?.is_authorized) && currency ? currency : 'USD';

        const reqId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        this.activeProposalSubs.set(type, { reqId });

        // Set initial loading state
        this.proposals[type] = {
            id: '',
            contract_type: type,
            ask_price: params.amount,
            payout: 0,
            profit: 0,
            returns: 0,
            barrier: params.barrier,
        };
        this.notifyProposalListeners();

        const proposalReq: Record<string, any> = {
            proposal: 1,
            subscribe: 1,
            amount: params.amount,
            basis: params.basis || 'stake',
            contract_type: type,
            currency: safeCurrency,
            symbol: params.symbol,
            req_id: reqId,
        };

        if (type === 'ACCU') {
            proposalReq.growth_rate = params.growthRate ?? 0.03;
            if (params.takeProfit && params.takeProfit > 0) {
                proposalReq.limit_order = { take_profit: params.takeProfit };
            }
        } else if (type === 'MULTUP' || type === 'MULTDOWN') {
            proposalReq.multiplier = params.multiplier ?? 20;
            if (params.takeProfit || params.stopLoss) {
                proposalReq.limit_order = {
                    ...(params.takeProfit ? { take_profit: params.takeProfit } : {}),
                    ...(params.stopLoss ? { stop_loss: params.stopLoss } : {}),
                };
            }
            if (params.hasCancellation && params.cancellationDuration) {
                proposalReq.cancellation = params.cancellationDuration;
            }
        } else {
            proposalReq.duration = params.duration;
            proposalReq.duration_unit = params.durationUnit;

            if (
                type === 'DIGITMATCH' ||
                type === 'DIGITDIFF' ||
                type === 'DIGITOVER' ||
                type === 'DIGITUNDER'
            ) {
                proposalReq.barrier = String(params.selectedDigit ?? 5);
            } else if (params.barrier !== undefined && params.barrier !== '') {
                proposalReq.barrier = String(params.barrier);
                if (params.barrier2 !== undefined && params.barrier2 !== '') {
                    proposalReq.barrier2 = String(params.barrier2);
                }
            }
        }

        try {
            const response = await api.send(proposalReq);

            if (response?.error) {
                this.proposals[type] = {
                    ...this.proposals[type],
                    error: response.error.message || 'Proposal unavailable',
                };
                this.notifyProposalListeners();
                return;
            }

            if (response?.subscription?.id) {
                const existing = this.activeProposalSubs.get(type);
                if (existing) {
                    existing.subId = response.subscription.id;
                }
            }

            if (response?.proposal) {
                this.handleProposalData(type, response.proposal);
            }
        } catch (err: any) {
            this.proposals[type] = {
                ...this.proposals[type],
                error: err?.message || 'Error requesting proposal',
            };
            this.notifyProposalListeners();
        }
    }

    private handleProposalMessage(data: any) {
        const type = data.echo_req?.contract_type as ContractType;
        if (!type || !data.proposal) return;

        // Verify request match
        const activeSub = this.activeProposalSubs.get(type);
        if (activeSub && data.subscription?.id && !activeSub.subId) {
            activeSub.subId = data.subscription.id;
        }

        this.handleProposalData(type, data.proposal);
    }

    private handleProposalError(data: any) {
        const type = data.echo_req?.contract_type as ContractType;
        if (!type) return;

        this.proposals[type] = {
            id: '',
            contract_type: type,
            ask_price: data.echo_req?.amount || 0,
            payout: 0,
            profit: 0,
            returns: 0,
            error: data.error?.message || 'Proposal error',
        };
        this.notifyProposalListeners();
    }

    private handleProposalData(type: ContractType, p: any) {
        const ask_price = Number(p.ask_price || p.display_value || 0);
        const payout = Number(p.payout || 0);
        const profit = payout - ask_price;
        const returns = ask_price > 0 ? (profit / ask_price) * 100 : 0;

        this.proposals[type] = {
            id: p.id,
            contract_type: type,
            ask_price,
            payout,
            profit,
            returns,
            spot: Number(p.spot || 0),
            spot_time: Number(p.spot_time || 0),
            longcode: p.longcode,
            barrier: p.barrier,
            growth_rate: p.growth_rate,
            error: undefined,
        };

        this.notifyProposalListeners();
    }

    private clearAllProposals() {
        const api = api_base.api;
        this.activeProposalSubs.forEach(sub => {
            if (api && sub.subId) {
                api.send({ forget: sub.subId }).catch(() => {});
            }
        });
        this.activeProposalSubs.clear();
        this.proposals = {};
        this.notifyProposalListeners();
    }

    public onProposalsChange(listener: ProposalListener) {
        this.proposalListeners.add(listener);
        listener({ ...this.proposals });
        return () => this.proposalListeners.delete(listener);
    }

    private notifyProposalListeners() {
        const snapshot = { ...this.proposals };
        this.proposalListeners.forEach(l => l(snapshot));
    }

    // ==========================================
    // CONTRACT EXECUTION (BUY)
    // ==========================================

    public async buyContract(
        type: ContractType,
        params: TradeParams,
        currency: string
    ): Promise<{ success: boolean; contract_id?: number; error?: string }> {
        const api = await this.getApi();
        if (!api) {
            return { success: false, error: 'Trading connection not ready. Please try again.' };
        }

        const proposal = this.proposals[type];
        if (!proposal || !proposal.id) {
            return { success: false, error: proposal?.error || 'Proposal not ready. Please wait a moment.' };
        }

        try {
            globalObserver.emit('contract.status', {
                id: 'contract.purchase_sent',
                data: proposal.ask_price,
            });

            const buyResponse = await api.send({
                buy: proposal.id,
                price: proposal.ask_price,
            });

            if (buyResponse?.error) {
                return { success: false, error: buyResponse.error.message || 'Purchase rejected.' };
            }

            const buy = buyResponse?.buy;
            if (!buy || !buy.contract_id) {
                return { success: false, error: 'No contract ID returned by exchange.' };
            }

            const contractId = Number(buy.contract_id);
            const transactionId = Number(buy.transaction_id || contractId);

            globalObserver.emit('contract.status', {
                id: 'contract.purchase_received',
                data: transactionId,
                buy,
            });

            // Create initial open position entry
            const initialPosition: OpenPosition = {
                contract_id: contractId,
                transaction_id: transactionId,
                contract_type: type,
                underlying: params.symbol,
                display_name: buy.longcode || `${type} Contract`,
                barrier: proposal.barrier || params.barrier,
                buy_price: proposal.ask_price,
                bid_price: proposal.ask_price,
                payout: proposal.payout,
                profit: 0,
                profit_percentage: 0,
                purchase_time: Math.floor(Date.now() / 1000),
                is_valid_to_sell: false,
                is_sold: false,
                status: 'open',
                longcode: buy.longcode || '',
                shortcode: buy.shortcode,
                growth_rate: proposal.growth_rate,
                ticks: [],
            };

            this.openPositions.set(contractId, initialPosition);
            this.notifyPositionsListeners();

            // Subscribe to live open contract stream
            this.subscribeOpenContract(contractId);

            return { success: true, contract_id: contractId };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Trade purchase encountered an error.' };
        }
    }

    // ==========================================
    // OPEN POSITIONS & POC STREAMING
    // ==========================================

    private async subscribeOpenContract(contractId: number) {
        const api = await this.getApi();
        if (!api) return;

        api.send({
            proposal_open_contract: 1,
            contract_id: contractId,
            subscribe: 1,
        })
            .then((res: any) => {
                if (res?.subscription?.id) {
                    this.positionSubscriptions.set(contractId, {
                        subId: res.subscription.id,
                    });
                }
                if (res?.proposal_open_contract) {
                    this.handleOpenContractMessage(res.proposal_open_contract);
                }
            })
            .catch(err => {
                console.warn(`[DTraderAdapter] Error subscribing to contract ${contractId}:`, err);
            });
    }

    private handleOpenContractMessage(poc: any) {
        const contractId = Number(poc.contract_id);
        if (!contractId) return;

        const isSold = Boolean(poc.is_sold === 1 || poc.status === 'won' || poc.status === 'lost' || poc.status === 'sold');
        const profit = Number(poc.profit ?? 0);
        const buyPrice = Number(poc.buy_price ?? 0);
        const profitPct = buyPrice > 0 ? (profit / buyPrice) * 100 : 0;

        let existing = this.openPositions.get(contractId);
        if (!existing) {
            existing = {
                contract_id: contractId,
                transaction_id: Number(poc.transaction_ids?.buy || contractId),
                contract_type: poc.contract_type,
                underlying: poc.underlying,
                display_name: poc.display_name || poc.longcode,
                buy_price: buyPrice,
                bid_price: Number(poc.bid_price ?? buyPrice),
                payout: Number(poc.payout ?? 0),
                profit,
                profit_percentage: profitPct,
                purchase_time: Number(poc.purchase_time || poc.date_start || Date.now() / 1000),
                is_valid_to_sell: Boolean(poc.is_valid_to_sell),
                is_sold: isSold,
                status: isSold ? (profit >= 0 ? 'won' : 'lost') : 'open',
                longcode: poc.longcode || '',
                shortcode: poc.shortcode,
                ticks: [],
            };
        }

        // Update live stats
        existing.bid_price = Number(poc.bid_price ?? existing.bid_price);
        existing.current_spot = Number(poc.current_spot ?? existing.current_spot);
        existing.entry_spot = Number(poc.entry_spot ?? existing.entry_spot);
        existing.barrier = poc.barrier ?? existing.barrier;
        existing.high_barrier = poc.high_barrier ?? existing.high_barrier;
        existing.low_barrier = poc.low_barrier ?? existing.low_barrier;
        existing.tick_count = poc.tick_count ? Number(poc.tick_count) : existing.tick_count;
        existing.current_tick = poc.tick_passed ? Number(poc.tick_passed) : existing.current_tick;
        existing.profit = profit;
        existing.profit_percentage = profitPct;
        existing.is_valid_to_sell = Boolean(poc.is_valid_to_sell);
        existing.is_sold = isSold;
        existing.status = isSold ? (profit >= 0 ? 'won' : 'lost') : 'open';

        // Collect tick stream if available
        if (poc.tick_stream && Array.isArray(poc.tick_stream)) {
            existing.ticks = poc.tick_stream.map((t: any, index: number) => ({
                epoch: Number(t.epoch),
                quote: Number(t.tick ?? t.quote),
                tick_number: index + 1,
            }));
        } else if (poc.current_spot && poc.current_spot_time) {
            const lastTick = existing.ticks?.[existing.ticks.length - 1];
            if (!lastTick || lastTick.epoch !== poc.current_spot_time) {
                if (!existing.ticks) existing.ticks = [];
                existing.ticks.push({
                    epoch: Number(poc.current_spot_time),
                    quote: Number(poc.current_spot),
                    tick_number: existing.ticks.length + 1,
                });
            }
        }

        if (isSold) {
            // Contract has settled!
            this.openPositions.delete(contractId);

            // Forget subscription
            const sub = this.positionSubscriptions.get(contractId);
            if (sub?.subId && api_base.api) {
                api_base.api.send({ forget: sub.subId }).catch(() => {});
            }
            this.positionSubscriptions.delete(contractId);

            // Create settled contract record
            const settled: SettledContract = {
                contract_id: contractId,
                transaction_id: Number(poc.transaction_ids?.buy || contractId),
                contract_type: poc.contract_type,
                underlying: poc.underlying,
                display_name: existing.display_name,
                buy_price: buyPrice,
                sell_price: Number(poc.sell_price ?? (buyPrice + profit)),
                profit,
                status: profit >= 0 ? 'won' : 'lost',
                purchase_time: Number(poc.purchase_time || poc.date_start || Date.now() / 1000),
                sell_time: Number(poc.sell_time || poc.date_expiry || Date.now() / 1000),
                entry_spot: Number(poc.entry_spot ?? existing.entry_spot),
                exit_spot: Number(poc.exit_tick ?? poc.current_spot),
                barrier: poc.barrier,
                longcode: poc.longcode || existing.longcode,
                shortcode: poc.shortcode,
                ticks: existing.ticks,
            };

            this.settledContracts.unshift(settled);
            this.saveSettledContractsToStorage();

            // Notify listeners
            this.notifySettledListeners(settled);
            this.notifyPositionsListeners();

            globalObserver.emit('contract.status', {
                id: 'contract.settled',
                data: settled,
            });
        } else {
            this.openPositions.set(contractId, existing);
            this.notifyPositionsListeners();
        }
    }

    public async sellContract(contractId: number): Promise<{ success: boolean; error?: string }> {
        const api = await this.getApi();
        if (!api) return { success: false, error: 'Connection unavailable.' };

        try {
            const res = await api.send({
                sell: contractId,
                price: 0, // 0 = market bid price
            });

            if (res?.error) {
                return { success: false, error: res.error.message || 'Unable to close contract early.' };
            }

            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Sell request failed.' };
        }
    }

    public onPositionsChange(listener: PositionsListener) {
        this.positionsListeners.add(listener);
        listener(Array.from(this.openPositions.values()));
        return () => this.positionsListeners.delete(listener);
    }

    private notifyPositionsListeners() {
        const positions = Array.from(this.openPositions.values());
        this.positionsListeners.forEach(l => l(positions));
    }

    public onContractSettled(listener: SettledListener) {
        this.settledListeners.add(listener);
        return () => this.settledListeners.delete(listener);
    }

    private notifySettledListeners(contract: SettledContract) {
        this.settledListeners.forEach(l => l(contract));
    }

    public getSettledContracts(): SettledContract[] {
        return [...this.settledContracts];
    }

    public clearSettledHistory() {
        this.settledContracts = [];
        this.saveSettledContractsToStorage();
    }

    private clearAllPositionStreams() {
        const api = api_base.api;
        this.positionSubscriptions.forEach(sub => {
            if (api && sub.subId) {
                api.send({ forget: sub.subId }).catch(() => {});
            }
        });
        this.positionSubscriptions.clear();
        this.openPositions.clear();
        this.notifyPositionsListeners();
    }

    private loadSettledContractsFromStorage() {
        try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
                const stored = sessionStorage.getItem('dtrader_settled_contracts');
                if (stored) {
                    this.settledContracts = JSON.parse(stored);
                }
            }
        } catch {}
    }

    private saveSettledContractsToStorage() {
        try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
                sessionStorage.setItem('dtrader_settled_contracts', JSON.stringify(this.settledContracts.slice(0, 50)));
            }
        } catch {}
    }
}

export const dtraderAdapter = new DTraderAdapter();
