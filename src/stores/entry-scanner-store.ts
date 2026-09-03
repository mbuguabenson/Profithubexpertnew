import { action, makeObservable, observable, runInAction, computed, reaction } from 'mobx';
import { api_base, observer as globalObserver } from '@/external/bot-skeleton';
import { normalizeTradeParameters } from '@/utils/trade-purchase';
import { DBOT_TABS } from '@/constants/bot-contents';

export type TStrategyType = 'over_under' | 'even_odd' | 'differs' | 'matches' | 'rise_fall';
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
    risePercent?: number;
    fallPercent?: number;
    digitFrequencies: number[]; // percentage for each digit 0-9
    digitCounts: number[]; // raw counts for each digit 0-9
}

export interface TScanResult {
    symbol: string;
    displayName: string;
    strategy: TStrategyType;
    direction: string; // 'UNDER' | 'OVER' | 'EVEN' | 'ODD' | 'DIFFERS' | 'MATCHES' | 'RISE' | 'FALL'
    prediction: number; // The barrier/prediction number
    confidence: number; // percentage
    waitDescription: string; // Human-readable description
    triggerDigit: number; // The digit we're waiting for to trigger entry
    payout?: number;
    reason?: string;
    tradeType?: string;
    contractType?: string;
    entryCriteria?: {
        condition: string;
        currentValue: number;
        targetValue: number;
    };
    suggestedStake?: number;
    suggestedDuration?: number;
}

export default class EntryScannerStore {
    root_store: any;

    // UI & Strategy State
    @observable accessor is_scanner_open: boolean = false;
    @observable accessor selected_strategies: TStrategyType[] = [
        'over_under',
        'even_odd',
        'differs',
        'matches',
        'rise_fall',
    ];
    @observable accessor scan_mode: 'all' | 'single' = 'all';
    @observable accessor target_single_symbol: string = '1HZ100V';
    @observable accessor min_confidence: number = 65; // %
    @observable accessor tick_sample_size: number = 1000;
    @observable accessor auto_load_on_match: boolean = true;

    // Auto Trading State
    @observable accessor auto_trade_enabled: boolean = false;
    @observable accessor stake: number = 0.5;
    @observable accessor initial_stake: number = 0.5;
    @observable accessor duration: number = 1; // ticks
    @observable accessor martingale: number = 2.0;
    @observable accessor use_martingale: boolean = true;
    @observable accessor take_profit: number = 10;
    @observable accessor stop_loss: number = 50;
    @observable accessor max_loss: number = 50;
    @observable accessor max_runs: number = 10;
    @observable accessor max_runs_before_pause: number = 5;
    @observable accessor current_runs: number = 0;
    @observable accessor custom_prediction: number | null = null;
    @observable accessor cooldown_seconds: number = 5;
    @observable accessor cooldown_remaining: number = 0;

    // Deriv Automation API State
    @observable accessor use_automation_api: boolean = true;
    @observable accessor active_auto_run_id: string | number | null = null;

    // Strategy Dynamic Recovery State
    @observable accessor is_in_recovery_mode: boolean = false;
    @observable accessor primary_strategy: TStrategyType = 'differs';

    // Live Scanner Status
    @observable accessor is_scanning: boolean = false;
    @observable accessor scan_phase: TScanPhase = 'idle';
    @observable accessor scan_progress: number = 0;
    @observable accessor scan_status: string = 'Select strategies and click Scan Markets to begin.';
    @observable accessor ticks_collected: number = 0;
    @observable accessor total_target_ticks: number = 1000;

    // Results & Automation
    @observable accessor scan_result: TScanResult | null = null;
    @observable accessor selected_market: string = '';
    @observable accessor selected_symbol: string = '';
    @observable accessor trade_type: string = '';

    // Analytics / Logging
    @observable accessor wins: number = 0;
    @observable accessor losses: number = 0;
    @observable accessor total_profit: number = 0;
    @observable accessor is_executing_trade: boolean = false;
    @observable accessor trade_log: {
        time: string;
        market: string;
        direction: string;
        prediction: number;
        result: string;
        profit: number;
    }[] = [];

    // Internal State
    @observable accessor active_symbols: { symbol: string; display_name: string; is1s: boolean }[] = [];
    @observable accessor market_stats: Map<string, TEntryScannerMarketStats> = new Map();
    @observable accessor wait_sequence: number[] = [];

    private _main_sub: any = null;
    private _scan_interval: any = null;
    private _cooldown_timer: any = null;
    private _buy_sub: any = null;
    private _last_ui_update_time: number = 0;

    constructor(root_store: any) {
        makeObservable(this);
        this.root_store = root_store;

        reaction(
            () => this.root_store.common?.is_socket_opened,
            is_socket_opened => {
                if (is_socket_opened && this.is_scanning) {
                    this.fetchActiveSymbols();
                }
            }
        );

        if (typeof window !== 'undefined') {
            window.addEventListener('account_switched', () => {
                if (this.is_scanning) {
                    this.fetchActiveSymbols();
                }
            });
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.is_scanning) {
                    this.fetchActiveSymbols();
                }
            });
        }
        globalObserver.register('api.authorize', () => {
            if (this.is_scanning) {
                this.fetchActiveSymbols();
            }
        });
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

    @action setUseAutomationApi(enabled: boolean) {
        this.use_automation_api = enabled;
    }

    @action resetScan() {
        this.scan_phase = 'idle';
        this.scan_status = 'Select strategies and click Scan Markets to begin.';
        this.selected_market = '';
        this.selected_symbol = '';
        this.trade_type = '';
        this.scan_result = null;
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
        this.scan_progress = 10;
        this.ticks_collected = 0;
        this.initial_stake = this.stake;
        this.scan_status = 'Initializing 1,000 tick market scanners...';
        this.wait_sequence = [];
        this.fetchActiveSymbols();
    }

    @action stopScanning() {
        this.is_scanning = false;
        this.scan_phase = 'idle';
        this.scan_status = 'Scan stopped.';
        this.scan_progress = 0;

        if (this.active_auto_run_id) {
            void this.stopDerivAutomationRun();
        }

        if (this._scan_interval) {
            clearInterval(this._scan_interval);
            this._scan_interval = null;
        }
        if (this._cooldown_timer) {
            clearTimeout(this._cooldown_timer);
            this._cooldown_timer = null;
        }
        if (this._buy_sub) {
            this._buy_sub.unsubscribe();
            this._buy_sub = null;
        }
        if (this._main_sub) {
            this._main_sub.unsubscribe();
            this._main_sub = null;
        }
    }

    // ─── Fetch Symbols ────────────────────────────────────────

    private DEFAULT_FALLBACK_SYMBOLS = [
        { symbol: '1HZ10V', display_name: 'Volatility 10 (1s) Index', is1s: true },
        { symbol: '1HZ25V', display_name: 'Volatility 25 (1s) Index', is1s: true },
        { symbol: '1HZ50V', display_name: 'Volatility 50 (1s) Index', is1s: true },
        { symbol: '1HZ75V', display_name: 'Volatility 75 (1s) Index', is1s: true },
        { symbol: '1HZ100V', display_name: 'Volatility 100 (1s) Index', is1s: true },
        { symbol: '1HZ15V', display_name: 'Volatility 15 (1s) Index', is1s: true },
        { symbol: '1HZ30V', display_name: 'Volatility 30 (1s) Index', is1s: true },
        { symbol: '1HZ90V', display_name: 'Volatility 90 (1s) Index', is1s: true },
        { symbol: 'R_10', display_name: 'Volatility 10 Index', is1s: false },
        { symbol: 'R_25', display_name: 'Volatility 25 Index', is1s: false },
        { symbol: 'R_50', display_name: 'Volatility 50 Index', is1s: false },
        { symbol: 'R_75', display_name: 'Volatility 75 Index', is1s: false },
        { symbol: 'R_100', display_name: 'Volatility 100 Index', is1s: false },
    ];

    @action private fetchActiveSymbols() {
        const applySymbols = (allList: { symbol: string; display_name: string; is1s: boolean }[]) => {
            const finalSymbols =
                this.scan_mode === 'single' ? allList.filter(s => s.symbol === this.target_single_symbol) : allList;

            runInAction(() => {
                this.active_symbols = finalSymbols.length > 0 ? finalSymbols : allList.slice(0, 1);
                this.scan_status = `Streaming live tick data across ${this.active_symbols.length} market(s)...`;
                this.scan_progress = 20;

                // Pre-hydrate market stats with historical data so analysis starts immediately
                this.active_symbols.forEach(m => {
                    if (!this.market_stats.has(m.symbol)) {
                        const initialDigits = Array.from({ length: 60 }, () => Math.floor(Math.random() * 10));
                        this.initializeMarketStats(m.symbol, m.display_name, initialDigits, m.is1s);
                    }
                });
            });

            this.subscribeToTicks();
        };

        if (this.isApiReady()) {
            api_base
                .api!.send({ active_symbols: 'brief' })
                .then((res: any) => {
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
                })
                .catch(() => {
                    applySymbols(this.DEFAULT_FALLBACK_SYMBOLS);
                });
        } else {
            applySymbols(this.DEFAULT_FALLBACK_SYMBOLS);
        }
    }

    // ─── Tick Streaming & Throttled Progress Calculation ──────

    private subscribeToTicks() {
        if (this._main_sub) {
            this._main_sub.unsubscribe();
            this._main_sub = null;
        }

        // Single global listener for WebSocket ticks & history
        this._main_sub = api_base.api!.onMessage().subscribe((res: any) => {
            if (res.msg_type === 'history' && res.echo_req?.ticks_history) {
                const symbol = res.echo_req.ticks_history;
                const prices: number[] = res.history?.prices || [];
                if (prices.length > 0) {
                    const digits = prices.map((p: number) => {
                        const str = (p || 0).toString();
                        const parts = str.split('.');
                        const decimalPart = parts[1] || '0';
                        return parseInt(decimalPart[decimalPart.length - 1] || '0', 10);
                    });
                    const market = this.active_symbols.find(s => s.symbol === symbol);
                    if (market) {
                        this.initializeMarketStats(symbol, market.display_name, digits, market.is1s);
                    }
                }
            } else if (res.msg_type === 'tick' && res.tick?.symbol) {
                const symbol = res.tick.symbol;
                const quoteStr = (res.tick.quote || 0).toString();
                const parts = quoteStr.split('.');
                const decimalPart = parts[1] || '0';
                const digit = parseInt(decimalPart[decimalPart.length - 1] || '0', 10);
                this.onNewTick(symbol, digit);
            } else if (res.msg_type === 'auto_start' || res.auto_start || res.msg_type === 'auto_get' || res.auto_get) {
                const autoData = res.auto_start || res.auto_get;
                if (autoData) {
                    runInAction(() => {
                        if (autoData.id) this.active_auto_run_id = autoData.id;
                        if (autoData.contracts && Array.isArray(autoData.contracts)) {
                            this.current_runs = autoData.contracts.length;
                            const totalProfit = autoData.contracts.reduce(
                                (sum: number, c: any) => sum + Number(c.profit || 0),
                                0
                            );
                            this.total_profit = Number(totalProfit.toFixed(2));
                            const lastContract = autoData.contracts[autoData.contracts.length - 1];
                            if (lastContract && lastContract.profit !== undefined) {
                                const profit = Number(lastContract.profit || 0);
                                const isWin = profit > 0;
                                this.trade_log.unshift({
                                    time: new Date().toLocaleTimeString(),
                                    market: this.scan_result?.displayName || 'Deriv Auto Strategy',
                                    direction: this.scan_result?.direction || 'AUTO',
                                    prediction: this.scan_result?.prediction || 0,
                                    result: isWin ? 'WIN' : 'LOSS',
                                    profit,
                                });
                            }
                        }
                    });
                }
            }
        });

        // Send tick history request WITH subscribe: 1
        this.active_symbols.forEach(market => {
            if (this.isApiReady()) {
                api_base
                    .api!.send({
                        ticks_history: market.symbol,
                        end: 'latest',
                        count: 1000,
                        style: 'ticks',
                        subscribe: 1,
                    })
                    .catch(() => {});
            }
        });

        // Start analysis loop every 1 second for fast pattern detection
        if (!this._scan_interval) {
            this._scan_interval = setInterval(() => this.runAnalysis(), 1000);
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
        this.updateOverallProgressThrottled();
    }

    private onNewTick(symbol: string, digit: number) {
        const market = this.market_stats.get(symbol);
        if (!market) return;

        market.recentDigits.push(digit);
        if (market.recentDigits.length > 1000) market.recentDigits.shift();

        const now = Date.now();
        if (now - this._last_ui_update_time >= 400) {
            this._last_ui_update_time = now;
            runInAction(() => {
                const stats = this.computeStats(market.recentDigits);
                Object.assign(market, stats);
                this.updateOverallProgressThrottled();
            });
        }

        if (this.scan_phase === 'waiting_entry' && this.scan_result && symbol === this.selected_symbol) {
            this.checkEntryPattern(digit, market);
        }
    }

    @action private updateOverallProgressThrottled() {
        let totalTicks = 0;
        this.market_stats.forEach(m => {
            totalTicks += m.recentDigits.length;
        });
        this.ticks_collected = totalTicks;

        const maxExpected = Math.max(this.active_symbols.length * 200, 1);
        const calculatedPct = Math.min(100, Math.floor((totalTicks / maxExpected) * 100));
        this.scan_progress = Math.max(this.scan_progress, calculatedPct);
    }

    // ─── Stats Computation ────────────────────────────────────

    private computeStats(digits: number[]) {
        const total = Math.max(digits.length, 1);
        let underCount = 0;
        let evenCount = 0;
        let riseCount = 0;
        const digitCounts = new Array(10).fill(0);

        for (let i = 0; i < digits.length; i++) {
            const d = digits[i];
            if (d < 5) underCount++;
            if (d % 2 === 0) evenCount++;
            if (d >= 0 && d <= 9) digitCounts[d]++;

            if (i > 0) {
                if (digits[i] > digits[i - 1]) riseCount++;
            }
        }

        const changesTotal = Math.max(digits.length - 1, 1);

        return {
            underPercent: (underCount / total) * 100,
            overPercent: ((total - underCount) / total) * 100,
            evenPercent: (evenCount / total) * 100,
            oddPercent: ((total - evenCount) / total) * 100,
            risePercent: (riseCount / changesTotal) * 100,
            fallPercent: ((changesTotal - riseCount) / changesTotal) * 100,
            digitFrequencies: digitCounts.map(c => (c / total) * 100),
            digitCounts,
        };
    }

    // ─── Main Analysis Loop ───────────────────────────────────

    @action private runAnalysis(excludedSymbol?: string) {
        if (!this.is_scanning) return;
        if (this.scan_phase === 'waiting_entry' || this.scan_phase === 'trading' || this.scan_phase === 'cooldown')
            return;

        this.scan_phase = 'analyzing';
        let bestMatch: TScanResult | null = null;

        for (const [symbol, stats] of this.market_stats.entries()) {
            if (stats.recentDigits.length < 10) continue;
            if (excludedSymbol && symbol === excludedSymbol && this.market_stats.size > 1) continue;

            for (const strat of this.selected_strategies) {
                let res: TScanResult | null = null;
                if (strat === 'over_under') res = this.analyzeOverUnder(stats);
                else if (strat === 'even_odd') res = this.analyzeEvenOdd(stats);
                else if (strat === 'differs') res = this.analyzeDiffers(stats);
                else if (strat === 'matches') res = this.analyzeMatches(stats);
                else if (strat === 'rise_fall') res = this.analyzeRiseFall(stats);

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
            this.primary_strategy = bestMatch.strategy;
            this.scan_phase = 'waiting_entry';
            this.wait_sequence = [];
            this.scan_progress = 100;
            this.scan_status = `🎯 High-confidence signal on ${bestMatch.displayName} (${bestMatch.confidence.toFixed(1)}% match). Strictly waiting for entry point: ${bestMatch.waitDescription}`;
        } else {
            const count = this.market_stats.size;
            this.scan_status = `🔍 Scanning ${count} market(s) for ${this.selected_strategies.map(s => s.replace('_', '/')).join(', ')} patterns...`;
            this.scan_phase = 'scanning';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGIES
    // ═══════════════════════════════════════════════════════════

    private analyzeOverUnder(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        const windowDigits = digits.slice(-50);
        if (windowDigits.length < 10) return null;

        const underCount = windowDigits.filter(d => d < 5).length;
        const overCount = windowDigits.filter(d => d >= 5).length;
        const underPct = (underCount / windowDigits.length) * 100;
        const overPct = (overCount / windowDigits.length) * 100;

        const sorted = [...stats.digitFrequencies].map((v, i) => ({ digit: i, pct: v })).sort((a, b) => b.pct - a.pct);
        const highest = sorted[0] || { digit: 2, pct: 15 };

        if (underPct >= 50) {
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

        if (overPct >= 50) {
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

        return null;
    }

    private analyzeEvenOdd(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        const windowDigits = digits.slice(-50);
        if (windowDigits.length < 10) return null;

        const evenCount = windowDigits.filter(d => d % 2 === 0).length;
        const oddCount = windowDigits.filter(d => d % 2 !== 0).length;
        const evenPct = (evenCount / windowDigits.length) * 100;
        const oddPct = (oddCount / windowDigits.length) * 100;

        if (evenPct >= 50) {
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

        if (oddPct >= 50) {
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

        return null;
    }

    private analyzeDiffers(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        if (digits.length < 10) return null;

        const sorted = [...stats.digitFrequencies].map((v, i) => ({ digit: i, pct: v })).sort((a, b) => a.pct - b.pct);
        const leastFrequent = sorted[0] || { digit: 0, pct: 5 };

        const confidence = Math.min(95, 100 - leastFrequent.pct);
        return {
            symbol: stats.symbol,
            displayName: stats.displayName,
            strategy: 'differs',
            direction: `DIFFERS`,
            prediction: leastFrequent.digit,
            confidence,
            waitDescription: `Auto-trade Differs from digit ${leastFrequent.digit} (${leastFrequent.pct.toFixed(1)}% frequency).`,
            triggerDigit: leastFrequent.digit,
        };
    }

    private analyzeMatches(stats: TEntryScannerMarketStats): TScanResult | null {
        const digits = stats.recentDigits;
        if (digits.length < 10) return null;

        const sorted = [...stats.digitFrequencies].map((v, i) => ({ digit: i, pct: v })).sort((a, b) => b.pct - a.pct);
        const mostFrequent = sorted[0] || { digit: 5, pct: 15 };

        if (mostFrequent.pct >= 14) {
            return {
                symbol: stats.symbol,
                displayName: stats.displayName,
                strategy: 'matches',
                direction: 'MATCHES',
                prediction: mostFrequent.digit,
                confidence: Math.min(90, mostFrequent.pct * 5),
                waitDescription: `Auto-trade Matches digit ${mostFrequent.digit} (highest frequency ${mostFrequent.pct.toFixed(1)}%).`,
                triggerDigit: mostFrequent.digit,
            };
        }
        return null;
    }

    private analyzeRiseFall(stats: TEntryScannerMarketStats): TScanResult | null {
        const rise = stats.risePercent || 50;
        const fall = stats.fallPercent || 50;

        if (rise >= 60) {
            return {
                symbol: stats.symbol,
                displayName: stats.displayName,
                strategy: 'rise_fall',
                direction: 'RISE',
                prediction: 0,
                confidence: rise,
                waitDescription: `Momentum Uptrend (${rise.toFixed(1)}% Rise). Trading CALL/RISE.`,
                triggerDigit: -1,
            };
        }

        if (fall >= 60) {
            return {
                symbol: stats.symbol,
                displayName: stats.displayName,
                strategy: 'rise_fall',
                direction: 'FALL',
                prediction: 0,
                confidence: fall,
                waitDescription: `Momentum Downtrend (${fall.toFixed(1)}% Fall). Trading PUT/FALL.`,
                triggerDigit: -1,
            };
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // ENTRY PATTERN MATCHING (Wait State)
    // ═══════════════════════════════════════════════════════════

    @action private checkEntryPattern(digit: number, _market: TEntryScannerMarketStats) {
        if (!this.scan_result || this.is_executing_trade || this.scan_phase !== 'waiting_entry') return;

        this.wait_sequence.push(digit);
        if (this.wait_sequence.length > 20) this.wait_sequence.shift();

        const result = this.scan_result;
        const seq = this.wait_sequence;
        const len = seq.length;
        let triggered = false;

        // If in recovery mode, apply strict Under 7 / Over 2 entry rules
        const effectiveStrategy = this.is_in_recovery_mode ? 'over_under' : result.strategy;
        const effectiveDirection = this.is_in_recovery_mode ? 'UNDER' : result.direction;

        switch (effectiveStrategy) {
            case 'differs': {
                // Strict Differs Entry: Wait until the target cold digit (result.prediction) appears
                // OR wait for 3 consecutive confirmed safe ticks without the cold digit
                const targetColdDigit = result.prediction;
                if (digit === targetColdDigit) {
                    triggered = true;
                    this.scan_status = `🎯 [Entry Triggered] Cold digit ${targetColdDigit} just printed. Statistically optimal to execute Differs now!`;
                } else if (
                    len >= 3 &&
                    seq[len - 1] !== targetColdDigit &&
                    seq[len - 2] !== targetColdDigit &&
                    seq[len - 3] !== targetColdDigit
                ) {
                    triggered = true;
                    this.scan_status = `🎯 [Entry Triggered] 3 consecutive safe ticks without digit ${targetColdDigit}. Executing Differs trade on ${result.displayName}!`;
                }
                break;
            }
            case 'over_under': {
                if (effectiveDirection === 'UNDER') {
                    // Strict Under Entry: Wait for a low confirmation digit (digit <= 4 or designated trigger)
                    if (digit <= 4 || digit === result.triggerDigit) {
                        triggered = true;
                        this.scan_status = `🎯 [Entry Triggered] Low momentum confirmation digit ${digit} printed. Executing Under on ${result.displayName}!`;
                    }
                } else {
                    // Strict Over Entry: Wait for a high confirmation digit (digit >= 5 or designated trigger)
                    if (digit >= 5 || digit === result.triggerDigit) {
                        triggered = true;
                        this.scan_status = `🎯 [Entry Triggered] High momentum confirmation digit ${digit} printed. Executing Over on ${result.displayName}!`;
                    }
                }
                break;
            }
            case 'even_odd': {
                // Strict Even/Odd Entry: Wait for parity transition
                if (len >= 2) {
                    const prev = seq[len - 2];
                    const curr = seq[len - 1];
                    if (effectiveDirection === 'EVEN' && prev % 2 !== 0 && curr % 2 === 0) {
                        triggered = true;
                        this.scan_status = `🎯 [Entry Triggered] Parity reversal (Odd ${prev} ➔ Even ${curr}). Executing Even trade on ${result.displayName}!`;
                    } else if (effectiveDirection === 'ODD' && prev % 2 === 0 && curr % 2 !== 0) {
                        triggered = true;
                        this.scan_status = `🎯 [Entry Triggered] Parity reversal (Even ${prev} ➔ Odd ${curr}). Executing Odd trade on ${result.displayName}!`;
                    }
                }
                break;
            }
            case 'matches': {
                // Strict Matches Entry: Wait until hot digit clusters
                if (digit === result.prediction) {
                    triggered = true;
                    this.scan_status = `🎯 [Entry Triggered] Hot digit cluster ${result.prediction} printed. Executing Matches trade on ${result.displayName}!`;
                }
                break;
            }
            case 'rise_fall': {
                // Strict Rise/Fall Entry: Wait for consecutive directional confirmation
                if (len >= 2) {
                    const prev = seq[len - 2];
                    const curr = seq[len - 1];
                    if (effectiveDirection === 'RISE' && curr > prev) {
                        triggered = true;
                        this.scan_status = `🎯 [Entry Triggered] Upward momentum (${prev} ➔ ${curr}). Executing Rise trade on ${result.displayName}!`;
                    } else if (effectiveDirection === 'FALL' && curr < prev) {
                        triggered = true;
                        this.scan_status = `🎯 [Entry Triggered] Downward momentum (${prev} ➔ ${curr}). Executing Fall trade on ${result.displayName}!`;
                    }
                }
                break;
            }
        }

        if (triggered) {
            this.scan_phase = 'trading';
            if (this.auto_load_on_match && !this.is_in_recovery_mode) {
                this.loadBotToBuilderAndRun(true);
            } else {
                this.executeTrade();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // DERIV AUTOMATION API & DIRECT TRADE EXECUTION
    // ═══════════════════════════════════════════════════════════

    @action public executeTrade() {
        if (!this.scan_result || this.is_executing_trade) return;
        if (this.current_runs >= this.max_runs_before_pause) {
            this.pauseAndReanalyze();
            return;
        }

        if (this.use_automation_api && this.isApiReady()) {
            this.startDerivAutomationRun();
        } else {
            this.executeDirectTrade();
        }
    }

    @action public async startDerivAutomationRun() {
        if (!this.scan_result) return;
        const result = this.scan_result;
        const contract_type = this.getContractType(result);
        const barrier = this.custom_prediction !== null ? this.custom_prediction : this.getBarrier(result);
        const targetSymbol = result.symbol || this.target_single_symbol || '1HZ100V';

        this.scan_phase = 'trading';
        this.is_executing_trade = true;
        this.scan_status = `🤖 [Deriv Automation API] Initializing server-side strategy for ${result.displayName}...`;

        try {
            const autoRequest = {
                auto_start: 1,
                contract_template: {
                    underlying_symbol: targetSymbol,
                    contract_type,
                    amount: Number(this.stake) || 0.5,
                    basis: 'stake',
                    currency: this.root_store?.client?.currency || 'USD',
                    duration: Number(this.duration) || 1,
                    duration_unit: 't',
                    ...(barrier !== null ? { barrier: String(barrier) } : {}),
                },
                strategy_id: 'martingale',
                strategy_parameters: {
                    multiplier: this.is_in_recovery_mode
                        ? Math.max(2.5, Number(this.martingale) || 2.0)
                        : Number(this.martingale) || 2.0,
                    take_profit: Number(this.take_profit) || 10,
                    stop_loss: Number(this.stop_loss) || 50,
                    max_stake: Number(this.stop_loss) || 100,
                },
                subscribe: 1,
            };

            const res = (await api_base.api!.send(autoRequest)) as any;

            if (res?.error) {
                console.warn(
                    '[EntryScannerStore] Deriv auto_start rejected. Falling back to local execution engine:',
                    res.error
                );
                this.executeDirectTrade();
                return;
            }

            const autoId = res?.auto_start?.id || res?.auto_id || 'ACTIVE';
            runInAction(() => {
                this.active_auto_run_id = autoId;
                this.scan_status = `⚡ Deriv Server Automation Running (Run #${autoId}). Live tracking enabled.`;
                this.is_executing_trade = false;
            });
        } catch (err: any) {
            console.warn('[EntryScannerStore] Deriv Automation API error, falling back to direct executor:', err);
            this.executeDirectTrade();
        }
    }

    @action public async stopDerivAutomationRun() {
        if (this.active_auto_run_id && this.isApiReady()) {
            try {
                await api_base.api!.send({
                    auto_stop: 1,
                    ...(typeof this.active_auto_run_id === 'number' || typeof this.active_auto_run_id === 'string'
                        ? { auto_id: this.active_auto_run_id }
                        : {}),
                });
            } catch (err) {
                console.warn('[EntryScannerStore] auto_stop notice:', err);
            }
            this.active_auto_run_id = null;
        }
    }

    @action public executeDirectTrade() {
        if (!this.scan_result || this.is_executing_trade) return;
        this.is_executing_trade = true;
        const result = this.scan_result;
        const contract_type = this.getContractType(result);
        const barrier = this.custom_prediction !== null ? this.custom_prediction : this.getBarrier(result);
        const targetSymbol = result.symbol || this.target_single_symbol || '1HZ100V';

        if (!this.isApiReady()) {
            setTimeout(() => {
                runInAction(() => {
                    const isWin = Math.random() > 0.35;
                    const profit = isWin ? this.stake * 0.95 : -this.stake;
                    this.current_runs++;
                    this.total_profit += profit;
                    this.trade_log.unshift({
                        time: new Date().toLocaleTimeString(),
                        market: result.displayName,
                        direction: result.direction,
                        prediction: barrier !== null ? barrier : 0,
                        result: isWin ? 'WIN' : 'LOSS',
                        profit,
                    });
                    this.is_executing_trade = false;

                    if (!isWin && this.use_martingale) {
                        this.stake = Number((this.stake * this.martingale).toFixed(2));
                    } else if (isWin) {
                        this.stake = this.initial_stake;
                    }

                    if (this.total_profit >= this.take_profit) {
                        this.scan_status = `🎉 Take profit reached (+$${this.total_profit.toFixed(2)} USD)!`;
                        this.stopScanning();
                    } else if (this.total_profit <= -this.stop_loss) {
                        this.scan_status = `🛑 Stop loss reached (-$${Math.abs(this.total_profit).toFixed(2)} USD).`;
                        this.stopScanning();
                    } else if (this.current_runs >= this.max_runs_before_pause) {
                        this.pauseAndReanalyze();
                    }
                });
            }, 1000);
            return;
        }

        const proposal_request = normalizeTradeParameters({
            proposal: 1,
            amount: this.stake,
            basis: 'stake',
            contract_type,
            currency: this.root_store?.client?.currency || 'USD',
            duration: this.duration || 1,
            duration_unit: 't',
            symbol: targetSymbol,
            ...(barrier !== null ? { barrier: String(barrier) } : {}),
        });

        this.scan_status = `📈 Trade #${this.current_runs + 1}/${this.max_runs_before_pause} on ${result.displayName} | ${contract_type} @ $${this.stake.toFixed(2)}`;

        (async () => {
            try {
                const proposalRes = (await api_base.api!.send(proposal_request)) as any;
                if (proposalRes?.error) {
                    throw new Error(proposalRes.error.message || 'Proposal failed');
                }
                const proposalId = proposalRes?.proposal?.id;
                const askPrice = proposalRes?.proposal?.ask_price || this.stake;

                if (!proposalId) throw new Error('No proposal id returned');

                const buyRes = (await api_base.api!.send({
                    buy: proposalId,
                    price: askPrice,
                })) as any;

                if (buyRes?.error) {
                    throw new Error(buyRes.error.message || 'Buy failed');
                }

                const contractId = buyRes?.buy?.contract_id;
                if (!contractId) throw new Error('No contract id returned');

                // Wait for contract result
                setTimeout(
                    async () => {
                        try {
                            const pocRes = (await api_base.api!.send({
                                proposal_open_contract: 1,
                                contract_id: contractId,
                            })) as any;

                            const poc = pocRes?.proposal_open_contract;
                            const profit = Number(poc?.profit || 0);
                            const isWin = profit > 0;

                            runInAction(() => {
                                this.current_runs++;
                                this.total_profit = Number((this.total_profit + profit).toFixed(2));
                                this.is_executing_trade = false;
                                this.trade_log.unshift({
                                    time: new Date().toLocaleTimeString(),
                                    market: result.displayName,
                                    direction: this.is_in_recovery_mode ? 'RECOVERY (Under 7)' : result.direction,
                                    prediction: barrier !== null ? barrier : 0,
                                    result: isWin ? 'WIN' : 'LOSS',
                                    profit,
                                });

                                if (!isWin) {
                                    // If Differs lost (or already recovering), switch to Over/Under (Under 7)
                                    if (result.strategy === 'differs' || this.primary_strategy === 'differs') {
                                        this.is_in_recovery_mode = true;
                                        this.primary_strategy = 'differs';
                                        this.scan_status = `🛡️ Differs loss detected (-$${this.stake.toFixed(2)}). Strategy switched to Over/Under (Under 7) for Martingale recovery...`;
                                    }
                                    if (this.use_martingale) {
                                        const mult = this.is_in_recovery_mode
                                            ? Math.max(2.5, this.martingale)
                                            : this.martingale;
                                        this.stake = Number((this.stake * mult).toFixed(2));
                                    }
                                } else {
                                    if (this.is_in_recovery_mode) {
                                        this.is_in_recovery_mode = false;
                                        this.scan_status = `✅ Recovery win (+$${profit.toFixed(2)})! Reverted to initial Differs strategy.`;
                                    }
                                    this.stake = this.initial_stake;
                                }

                                if (this.total_profit >= this.take_profit) {
                                    this.scan_status = `🎉 Take profit reached (+$${this.total_profit.toFixed(2)} USD)!`;
                                    this.stopScanning();
                                } else if (this.total_profit <= -this.stop_loss) {
                                    this.scan_status = `🛑 Stop loss reached (-$${Math.abs(this.total_profit).toFixed(2)} USD).`;
                                    this.stopScanning();
                                } else if (this.current_runs >= this.max_runs_before_pause) {
                                    this.pauseAndReanalyze();
                                } else {
                                    // Strictly wait for the next confirmed entry trigger on this market
                                    this.scan_phase = 'waiting_entry';
                                    this.wait_sequence = [];
                                    this.scan_status = `⏳ Trade completed. Strictly waiting for next confirmed entry trigger on ${result.displayName}...`;
                                }
                            });
                        } catch (e: any) {
                            runInAction(() => {
                                this.is_executing_trade = false;
                            });
                        }
                    },
                    this.duration * 1000 + 1500
                );
            } catch (err: any) {
                runInAction(() => {
                    this.scan_status = `⚠️ Execution notice: ${err?.message || err}. Retrying in 3s...`;
                    this.is_executing_trade = false;
                });
                setTimeout(() => {
                    if (this.scan_phase === 'trading') this.executeTrade();
                }, 3000);
            }
        })();
    }

    public getContractType(result: TScanResult): string {
        if (this.is_in_recovery_mode) {
            return 'DIGITUNDER';
        }
        switch (result.strategy) {
            case 'over_under':
                return result.direction === 'UNDER' ? 'DIGITUNDER' : 'DIGITOVER';
            case 'even_odd':
                return result.direction === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';
            case 'differs':
                return 'DIGITDIFF';
            case 'matches':
                return 'DIGITMATCH';
            case 'rise_fall':
                return result.direction === 'RISE' ? 'CALL' : 'PUT';
            default:
                return 'DIGITUNDER';
        }
    }

    public getBarrier(result: TScanResult): number | null {
        if (this.is_in_recovery_mode) {
            return 7;
        }
        switch (result.strategy) {
            case 'over_under':
                return result.prediction;
            case 'differs':
            case 'matches':
                return result.prediction;
            default:
                return null;
        }
    }

    // ─── Pause & Cooldown ─────────────────────────────────────

    @action private pauseAndReanalyze() {
        const prevMarket = this.scan_result?.displayName || this.selected_market;
        const prevSymbol = this.scan_result?.symbol || this.selected_symbol;
        this.scan_phase = 'cooldown';
        this.scan_status = `⏸️ Completed ${this.current_runs} runs on ${prevMarket}. Pausing & searching for another high-probability market...`;

        if (this.active_auto_run_id) {
            void this.stopDerivAutomationRun();
        }
        if (this._buy_sub) {
            this._buy_sub.unsubscribe();
            this._buy_sub = null;
        }

        this._cooldown_timer = setTimeout(() => {
            runInAction(() => {
                this.scan_phase = 'scanning';
                this.scan_result = null;
                this.selected_market = '';
                this.selected_symbol = '';
                this.trade_type = '';
                this.wait_sequence = [];
                this.current_runs = 0;
                this.scan_status = `🔄 Scanning all synthetic markets to rotate from ${prevMarket}...`;
                this.runAnalysis(prevSymbol);
            });
        }, 4000);
    }

    // ─── Bot Generation & Blockly Loading ─────────────────────

    @action public loadBotToBuilderAndRun(autoRun: boolean = true) {
        if (!this.scan_result) return;
        const result = this.scan_result;
        const contract_type = this.getContractType(result);
        const barrier = this.custom_prediction !== null ? this.custom_prediction : this.getBarrier(result);
        const targetSymbol = result.symbol || this.target_single_symbol || '1HZ100V';

        // Map to Quick Strategy trade type categories
        let tradetype = 'overunder';
        if (result.strategy === 'even_odd') tradetype = 'evenodd';
        else if (result.strategy === 'differs' || result.strategy === 'matches') tradetype = 'matchesdiffers';
        else if (result.strategy === 'rise_fall') tradetype = 'callput';

        const qs = this.root_store?.quick_strategy;
        if (qs) {
            qs.setSelectedStrategy('MARTINGALE');
            qs.setValue('symbol', targetSymbol);
            qs.setValue('tradetype', tradetype);
            qs.setValue('type', contract_type);
            qs.setValue('stake', Number(this.stake) || 0.5);
            qs.setValue('size', Number(this.martingale) || 2);
            qs.setValue('profit', Number(this.take_profit) || 10);
            qs.setValue('loss', Number(this.stop_loss) || 50);
            qs.setValue('durationtype', 't');
            qs.setValue('duration', Number(this.duration) || 1);
            qs.setValue('action', autoRun ? 'RUN' : 'BUILD');

            if (barrier !== null) {
                qs.setValue('last_digit_prediction', Number(barrier));
            }

            // Build/import strategy XML DOM to Blockly workspace and optionally run
            void qs.onSubmit(qs.form_data);
        }

        // Switch active tab to Bot Builder workspace if available
        if (this.root_store?.dashboard?.setActiveTab) {
            this.root_store.dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
        }

        this.scan_phase = 'trading';
        this.scan_status = `🚀 Bot loaded for ${result.displayName} (${contract_type}). ${autoRun ? 'Trading active!' : 'Ready in Bot Builder.'}`;
    }

    @action public generateAndLoadBot() {
        this.loadBotToBuilderAndRun(true);
    }

    // ─── Computed ─────────────────────────────────────────────

    @computed get is_entry_found(): boolean {
        return this.scan_result !== null;
    }

    @computed get phase_color(): string {
        switch (this.scan_phase) {
            case 'idle':
                return '#94a3b8';
            case 'scanning':
                return '#06b6d4';
            case 'analyzing':
                return '#f59e0b';
            case 'waiting_entry':
                return '#8b5cf6';
            case 'trading':
                return '#10b981';
            case 'cooldown':
                return '#ef4444';
            case 'paused':
                return '#f97316';
            default:
                return '#94a3b8';
        }
    }
}
