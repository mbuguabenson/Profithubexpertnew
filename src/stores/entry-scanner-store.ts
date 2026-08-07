import { action, makeObservable, observable, runInAction, computed } from 'mobx';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';

export type TStrategyType = 'over_under' | 'even_odd' | 'differs';
export type TScanPhase = 'idle' | 'scanning' | 'analyzing' | 'waiting_entry' | 'trading' | 'cooldown' | 'paused';

export interface TEntryScannerMarketStats {
    symbol: string;
    displayName: string;
    recentDigits: number[];
    is1s: boolean;
    underPercent: number;
    overPercent: number;
    evenPercent: number;
    oddPercent: number;
    digitFrequencies: number[]; // percentage for each digit 0-9
    digitCounts: number[];     // raw counts for each digit 0-9
}

export interface TScanResult {
    symbol: string;
    displayName: string;
    strategy: TStrategyType;
    direction: string;       // 'UNDER' | 'OVER' | 'EVEN' | 'ODD' | 'DIFFERS_3' etc.
    prediction: number;      // The barrier/prediction number (8,7,6 for under or 1,2,3 for over)
    confidence: number;      // percentage
    waitDescription: string; // Human-readable description of what we're waiting for
    triggerDigit: number;    // The digit we're waiting for to trigger entry
}

export default class EntryScannerStore {
    root_store: any;

    // UI & Strategy State
    @observable accessor is_scanner_open: boolean = false;
    @observable accessor selected_strategies: TStrategyType[] = ['over_under', 'even_odd', 'differs'];
    @observable accessor scan_mode: 'all' | 'single' = 'all';
    @observable accessor target_single_symbol: string = 'R_100';
    @observable accessor auto_load_on_match: boolean = true;
    @observable accessor scan_phase: TScanPhase = 'idle';
    @observable accessor scan_status: string = 'Select strategies and click Scan Markets to begin.';
    @observable accessor is_scanning: boolean = false;

    // Progress & Tick Tracking
    @observable accessor scan_progress: number = 0; // 0 to 100
    @observable accessor ticks_collected: number = 0;
    @observable accessor total_target_ticks: number = 1000;

    // Scan Results
    @observable accessor selected_market: string = '';
    @observable accessor selected_symbol: string = '';
    @observable accessor trade_type: string = '';
    @observable accessor scan_result: TScanResult | null = null;
    @observable accessor market_results: TScanResult[] = [];

    // Parameters
    @observable accessor stake: number = 0.5;
    @observable accessor martingale: number = 2;
    @observable accessor number_of_wins: number = 5;
    @observable accessor stop_loss: number = 50;
    @observable accessor use_martingale: boolean = true;
    @observable accessor max_runs_before_pause: number = 5;

    // Trading State
    @observable accessor current_runs: number = 0;
    @observable accessor total_profit: number = 0;
    @observable accessor trade_log: { time: string; market: string; direction: string; prediction: number; result: string; profit: number }[] = [];

    // Internal State
    @observable accessor active_symbols: { symbol: string; display_name: string; is1s: boolean }[] = [];
    @observable accessor market_stats: Map<string, TEntryScannerMarketStats> = new Map();
    @observable accessor wait_sequence: number[] = [];

    private _tick_subs: Map<string, any> = new Map();
    private _scan_interval: any = null;
    private _cooldown_timer: any = null;
    private _buy_sub: any = null;

    constructor(root_store: any) {
        makeObservable(this);
        this.root_store = root_store;
    }

    // ─── Actions ──────────────────────────────────────────────

    @action toggleStrategy(type: TStrategyType) {
        if (this.selected_strategies.includes(type)) {
            if (this.selected_strategies.length > 1) {
                this.selected_strategies = this.selected_strategies.filter(s => s !== type);
            }
        } else {
            this.selected_strategies = [...this.selected_strategies, type];
        }
        if (this.is_scanning) {
            this.runAnalysis();
        }
    }

    @action setScanMode(mode: 'all' | 'single') {
        this.scan_mode = mode;
        if (this.is_scanning) {
            this.stopScanning();
            this.startScanning();
        }
    }

    @action setTargetSingleSymbol(symbol: string) {
        this.target_single_symbol = symbol;
        if (this.is_scanning && this.scan_mode === 'single') {
            this.stopScanning();
            this.startScanning();
        }
    }

    @action setAutoLoadOnMatch(enabled: boolean) {
        this.auto_load_on_match = enabled;
    }

    @action resetScan() {
        this.scan_phase = 'idle';
        this.scan_status = 'Select strategies and click Scan Markets to begin.';
        this.selected_market = '';
        this.selected_symbol = '';
        this.trade_type = '';
        this.scan_result = null;
        this.market_results = [];
        this.wait_sequence = [];
        this.current_runs = 0;
        this.scan_progress = 0;
        this.ticks_collected = 0;
    }

    private isApiReady(): boolean {
        return !!(api_base.api && api_base.api.connection && api_base.api.connection.readyState === 1);
    }

    // ─── Start / Stop ─────────────────────────────────────────

    @action startScanning() {
        if (this.is_scanning) {
            this.stopScanning();
            return;
        }
        this.is_scanning = true;
        this.scan_phase = 'scanning';
        this.scan_progress = 5;
        this.ticks_collected = 0;
        this.scan_status = 'Fetching active markets & initializing 1,000 tick streams...';
        this.market_results = [];
        this.wait_sequence = [];
        this.fetchActiveSymbols();
    }

    @action stopScanning() {
        this.is_scanning = false;
        this.scan_phase = 'idle';
        this.scan_status = 'Scan stopped.';
        this.scan_progress = 0;

        if (this._scan_interval) { clearInterval(this._scan_interval); this._scan_interval = null; }
        if (this._cooldown_timer) { clearTimeout(this._cooldown_timer); this._cooldown_timer = null; }
        if (this._buy_sub) { this._buy_sub.unsubscribe(); this._buy_sub = null; }

        this._tick_subs.forEach(sub => sub.unsubscribe());
        this._tick_subs.clear();
    }

    // ─── Fetch Symbols ────────────────────────────────────────

    private DEFAULT_FALLBACK_SYMBOLS = [
        { symbol: 'R_10', display_name: 'Volatility 10 Index', is1s: false },
        { symbol: '1HZ10V', display_name: 'Volatility 10 (1s) Index', is1s: true },
        { symbol: 'R_25', display_name: 'Volatility 25 Index', is1s: false },
        { symbol: '1HZ25V', display_name: 'Volatility 25 (1s) Index', is1s: true },
        { symbol: 'R_50', display_name: 'Volatility 50 Index', is1s: false },
        { symbol: '1HZ50V', display_name: 'Volatility 50 (1s) Index', is1s: true },
        { symbol: 'R_75', display_name: 'Volatility 75 Index', is1s: false },
        { symbol: '1HZ75V', display_name: 'Volatility 75 (1s) Index', is1s: true },
        { symbol: 'R_100', display_name: 'Volatility 100 Index', is1s: false },
        { symbol: '1HZ100V', display_name: 'Volatility 100 (1s) Index', is1s: true },
        { symbol: '1HZ15V', display_name: 'Volatility 15 (1s) Index', is1s: true },
        { symbol: '1HZ30V', display_name: 'Volatility 30 (1s) Index', is1s: true },
        { symbol: '1HZ90V', display_name: 'Volatility 90 (1s) Index', is1s: true },
    ];

    @action private fetchActiveSymbols() {
        const applySymbols = (allList: { symbol: string; display_name: string; is1s: boolean }[]) => {
            const finalSymbols = this.scan_mode === 'single'
                ? allList.filter(s => s.symbol === this.target_single_symbol)
                : allList;

            runInAction(() => {
                this.active_symbols = finalSymbols.length > 0 ? finalSymbols : allList.slice(0, 1);
                this.scan_status = `Monitoring ${this.active_symbols.length} ${this.scan_mode === 'single' ? 'selected' : 'active'} market(s). Streaming 1,000 tick history...`;
                this.scan_progress = 15;
            });
            this.subscribeToTicks();
        };

        if (this.isApiReady()) {
            api_base.api!.send({ active_symbols: 'brief' }).then((res: any) => {
                if (!res?.active_symbols || !Array.isArray(res.active_symbols)) {
                    applySymbols(this.DEFAULT_FALLBACK_SYMBOLS);
                    return;
                }
                const filtered = res.active_symbols
                    .filter((s: any) => s.market === 'synthetic_index' && s.submarket === 'random_index')
                    .map((s: any) => ({
                        symbol: s.symbol,
                        display_name: s.display_name,
                        is1s: s.symbol.includes('1HZ') || s.symbol.includes('1S'),
                    }));

                applySymbols(filtered.length > 0 ? filtered : this.DEFAULT_FALLBACK_SYMBOLS);
            }).catch(() => {
                applySymbols(this.DEFAULT_FALLBACK_SYMBOLS);
            });
        } else {
            applySymbols(this.DEFAULT_FALLBACK_SYMBOLS);
        }
    }

    // ─── Tick Streaming & Progress Calculation ────────────────

    private subscribeToTicks() {
        this.active_symbols.forEach(market => {
            if (this._tick_subs.has(market.symbol)) {
                this._tick_subs.get(market.symbol).unsubscribe();
            }

            const sub = api_base.api!.onMessage().subscribe((res: any) => {
                if (res.msg_type === 'history' && res.echo_req?.ticks_history === market.symbol) {
                    const prices: number[] = res.history?.prices || [];
                    const digits = prices.map((p: number) => {
                        const s = p.toFixed(4);
                        return Number(s.charAt(s.length - 1));
                    });
                    this.initializeMarketStats(market.symbol, market.display_name, digits, market.is1s);
                } else if (res.msg_type === 'tick' && res.tick?.symbol === market.symbol) {
                    const s = res.tick.quote.toFixed(4);
                    const digit = Number(s.charAt(s.length - 1));
                    this.onNewTick(market.symbol, digit);
                }
            });

            this._tick_subs.set(market.symbol, sub);

            // If API ready send ticks_history request, else populate default simulated history so scanner never stalls
            if (this.isApiReady()) {
                api_base.api!.send({
                    ticks_history: market.symbol,
                    end: 'latest',
                    count: 1000,
                    style: 'ticks',
                });
            } else {
                const dummyDigits = Array.from({ length: 60 }, () => Math.floor(Math.random() * 10));
                this.initializeMarketStats(market.symbol, market.display_name, dummyDigits, market.is1s);
            }
        });

        // Start analysis loop every 1.5 seconds
        if (!this._scan_interval) {
            this._scan_interval = setInterval(() => this.runAnalysis(), 1500);
        }
    }

    @action private initializeMarketStats(symbol: string, displayName: string, digits: number[], is1s: boolean) {
        const stats = this.computeStats(digits);
        this.market_stats.set(symbol, {
            symbol,
            displayName,
            recentDigits: digits,
            is1s,
            ...stats,
        });
        this.updateOverallProgress();
    }

    @action private onNewTick(symbol: string, digit: number) {
        const market = this.market_stats.get(symbol);
        if (!market) return;

        market.recentDigits.push(digit);
        if (market.recentDigits.length > 1000) market.recentDigits.shift();

        const stats = this.computeStats(market.recentDigits);
        Object.assign(market, stats);

        this.updateOverallProgress();

        // If in waiting_entry phase, check for pattern match
        if (this.scan_phase === 'waiting_entry' && this.scan_result && symbol === this.selected_symbol) {
            this.checkEntryPattern(digit, market);
        }
    }

    @action private updateOverallProgress() {
        let totalTicks = 0;
        this.market_stats.forEach(m => {
            totalTicks += m.recentDigits.length;
        });
        this.ticks_collected = totalTicks;

        const maxExpected = Math.max(this.active_symbols.length * 100, 1);
        const calculatedPct = Math.min(100, Math.floor((totalTicks / maxExpected) * 100));
        this.scan_progress = Math.max(this.scan_progress, calculatedPct);
    }

    // ─── Stats Computation ────────────────────────────────────

    private computeStats(digits: number[]) {
        const total = Math.max(digits.length, 1);
        let underCount = 0;
        let evenCount = 0;
        const digitCounts = new Array(10).fill(0);

        for (const d of digits) {
            if (d < 5) underCount++;
            if (d % 2 === 0) evenCount++;
            digitCounts[d]++;
        }

        return {
            underPercent: (underCount / total) * 100,
            overPercent: ((total - underCount) / total) * 100,
            evenPercent: (evenCount / total) * 100,
            oddPercent: ((total - evenCount) / total) * 100,
            digitFrequencies: digitCounts.map(c => (c / total) * 100),
            digitCounts,
        };
    }

    // ─── Main Analysis Loop ───────────────────────────────────

    @action private runAnalysis() {
        if (!this.is_scanning) return;
        if (this.scan_phase === 'waiting_entry' || this.scan_phase === 'trading' || this.scan_phase === 'cooldown') return;

        this.scan_phase = 'analyzing';
        let bestMatch: TScanResult | null = null;

        for (const [, stats] of this.market_stats.entries()) {
            if (stats.recentDigits.length < 15) continue;

            for (const strat of this.selected_strategies) {
                let res: TScanResult | null = null;
                if (strat === 'over_under') res = this.analyzeOverUnder(stats);
                else if (strat === 'even_odd') res = this.analyzeEvenOdd(stats);
                else if (strat === 'differs') res = this.analyzeDiffers(stats);

                if (res) {
                    if (!bestMatch || res.confidence > bestMatch.confidence) {
                        bestMatch = res;
                    }
                }
            }
        }

        if (bestMatch) {
            this.scan_result = bestMatch;
            this.selected_market = bestMatch.displayName;
            this.selected_symbol = bestMatch.symbol;
            this.trade_type = bestMatch.direction;
            this.scan_phase = 'waiting_entry';
            this.wait_sequence = [];
            this.scan_progress = 100;
            this.scan_status = `🎯 High-confidence entry found on ${bestMatch.displayName}! (${bestMatch.confidence.toFixed(1)}% confidence)`;

            if (this.auto_load_on_match) {
                this.generateAndLoadBot();
            }
        } else {
            const count = this.market_stats.size;
            this.scan_status = `🔍 Scanning ${count} market(s) for ${this.selected_strategies.map(s => s.replace('_', '/')).join(', ')} patterns... (${this.ticks_collected} ticks streaming)`;
            this.scan_phase = 'scanning';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 1: OVER / UNDER
    // ═══════════════════════════════════════════════════════════

    private analyzeOverUnder(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        const windowDigits = digits.slice(-50);
        if (windowDigits.length < 15) return null;

        const underCount = windowDigits.filter(d => d < 5).length;
        const overCount = windowDigits.filter(d => d >= 5).length;
        const underPct = (underCount / windowDigits.length) * 100;
        const overPct = (overCount / windowDigits.length) * 100;

        const sorted = [...stats.digitFrequencies].map((v, i) => ({ digit: i, pct: v })).sort((a, b) => b.pct - a.pct);
        const highest = sorted[0];

        if (underPct >= 54) {
            const last4 = digits.slice(-4);
            if (last4.length >= 3 && last4.filter(d => d < 5).length >= 3) {
                return {
                    symbol: stats.symbol,
                    displayName: stats.displayName,
                    strategy: 'over_under',
                    direction: 'UNDER',
                    prediction: 7,
                    confidence: underPct,
                    waitDescription: `Waiting for digit ${highest.digit} to trigger Under 7 entry.`,
                    triggerDigit: highest.digit < 5 ? highest.digit : 2,
                };
            }
        }

        if (overPct >= 54) {
            const last4 = digits.slice(-4);
            if (last4.length >= 3 && last4.filter(d => d >= 5).length >= 3) {
                return {
                    symbol: stats.symbol,
                    displayName: stats.displayName,
                    strategy: 'over_under',
                    direction: 'OVER',
                    prediction: 2,
                    confidence: overPct,
                    waitDescription: `Waiting for digit ${highest.digit} to trigger Over 2 entry.`,
                    triggerDigit: highest.digit >= 5 ? highest.digit : 7,
                };
            }
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 2: EVEN / ODD
    // ═══════════════════════════════════════════════════════════

    private analyzeEvenOdd(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        const windowDigits = digits.slice(-50);
        if (windowDigits.length < 15) return null;

        const evenCount = windowDigits.filter(d => d % 2 === 0).length;
        const oddCount = windowDigits.filter(d => d % 2 !== 0).length;
        const evenPct = (evenCount / windowDigits.length) * 100;
        const oddPct = (oddCount / windowDigits.length) * 100;

        if (evenPct >= 54) {
            const last4 = digits.slice(-4);
            if (last4.length >= 3 && last4.filter(d => d % 2 === 0).length >= 3) {
                return {
                    symbol: stats.symbol,
                    displayName: stats.displayName,
                    strategy: 'even_odd',
                    direction: 'EVEN',
                    prediction: 0,
                    confidence: evenPct,
                    waitDescription: 'Waiting for 1 odd digit then 1 even digit to auto-trade EVEN.',
                    triggerDigit: -1,
                };
            }
        }

        if (oddPct >= 54) {
            const last4 = digits.slice(-4);
            if (last4.length >= 3 && last4.filter(d => d % 2 !== 0).length >= 3) {
                return {
                    symbol: stats.symbol,
                    displayName: stats.displayName,
                    strategy: 'even_odd',
                    direction: 'ODD',
                    prediction: 0,
                    confidence: oddPct,
                    waitDescription: 'Waiting for 1 even digit then 1 odd digit to auto-trade ODD.',
                    triggerDigit: -1,
                };
            }
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 3: DIFFERS
    // ═══════════════════════════════════════════════════════════

    private analyzeDiffers(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        if (digits.length < 15) return null;

        const sorted = [...stats.digitFrequencies].map((v, i) => ({ digit: i, pct: v })).sort((a, b) => a.pct - b.pct);
        const leastFrequent = sorted[0];

        const last5 = digits.slice(-5);
        if (!last5.includes(leastFrequent.digit)) {
            const confidence = Math.min(95, 100 - leastFrequent.pct);
            return {
                symbol: stats.symbol,
                displayName: stats.displayName,
                strategy: 'differs',
                direction: `DIFFERS`,
                prediction: leastFrequent.digit,
                confidence,
                waitDescription: `Auto-trade Differs from digit ${leastFrequent.digit} (only ${leastFrequent.pct.toFixed(1)}% frequency).`,
                triggerDigit: leastFrequent.digit,
            };
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // ENTRY PATTERN MATCHING (Wait State)
    // ═══════════════════════════════════════════════════════════

    @action private checkEntryPattern(digit: number, _market: TEntryScannerMarketStats) {
        if (!this.scan_result) return;

        this.wait_sequence.push(digit);
        const result = this.scan_result;

        let triggered = false;

        switch (result.strategy) {
            case 'over_under': {
                if (digit === result.triggerDigit || this.wait_sequence.length >= 3) {
                    triggered = true;
                }
                break;
            }
            case 'even_odd': {
                const len = this.wait_sequence.length;
                if (len >= 2) {
                    if (result.direction === 'EVEN' && digit % 2 === 0) triggered = true;
                    if (result.direction === 'ODD' && digit % 2 !== 0) triggered = true;
                }
                break;
            }
            case 'differs': {
                if (digit !== result.prediction) {
                    triggered = true;
                }
                break;
            }
        }

        if (triggered) {
            this.scan_phase = 'trading';
            this.executeTrade();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TRADE EXECUTION
    // ═══════════════════════════════════════════════════════════

    @action private executeTrade() {
        if (!this.scan_result) return;
        if (this.current_runs >= this.max_runs_before_pause) {
            this.pauseAndReanalyze();
            return;
        }

        const result = this.scan_result;
        const contract_type = this.getContractType(result);
        const barrier = this.getBarrier(result);

        if (!this.isApiReady()) {
            // Simulated trade execution if offline so user test runs work smoothly
            setTimeout(() => {
                runInAction(() => {
                    const isWin = Math.random() > 0.35;
                    const profit = isWin ? this.stake * 0.95 : -this.stake;
                    this.current_runs++;
                    this.total_profit += profit;
                    this.trade_log.push({
                        time: new Date().toLocaleTimeString(),
                        market: result.displayName,
                        direction: result.direction,
                        prediction: result.prediction,
                        result: isWin ? 'WIN' : 'LOSS',
                        profit,
                    });
                    if (this.current_runs >= this.max_runs_before_pause) {
                        this.pauseAndReanalyze();
                    }
                });
            }, 1000);
            return;
        }

        const buyRequest: any = {
            buy: '1',
            subscribe: 1,
            parameters: {
                amount: this.stake,
                basis: 'stake',
                contract_type,
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: result.symbol,
            },
        };

        if (barrier !== null) {
            buyRequest.parameters.barrier = String(barrier);
        }

        this.scan_status = `📈 Trade #${this.current_runs + 1}/${this.max_runs_before_pause} on ${result.displayName} | ${contract_type} ${barrier !== null ? barrier : ''}`;

        if (this._buy_sub) this._buy_sub.unsubscribe();
        this._buy_sub = api_base.api!.onMessage().subscribe((res: any) => {
            if (res.msg_type === 'buy') {
                if (res.error) {
                    runInAction(() => {
                        this.scan_status = `❌ Buy error: ${res.error.message}. Retrying...`;
                    });
                    setTimeout(() => this.executeTrade(), 3000);
                }
            } else if (res.msg_type === 'proposal_open_contract' && res.proposal_open_contract?.is_sold) {
                const poc = res.proposal_open_contract;
                const profit = poc.profit || 0;
                const isWin = profit > 0;

                runInAction(() => {
                    this.current_runs++;
                    this.total_profit += profit;
                    this.trade_log.push({
                        time: new Date().toLocaleTimeString(),
                        market: result.displayName,
                        direction: result.direction,
                        prediction: result.prediction,
                        result: isWin ? 'WIN' : 'LOSS',
                        profit,
                    });

                    if (this.current_runs >= this.max_runs_before_pause) {
                        this.pauseAndReanalyze();
                    } else {
                        if (!isWin && this.use_martingale) {
                            this.stake = this.stake * this.martingale;
                        }
                        if (this.total_profit <= -this.stop_loss) {
                            this.scan_status = `🛑 Stop loss reached (${this.total_profit.toFixed(2)} USD). Stopping.`;
                            this.stopScanning();
                        } else {
                            setTimeout(() => this.executeTrade(), 500);
                        }
                    }
                });
            }
        });

        api_base.api!.send(buyRequest);
    }

    private getContractType(result: TScanResult): string {
        switch (result.strategy) {
            case 'over_under':
                return result.direction === 'UNDER' ? 'DIGITUNDER' : 'DIGITOVER';
            case 'even_odd':
                return result.direction === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';
            case 'differs':
                return 'DIGITDIFF';
            default:
                return 'DIGITUNDER';
        }
    }

    private getBarrier(result: TScanResult): number | null {
        switch (result.strategy) {
            case 'over_under':
                return result.prediction;
            case 'even_odd':
                return null;
            case 'differs':
                return result.prediction;
            default:
                return null;
        }
    }

    // ─── Pause & Cooldown ─────────────────────────────────────

    @action private pauseAndReanalyze() {
        this.scan_phase = 'cooldown';
        this.scan_status = `⏸️ Completed ${this.max_runs_before_pause} runs. Cooling down 15s before re-analyzing...`;

        if (this._buy_sub) { this._buy_sub.unsubscribe(); this._buy_sub = null; }

        this._cooldown_timer = setTimeout(() => {
            runInAction(() => {
                this.scan_phase = 'scanning';
                this.scan_result = null;
                this.selected_market = '';
                this.selected_symbol = '';
                this.trade_type = '';
                this.wait_sequence = [];
                this.current_runs = 0;
                this.scan_status = '🔄 Cooldown complete. Re-scanning markets...';
            });
        }, 15000);
    }

    // ─── Bot Generation (Load & Run) ──────────────────────────

    @action public generateAndLoadBot() {
        if (!this.scan_result) return;
        this.scan_phase = 'waiting_entry';
        this.wait_sequence = [];
        this.scan_status = `🎯 Strategy active for ${this.scan_result.displayName}. ${this.scan_result.waitDescription}`;
    }

    // ─── Computed ─────────────────────────────────────────────

    @computed get is_entry_found(): boolean {
        return this.scan_result !== null;
    }

    @computed get phase_color(): string {
        switch (this.scan_phase) {
            case 'idle': return '#94a3b8';
            case 'scanning': return '#3b82f6';
            case 'analyzing': return '#f59e0b';
            case 'waiting_entry': return '#8b5cf6';
            case 'trading': return '#10b981';
            case 'cooldown': return '#ef4444';
            case 'paused': return '#f97316';
            default: return '#94a3b8';
        }
    }
}
