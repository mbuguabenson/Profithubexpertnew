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

    // UI State
    @observable accessor is_scanner_open: boolean = false;
    @observable accessor strategy_type: TStrategyType = 'over_under';
    @observable accessor scan_mode: 'all' | 'single' = 'all';
    @observable accessor target_single_symbol: string = 'R_100';
    @observable accessor scan_phase: TScanPhase = 'idle';
    @observable accessor scan_status: string = 'Select a strategy and click Scan Markets to begin.';
    @observable accessor is_scanning: boolean = false;

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

    @action setStrategyType(type: TStrategyType) {
        this.strategy_type = type;
        this.resetScan();
    }

    @action resetScan() {
        this.scan_phase = 'idle';
        this.scan_status = 'Select a strategy and click Scan Markets to begin.';
        this.selected_market = '';
        this.selected_symbol = '';
        this.trade_type = '';
        this.scan_result = null;
        this.market_results = [];
        this.wait_sequence = [];
        this.current_runs = 0;
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
        this.scan_status = 'Fetching active markets...';
        this.market_results = [];
        this.wait_sequence = [];
        this.fetchActiveSymbols();
    }

    @action stopScanning() {
        this.is_scanning = false;
        this.scan_phase = 'idle';
        this.scan_status = 'Scan stopped.';

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
                this.scan_status = `Monitoring ${this.active_symbols.length} ${this.scan_mode === 'single' ? 'selected' : 'active'} market(s). Collecting tick history...`;
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

    // ─── Tick Streaming ───────────────────────────────────────

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

            api_base.api!.send({
                ticks_history: market.symbol,
                end: 'latest',
                count: 60,
                style: 'ticks',
            });
        });

        // Start analysis loop every 2 seconds
        if (!this._scan_interval) {
            this._scan_interval = setInterval(() => this.runAnalysis(), 2000);
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
    }

    @action private onNewTick(symbol: string, digit: number) {
        const market = this.market_stats.get(symbol);
        if (!market) return;

        market.recentDigits.push(digit);
        if (market.recentDigits.length > 120) market.recentDigits.shift(); // Keep up to 120 ticks

        const stats = this.computeStats(market.recentDigits);
        Object.assign(market, stats);

        // If we're in waiting_entry phase, check for pattern match
        if (this.scan_phase === 'waiting_entry' && this.scan_result && symbol === this.selected_symbol) {
            this.checkEntryPattern(digit, market);
        }
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
        let found = false;

        for (const [, stats] of this.market_stats.entries()) {
            if (stats.recentDigits.length < 30) continue; // Need at least 30 ticks

            let result: TScanResult | null = null;

            switch (this.strategy_type) {
                case 'over_under':
                    result = this.analyzeOverUnder(stats);
                    break;
                case 'even_odd':
                    result = this.analyzeEvenOdd(stats);
                    break;
                case 'differs':
                    result = this.analyzeDiffers(stats);
                    break;
            }

            if (result) {
                this.scan_result = result;
                this.selected_market = result.displayName;
                this.selected_symbol = result.symbol;
                this.trade_type = result.direction;
                this.scan_phase = 'waiting_entry';
                this.wait_sequence = [];
                this.scan_status = `✅ Entry found on ${result.displayName}! ${result.waitDescription}`;
                found = true;
                break;
            }
        }

        if (!found && this.scan_phase === 'analyzing') {
            const count = this.market_stats.size;
            this.scan_status = `🔍 Scanning ${count} markets for ${this.strategy_type.replace('_', '/')} entry conditions...`;
            this.scan_phase = 'scanning';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 1: OVER / UNDER
    // ═══════════════════════════════════════════════════════════

    private analyzeOverUnder(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        const last60 = digits.slice(-60);

        // Calculate Under (0-4) vs Over (5-9)
        const underCount = last60.filter(d => d < 5).length;
        const overCount = last60.filter(d => d >= 5).length;
        const underPct = (underCount / last60.length) * 100;
        const overPct = (overCount / last60.length) * 100;

        // Sort digit frequencies (descending)
        const sorted = [...stats.digitFrequencies].map((v, i) => ({ digit: i, pct: v })).sort((a, b) => b.pct - a.pct);
        const highest = sorted[0];
        const secondHighest = sorted[1];
        const lowest = sorted[9];

        // ── UNDER Analysis ──
        if (underPct >= 60) {
            // Most appearing, 2nd highest, and least must ALL be under digits (0-4)
            if (highest.digit < 5 && secondHighest.digit < 5 && lowest.digit < 5) {
                // Over digits must be less than 10% combined
                if (overPct < 10) {
                    // Last 15 ticks must ALL be under
                    const last15 = digits.slice(-15);
                    if (last15.length >= 15 && last15.every(d => d < 5)) {
                        // Prediction: Under found at digit level. Trade Under 8, 7, 6
                        // Pick prediction based on highest under digit found
                        const prediction = 8; // Safest: Under 8 means digit must be 0-7
                        return {
                            symbol: stats.symbol,
                            displayName: stats.displayName,
                            strategy: 'over_under',
                            direction: 'UNDER',
                            prediction,
                            confidence: underPct,
                            waitDescription: `Waiting for digit ${highest.digit} (highest under digit) to appear, then auto-trade Under ${prediction}.`,
                            triggerDigit: highest.digit,
                        };
                    }
                }
            }
        }

        // ── OVER Analysis ── (Vice versa)
        if (overPct >= 60) {
            if (highest.digit >= 5 && secondHighest.digit >= 5 && lowest.digit >= 5) {
                if (underPct < 10) {
                    const last15 = digits.slice(-15);
                    if (last15.length >= 15 && last15.every(d => d >= 5)) {
                        const prediction = 1; // Safest: Over 1 means digit must be 2-9
                        return {
                            symbol: stats.symbol,
                            displayName: stats.displayName,
                            strategy: 'over_under',
                            direction: 'OVER',
                            prediction,
                            confidence: overPct,
                            waitDescription: `Waiting for digit ${highest.digit} (highest over digit) to appear, then auto-trade Over ${prediction}.`,
                            triggerDigit: highest.digit,
                        };
                    }
                }
            }
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 2: EVEN / ODD
    // ═══════════════════════════════════════════════════════════

    private analyzeEvenOdd(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        const last60 = digits.slice(-60);

        const evenCount = last60.filter(d => d % 2 === 0).length;
        const oddCount = last60.filter(d => d % 2 !== 0).length;
        const evenPct = (evenCount / last60.length) * 100;
        const oddPct = (oddCount / last60.length) * 100;

        // ── EVEN Analysis ──
        if (evenPct >= 60) {
            // Last 7 digits must ALL be even
            const last7 = digits.slice(-7);
            if (last7.length >= 7 && last7.every(d => d % 2 === 0)) {
                return {
                    symbol: stats.symbol,
                    displayName: stats.displayName,
                    strategy: 'even_odd',
                    direction: 'EVEN',
                    prediction: 0, // Not applicable for even/odd
                    confidence: evenPct,
                    waitDescription: 'Waiting for 2+ consecutive odd numbers then 1 even to trigger auto-trade EVEN.',
                    triggerDigit: -1, // Pattern-based, not single digit
                };
            }
        }

        // ── ODD Analysis ── (Vice versa)
        if (oddPct >= 60) {
            const last7 = digits.slice(-7);
            if (last7.length >= 7 && last7.every(d => d % 2 !== 0)) {
                return {
                    symbol: stats.symbol,
                    displayName: stats.displayName,
                    strategy: 'even_odd',
                    direction: 'ODD',
                    prediction: 0,
                    confidence: oddPct,
                    waitDescription: 'Waiting for 2+ consecutive even numbers then 1 odd to trigger auto-trade ODD.',
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
        // Sort digits by frequency descending
        const sorted = [...stats.digitFrequencies].map((v, i) => ({ digit: i, pct: v })).sort((a, b) => b.pct - a.pct);

        // Exclude: highest (index 0), 2nd highest (index 1), lowest (index 9)
        const candidates = sorted.slice(2, 9); // indices 2-8 (7 digits)

        // Find the most CONSTANT digit: < 10% frequency and minimal variation
        const target = candidates.find(c => c.pct < 10 && c.pct > 0);

        if (target) {
            return {
                symbol: stats.symbol,
                displayName: stats.displayName,
                strategy: 'differs',
                direction: `DIFFERS`,
                prediction: target.digit,
                confidence: 100 - target.pct, // Higher confidence when digit appears less
                waitDescription: `Waiting for digit ${target.digit} (${target.pct.toFixed(1)}% freq) to appear, then auto-trade Differs from ${target.digit}.`,
                triggerDigit: target.digit,
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
                // Wait for the highest appearing digit (triggerDigit) to show up
                if (digit === result.triggerDigit) {
                    triggered = true;
                }
                this.scan_status = `⏳ Waiting for digit ${result.triggerDigit} on ${result.displayName}... Last tick: ${digit}`;
                break;
            }
            case 'even_odd': {
                // Wait for: 2+ consecutive opposite parity, then 1 matching parity
                const seq = this.wait_sequence;
                const isEvenStrategy = result.direction === 'EVEN';

                if (seq.length >= 3) {
                    const lastThree = seq.slice(-3);
                    if (isEvenStrategy) {
                        // Need: odd, odd, even
                        if (lastThree[0] % 2 !== 0 && lastThree[1] % 2 !== 0 && lastThree[2] % 2 === 0) {
                            triggered = true;
                        }
                    } else {
                        // Need: even, even, odd
                        if (lastThree[0] % 2 === 0 && lastThree[1] % 2 === 0 && lastThree[2] % 2 !== 0) {
                            triggered = true;
                        }
                    }
                }
                const oppCount = seq.filter(d => isEvenStrategy ? d % 2 !== 0 : d % 2 === 0).length;
                this.scan_status = `⏳ Waiting for ${isEvenStrategy ? 'Odd→Odd→Even' : 'Even→Even→Odd'} pattern on ${result.displayName}... Opposite count: ${oppCount}`;
                break;
            }
            case 'differs': {
                // Wait for the target digit to appear (to confirm it's still showing)
                if (digit === result.triggerDigit) {
                    triggered = true;
                }
                this.scan_status = `⏳ Waiting for digit ${result.triggerDigit} on ${result.displayName}... Last tick: ${digit}`;
                break;
            }
        }

        if (triggered) {
            this.scan_status = `🚀 ENTRY TRIGGERED on ${result.displayName}! Starting auto-trade...`;
            this.scan_phase = 'trading';
            this.current_runs = 0;
            this.executeTrade();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TRADE EXECUTION
    // ═══════════════════════════════════════════════════════════

    @action private executeTrade() {
        if (!this.scan_result || !this.isApiReady()) return;
        if (this.current_runs >= this.max_runs_before_pause) {
            this.pauseAndReanalyze();
            return;
        }

        const result = this.scan_result;
        const contract_type = this.getContractType(result);
        const barrier = this.getBarrier(result);

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

        // Subscribe to buy response
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
                        // Continue trading with optional martingale
                        if (!isWin && this.use_martingale) {
                            this.stake = this.stake * this.martingale;
                        }
                        // Check stop loss
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
                return result.prediction; // 8,7,6 for under or 1,2,3 for over
            case 'even_odd':
                return null; // No barrier for even/odd
            case 'differs':
                return result.prediction; // The digit to differ from
            default:
                return null;
        }
    }

    // ─── Pause & Cooldown ─────────────────────────────────────

    @action private pauseAndReanalyze() {
        this.scan_phase = 'cooldown';
        this.scan_status = `⏸️ Completed ${this.max_runs_before_pause} runs. Cooling down for 30s before re-analyzing...`;

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
        }, 30000); // 30 second cooldown
    }

    // ─── Bot Generation (Load & Run) ──────────────────────────

    @action public generateAndLoadBot() {
        if (!this.scan_result) return;
        this.scan_phase = 'waiting_entry';
        this.wait_sequence = [];
        this.scan_status = `🎯 Bot loaded for ${this.scan_result.displayName}. ${this.scan_result.waitDescription}`;
    }

    // ─── Computed ─────────────────────────────────────────────

    @computed get strategy_label(): string {
        switch (this.strategy_type) {
            case 'over_under': return 'Over / Under';
            case 'even_odd': return 'Even / Odd';
            case 'differs': return 'Differs';
        }
    }

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
