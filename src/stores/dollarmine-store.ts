import { action, makeObservable, observable, runInAction } from 'mobx';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import RootStore from './root-store';
// import { localize } from '@deriv-com/translations';
// import { serialize } from 'v8';
import { normalizeTradeParameters } from '@/utils/trade-purchase';

export type TStrategy = 'OVER_UNDER' | 'EVEN_ODD' | 'DIFFERS';
export type TPrediction = 'UNDER' | 'OVER' | 'EVEN' | 'ODD' | 'DIFFERS' | 'WAIT';

export interface MarketStats {
    symbol: string;
    displayName: string;
    recentDigits: number[];
    is1s: boolean;
    currentPrice: string;
    priceDirection: 'UP' | 'DOWN' | 'FLAT';
    // Over/Under
    underPercent: number;
    overPercent: number;
    isOverUnderIncreasing: boolean;
    // Even/Odd
    evenPercent: number;
    oddPercent: number;
    isEvenOddIncreasing: boolean;
    // Differs
    digitFrequencies: number[];
}

export default class DollarmineStore {
    root_store: RootStore;

    @observable accessor active_symbols: { symbol: string; display_name: string; is1s: boolean }[] = [];
    @observable accessor market_stats: Map<string, MarketStats> = new Map();
    @observable accessor is_scanning = false;
    
    // Trading config
    @observable accessor viewing_market: string | null = null;
    @observable accessor stake = 1;
    @observable accessor max_runs = 5;
    
    // Strategy State: OVER_UNDER
    @observable accessor ou_active_market: string | null = null;
    @observable accessor ou_is_auto_trading = false;
    @observable accessor ou_runs = 0;
    @observable accessor ou_cooldown_until: number | null = null;
    @observable accessor ou_last_prediction: string | null = null;
    
    // Strategy State: EVEN_ODD
    @observable accessor eo_active_market: string | null = null;
    @observable accessor eo_is_auto_trading = false;
    @observable accessor eo_runs = 0;
    @observable accessor eo_cooldown_until: number | null = null;
    @observable accessor eo_last_prediction: string | null = null;
    
    // Strategy State: DIFFERS
    @observable accessor diff_active_market: string | null = null;
    @observable accessor diff_is_auto_trading = false;
    @observable accessor diff_runs = 0;
    @observable accessor diff_prediction: number | null = null;
    
    // Trade Log
    @observable accessor trade_log: { time: string; strategy: string; market: string; contract: string; result: 'WIN' | 'LOSS'; profit: number }[] = [];

    private _tick_subs: Map<string, any> = new Map();
    private _execution_lock: Map<TStrategy, boolean> = new Map();

    constructor(root_store: RootStore) {
        makeObservable(this);
        this.root_store = root_store;
    }

    private isApiReady(): boolean {
        return !!(api_base.api && api_base.api.connection && api_base.api.connection.readyState === 1);
    }

    @action
    startScanning() {
        if (!this.isApiReady()) {
            setTimeout(() => this.startScanning(), 1000);
            return;
        }
        this.is_scanning = true;
        this.fetchActiveSymbols();
    }

    @action
    stopScanning() {
        this.is_scanning = false;
        this.ou_is_auto_trading = false;
        this.eo_is_auto_trading = false;
        this.diff_is_auto_trading = false;
        this._tick_subs.forEach(sub => sub.unsubscribe());
        this._tick_subs.clear();
    }

    @action
    private fetchActiveSymbols() {
        api_base.api!.send({ active_symbols: 'brief' }).then((res: any) => {
            if (res?.active_symbols) {
                const filtered = res.active_symbols
                    .filter((s: any) => s.market === 'synthetic_index' && s.submarket === 'random_index')
                    .map((s: any) => ({ 
                        symbol: s.symbol, 
                        display_name: s.display_name,
                        is1s: s.symbol ? s.symbol.includes('1S') : false
                    }));
                runInAction(() => {
                    this.active_symbols = filtered;
                    this.subscribeToAllMarkets();
                });
            }
        });
    }

    @action
    private subscribeToAllMarkets() {
        this.active_symbols.forEach(market => {
            if (!this._tick_subs.has(market.symbol)) {
                // Initial history
                api_base.api!.send({
                    ticks_history: market.symbol,
                    count: 100,
                    end: 'latest',
                    style: 'ticks',
                }).then((res: any) => {
                     if (res.history || res.ticks_history) {
                         const hist = res.history || res.ticks_history;
                         const prices = hist.prices || [];
                         const digits = prices.map((p: any) => parseInt(p.toString().slice(-1)));
                         const lastPrice = prices[prices.length - 1]?.toString() || '0';
                         this.updateMarketStats(market.symbol, market.display_name, market.is1s, digits, lastPrice);
                     }
                });

                // Stream
                const sub = api_base.api!.onMessage().subscribe((msg: any) => {
                    const data = msg?.data || msg;
                    if (data.msg_type === 'tick' && data.tick?.symbol === market.symbol && data.tick?.quote) {
                        const quote = data.tick.quote.toString();
                        const digit = parseInt(quote.slice(-1));
                        this.handleNewTick(market.symbol, digit, quote);
                    }
                });
                this._tick_subs.set(market.symbol, sub);
                api_base.api!.send({ ticks: market.symbol, subscribe: 1 });
            }
        });
    }

    @action
    private handleNewTick(symbol: string, digit: number, quote: string) {
        if (!this.market_stats.has(symbol)) return;
        
        const stats = this.market_stats.get(symbol)!;
        const newDigits = [...stats.recentDigits, digit].slice(-1000); 
        
        this.updateMarketStats(symbol, stats.displayName, stats.is1s, newDigits, quote);
        
        if (this.is_scanning) {
            this.evaluateOverUnder(symbol);
            this.evaluateEvenOdd(symbol);
            this.evaluateDiffers(symbol);
        }
    }

    @action
    private updateMarketStats(symbol: string, displayName: string, is1s: boolean, digits: number[], quote: string) {
        const prevStats = this.market_stats.get(symbol);
        const prevPrice = prevStats ? Number(prevStats.currentPrice) : Number(quote);
        const currentPrice = Number(quote);
        const priceDirection = currentPrice > prevPrice ? 'UP' : currentPrice < prevPrice ? 'DOWN' : (prevStats?.priceDirection || 'FLAT');

        if (digits.length < 60) {
            this.market_stats.set(symbol, {
                symbol, displayName, recentDigits: digits, is1s,
                currentPrice: quote, priceDirection,
                underPercent: 0, overPercent: 0, isOverUnderIncreasing: false,
                evenPercent: 0, oddPercent: 0, isEvenOddIncreasing: false,
                digitFrequencies: Array(10).fill(0)
            });
            return;
        }

        const last60 = digits.slice(-60);
        
        // Over/Under stats
        const underCount = last60.filter(d => d < 5).length;
        const overCount = last60.filter(d => d >= 5).length;
        const underPercent = (underCount / 60) * 100;
        const overPercent = (overCount / 60) * 100;
        
        // Trend tracking (compare last 60 with previous 60)
        let isOuIncreasing = false;
        if (digits.length >= 120) {
            const prev60 = digits.slice(-120, -60);
            const prevUnder = prev60.filter(d => d < 5).length / 60 * 100;
            const prevOver = prev60.filter(d => d >= 5).length / 60 * 100;
            isOuIncreasing = Math.max(underPercent, overPercent) > Math.max(prevUnder, prevOver);
        }

        // Even/Odd stats
        const evenCount = last60.filter(d => d % 2 === 0).length;
        const oddCount = last60.filter(d => d % 2 !== 0).length;
        const evenPercent = (evenCount / 60) * 100;
        const oddPercent = (oddCount / 60) * 100;
        
        let isEoIncreasing = false;
        if (digits.length >= 120) {
            const prev60 = digits.slice(-120, -60);
            const prevEven = prev60.filter(d => d % 2 === 0).length / 60 * 100;
            const prevOdd = prev60.filter(d => d % 2 !== 0).length / 60 * 100;
            isEoIncreasing = Math.max(evenPercent, oddPercent) > Math.max(prevEven, prevOdd);
        }

        // Digit frequencies (for Differs)
        const freqs = Array(10).fill(0);
        last60.forEach(d => freqs[d]++);
        const digitFrequencies = freqs.map(f => (f / 60) * 100);

        this.market_stats.set(symbol, {
            symbol, displayName, recentDigits: digits, is1s,
            currentPrice: quote, priceDirection,
            underPercent, overPercent, isOverUnderIncreasing: isOuIncreasing,
            evenPercent, oddPercent, isEvenOddIncreasing: isEoIncreasing,
            digitFrequencies
        });
    }

    // --- OVER/UNDER ENGINE ---
    @action
    private evaluateOverUnder(symbol: string) {
        if (!this.ou_is_auto_trading) return;
        if (this.ou_cooldown_until && Date.now() < this.ou_cooldown_until) return;
        if (this._execution_lock.get('OVER_UNDER')) return;

        // Auto market switch - find best market
        // let bestMarket = symbol;
        if (!this.ou_active_market || (this.market_stats.get(symbol)?.underPercent || 0) > (this.market_stats.get(this.ou_active_market)?.underPercent || 0)) {
            // Very simplified auto-selection
            // this.ou_active_market = symbol;
        }

        const targetMarket = this.ou_active_market || symbol;
        if (symbol !== targetMarket) return;

        const stats = this.market_stats.get(targetMarket);
        if (!stats) return;

        if (stats.underPercent > 60 && stats.isOverUnderIncreasing) {
            this.processUnderEntry(stats);
        } else if (stats.overPercent > 60 && stats.isOverUnderIncreasing) {
            this.processOverEntry(stats);
        }
    }

    private processUnderEntry(stats: MarketStats) {
        // Find most, 2nd most, and least appearing digits
        const sortedFreqs = [...stats.digitFrequencies].map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
        const mostAppearingDigit = sortedFreqs[0].i;
        const secondMostAppearingDigit = sortedFreqs[1].i;
        const leastAppearingDigit = sortedFreqs[9].i;

        // Check if top 2 and least appearing are all under 5
        const topDigitsInUnder = mostAppearingDigit < 5 && secondMostAppearingDigit < 5;
        const leastDigitInUnder = leastAppearingDigit < 5;

        // Check if all over digits (5-9) individually have < 10%
        const allOverLessThan10 = [5, 6, 7, 8, 9].every(d => stats.digitFrequencies[d] < 10);

        // Check if the last 15 ticks are primarily Under (require at least 12 out of 15 to be < 5)
        const last15 = stats.recentDigits.slice(-15);
        const underCountInLast15 = last15.filter(d => d < 5).length;
        const last15AreMostlyUnder = underCountInLast15 >= 12;

        if (topDigitsInUnder && leastDigitInUnder && allOverLessThan10 && last15AreMostlyUnder) {
            // Find highest under digit based on frequencies
            const underDigits = sortedFreqs.filter(d => d.i < 5);
            const highestUnderDigit = underDigits.length > 0 ? underDigits[0].i : 0;
            
            // Wait for highest to appear for entry
            if (last15[last15.length - 1] === highestUnderDigit) {
                this.executeTrade('OVER_UNDER', stats.symbol, 'DIGITUNDER', highestUnderDigit); // Under highest
            }
        }
    }

    private processOverEntry(stats: MarketStats) {
        const last15 = stats.recentDigits.slice(-15);
        if (last15.every(d => d >= 5)) {
            const overFreqs = stats.digitFrequencies.slice(5);
            const highestOverIdx = overFreqs.indexOf(Math.max(...overFreqs)) + 5;
            
            if (last15[last15.length - 1] === highestOverIdx) {
                const underTotal = stats.digitFrequencies.slice(0, 5).reduce((a, b) => a + b, 0);
                if (underTotal < 10) {
                    this.executeTrade('OVER_UNDER', stats.symbol, 'DIGITOVER', 4); // Over 4
                }
            }
        }
    }

    // --- EVEN/ODD ENGINE ---
    @action
    private evaluateEvenOdd(symbol: string) {
        if (!this.eo_is_auto_trading) return;
        if (this.eo_cooldown_until && Date.now() < this.eo_cooldown_until) return;
        if (this._execution_lock.get('EVEN_ODD')) return;

        const targetMarket = this.eo_active_market || symbol;
        if (symbol !== targetMarket) return;

        const stats = this.market_stats.get(targetMarket);
        if (!stats) return;

        if (stats.evenPercent >= 60 && stats.isEvenOddIncreasing) {
            const recent = stats.recentDigits;
            // Check last 7 were even (before the trigger pattern)
            const seq = recent.slice(-10); // Look at last 10
            
            // Pattern: 7 Even -> 2+ Odd -> 1 Even
            if (seq[seq.length-1] % 2 === 0) { // last is even
                if (seq[seq.length-2] % 2 !== 0 && seq[seq.length-3] % 2 !== 0) { // prev 2 were odd
                    this.executeTrade('EVEN_ODD', stats.symbol, 'DIGITEVEN');
                }
            }
        } else if (stats.oddPercent >= 60 && stats.isEvenOddIncreasing) {
            const seq = stats.recentDigits.slice(-10);
            // Pattern: 7 Odd -> 2+ Even -> 1 Odd
            if (seq[seq.length-1] % 2 !== 0) {
                if (seq[seq.length-2] % 2 === 0 && seq[seq.length-3] % 2 === 0) {
                    this.executeTrade('EVEN_ODD', stats.symbol, 'DIGITODD');
                }
            }
        }
    }

    // --- DIFFERS ENGINE ---
    @action
    private evaluateDiffers(symbol: string) {
        if (!this.diff_is_auto_trading) return;
        if (this._execution_lock.get('DIFFERS')) return;

        const targetMarket = this.diff_active_market || symbol;
        if (symbol !== targetMarket) return;

        const stats = this.market_stats.get(targetMarket);
        if (!stats) return;

        // Find constant digit: < 10%, not highest, not 2nd highest, not least
        const freqs = stats.digitFrequencies;
        const sorted = [...freqs].map((v, i) => ({v, i})).sort((a, b) => b.v - a.v);
        
        let targetDigit: number | null = null;
        for (let i = 2; i < sorted.length - 1; i++) { // Skip 1st, 2nd, and last
            if (sorted[i].v > 0 && sorted[i].v < 10) {
                targetDigit = sorted[i].i;
                break;
            }
        }

        if (targetDigit !== null) {
            this.diff_prediction = targetDigit;
            const lastDigit = stats.recentDigits[stats.recentDigits.length - 1];
            if (lastDigit === targetDigit) {
                // If it just appeared, Differ on it for the next tick
                this.executeTrade('DIFFERS', stats.symbol, 'DIGITDIFF', targetDigit);
            }
        }
    }

    // --- EXECUTION ---
    @action
    private async executeTrade(strategy: TStrategy, symbol: string, contract_type: string, barrier?: number) {
        this._execution_lock.set(strategy, true);
        
        try {
            // 1. Get Proposal
const proposalReq = normalizeTradeParameters({
            proposal: 1,
            amount: this.stake,
            basis: 'stake',
            contract_type,
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            symbol,
            ...(barrier !== undefined ? { barrier: barrier.toString() } : {}),
        });

            const proposalRes = await (api_base.api as any).send(proposalReq);
            if (proposalRes.error || !proposalRes.proposal?.id) {
                throw new Error(proposalRes.error?.message || 'Failed to get proposal');
            }

            // 2. Buy Contract
            const buyRes = await (api_base.api as any).send({
                buy: proposalRes.proposal.id,
                price: this.stake
            });

            if (buyRes.error) {
                throw new Error(buyRes.error.message);
            }

            // We let the TransactionsStore handle the open contract tracking,
            // but we add it to our log optimistically or wait for stream.
            // For simplicity, we just add it to our own log as pending and update runs.
            
            runInAction(() => {
                this.trade_log.unshift({
                    time: new Date().toLocaleTimeString(),
                    strategy,
                    market: symbol,
                    contract: contract_type,
                    result: 'WIN', // Placeholder until evaluated
                    profit: 0
                });

                // Update runs
                if (strategy === 'OVER_UNDER') {
                    this.ou_runs++;
                    if (this.ou_runs >= this.max_runs) {
                        this.ou_runs = 0;
                        this.ou_cooldown_until = Date.now() + 60000; // 1 min cooldown
                    }
                } else if (strategy === 'EVEN_ODD') {
                    this.eo_runs++;
                    if (this.eo_runs >= this.max_runs) {
                        this.eo_runs = 0;
                        this.eo_cooldown_until = Date.now() + 60000;
                    }
                } else if (strategy === 'DIFFERS') {
                    this.diff_runs++;
                }
            });

            // Unlock after 3 seconds to avoid double entry on the same tick stream
            setTimeout(() => {
                runInAction(() => this._execution_lock.set(strategy, false));
            }, 3000);

        } catch (error) {
            console.error('[Dollarmine] Trade Execution Error:', error);
            runInAction(() => this._execution_lock.set(strategy, false));
        }
    }
}
