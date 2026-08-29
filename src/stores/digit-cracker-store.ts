import { action, makeObservable, observable, reaction, runInAction } from 'mobx';
import { api_base, observer as globalObserver } from '@/external/bot-skeleton';
import { DigitStatsEngine } from '@/lib/digit-stats-engine';
import { DigitTradeEngine } from '@/lib/digit-trade-engine';
import { getGroupedMarkets } from '@/constants/markets';
import { safeSubscribe } from '@/utils/websocket-handler';
import RootStore from './root-store';

export type TDigitStat = {
    digit: number;
    count: number;
    percentage: number;
    rank: number;
    power: number;
    is_increasing: boolean;
};

export type TAnalysisHistory = {
    type: 'E' | 'O' | 'U' | 'O_U' | 'M' | 'D' | 'R' | 'F';
    value: string | number;
    color: string;
};

export default class DigitCrackerStore {
    root_store: RootStore;
    stats_engine: DigitStatsEngine;
    trade_engine: DigitTradeEngine;

    @observable accessor digit_stats: TDigitStat[] = [];
    @observable accessor ticks: number[] = [];
    @observable accessor total_ticks = 1000;
    @observable accessor symbol = 'R_100';
    @observable accessor current_price: string | number = '0.00';
    @observable accessor last_digit: number | null = null;
    @observable accessor is_connected = false;
    @observable accessor is_subscribing = false;
    @observable accessor over_under_threshold = 5;
    @observable accessor match_diff_digit = 6;
    @observable accessor pip = 2;

    @observable accessor percentages = {
        even: 50,
        odd: 50,
        over: 50,
        under: 50,
        match: 10,
        differ: 90,
        rise: 50,
        fall: 50,
    };

    @observable accessor even_odd_history: TAnalysisHistory[] = [];
    @observable accessor over_under_history: TAnalysisHistory[] = [];

    @observable accessor matches_config = {
        is_running: false,
        is_auto: false,
        stake: 0.35,
        ticks: 1,
        martingale_enabled: true,
        martingale_multiplier: 11,
        simultaneous_trades: 1,
        enabled_conditions: [true, true, true, true], // C1-C4
        c1_count: 5,
        c3_op: '>=' as '>' | '>=' | '==' | '<' | '<=',
        c3_val: 12,
        verification_stage: 0,
        verification_status: '⏸ Waiting for entry conditions...',
        predictions: [0, 1, 2],
    };

    @observable accessor matches_ranks = {
        most: null as number | null,
        second: null as number | null,
        least: null as number | null,
    };

    @observable accessor markets: { group: string; items: { value: string; label: string }[] }[] = [];
    private unsubscribe_ticks: (() => void) | null = null;

    private symbol_pips: Map<string, number> = new Map();

    // Hardcoded fallback markets so the dropdown is never empty
    private readonly DEFAULT_MARKETS = getGroupedMarkets();

    constructor(root_store: RootStore) {
        makeObservable(this);
        this.root_store = root_store;
        this.stats_engine = new DigitStatsEngine();
        this.trade_engine = new DigitTradeEngine();

        // Pre-populate with defaults so dropdown is never empty
        this.markets = this.DEFAULT_MARKETS;

        this.updateEngineConfig();

        // Wait for API to be ready then connect
        this.waitForApiAndConnect();

        reaction(
            () => this.root_store.common?.is_socket_opened,
            is_socket_opened => {
                this.is_connected = !!is_socket_opened;
                if (is_socket_opened) {
                    this.fetchMarkets();
                    this.subscribeToTicks();
                } else {
                    this.unsubscribeFromTicks();
                }
            }
        );

        if (typeof window !== 'undefined') {
            window.addEventListener('account_switched', () => {
                this.subscribeToTicks();
            });
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && (!this.ticks || this.ticks.length === 0)) {
                    this.subscribeToTicks();
                }
            });
        }
        globalObserver.register('api.authorize', () => {
            this.subscribeToTicks();
        });
    }

    @action
    private waitForApiAndConnect = () => {
        const tryConnect = () => {
            if (api_base.api) {
                runInAction(() => {
                    this.is_connected = true;
                });
                this.fetchMarkets();
                this.subscribeToTicks();
            } else {
                setTimeout(tryConnect, 1000);
            }
        };
        tryConnect();
    };

    @action
    fetchMarkets = async () => {
        let symbols: any[] = [];
        try {
            if (api_base.api) {
                const response = await api_base.api.send({ active_symbols: 'brief' });
                if (response?.active_symbols && Array.isArray(response.active_symbols)) {
                    symbols = response.active_symbols;
                }
            }
        } catch (e) {
            console.warn('[DigitCrackerStore] Failed to fetch active_symbols:', e);
        }

        runInAction(() => {
            if (symbols.length === 0) {
                this.markets = this.DEFAULT_MARKETS;
                return;
            }

            const groups: Record<string, { group: string; items: { value: string; label: string }[] }> = {};
            symbols.forEach((s: any) => {
                if (s.is_trading_suspended) return;
                const group_name = s.market_display_name || s.market || 'Other';
                if (!groups[group_name]) groups[group_name] = { group: group_name, items: [] };
                groups[group_name].items.push({ value: s.symbol, label: s.display_name });

                const pip = Math.abs(Math.log10(s.pip || 0.01));
                this.symbol_pips.set(s.symbol, pip);
                if (s.symbol === this.symbol) {
                    this.pip = pip;
                    this.updateEngineConfig();
                }
            });

            const sorted = Object.values(groups).sort((a, b) => (a?.group || '').localeCompare(b?.group || ''));
            this.markets = sorted.length > 0 ? sorted : this.DEFAULT_MARKETS;
        });
    };

    @action
    updateEngineConfig = () => {
        this.stats_engine.setConfig({
            pip: this.pip,
            total_samples: this.total_ticks,
            over_under_threshold: this.over_under_threshold,
            match_diff_digit: this.match_diff_digit,
        });
        this.updateFromEngine();
    };

    @action
    handleTick = (tick: { symbol: string; quote: number | string; epoch: number }) => {
        try {
            if (tick.symbol !== this.symbol) return;
            console.log(`[DigitCrackerStore] TICK RECV for ${this.symbol}:`, tick.quote);

            const price = Number(tick.quote);
            const new_digit = this.stats_engine.extractLastDigit(price);

            if (!isNaN(new_digit)) {
                const current_ticks = [...this.ticks, new_digit];
                if (current_ticks.length > this.total_ticks) current_ticks.shift();

                this.ticks = current_ticks;
                this.last_digit = new_digit;
                this.current_price = price;

                // Update stats engine
                this.stats_engine.updateWithHistory(current_ticks, price);
                this.updateFromEngine();

                // Feed tick to trade engine — this is what triggers actual trades
                const currency = this.root_store.client?.currency || 'USD';
                this.trade_engine.processTick(
                    new_digit,
                    {
                        percentages: this.stats_engine.getPercentages(),
                        digit_stats: this.stats_engine.digit_stats,
                        recent_powers: this.stats_engine.recent_powers,
                        ticks: this.ticks,
                        ranks: this.matches_ranks,
                    },
                    this.symbol,
                    currency
                );
            }
        } catch (e) {
            console.error('[DigitCrackerStore] Stream surviving error in handleTick:', e);
        }
    };

    @action
    setSymbol = (symbol: string) => {
        const normalizedSymbol = String(symbol || '').trim();
        if (!normalizedSymbol) {
            console.warn('[DigitCrackerStore] Ignoring invalid symbol selection:', symbol);
            return;
        }
        if (this.symbol === normalizedSymbol) return;

        if (this.unsubscribe_ticks) {
            this.unsubscribe_ticks();
            this.unsubscribe_ticks = null;
        }

        this.symbol = normalizedSymbol;
        this.pip = this.symbol_pips.get(normalizedSymbol) || 2;
        this.ticks = [];
        this.last_digit = null;
        this.current_price = '0.00';
        this.updateEngineConfig();
        this.subscribeToTicks();
    };

    @action
    unsubscribeFromTicks = () => {
        if (this.unsubscribe_ticks) {
            try {
                this.unsubscribe_ticks();
            } catch {}
            this.unsubscribe_ticks = null;
        }
        if (this.active_stream_id && api_base.api) {
            try {
                api_base.api.send({ forget: this.active_stream_id }).catch(() => {});
            } catch {}
            this.active_stream_id = null;
        }
        this.is_subscribing = false;
    };

    private active_stream_id: string | null = null;

    @action
    subscribeToTicks = async (retry_count = 0) => {
        if (!this.symbol || this.is_subscribing) return;

        try {
            if (!api_base.api) {
                if (retry_count < 10) {
                    setTimeout(() => this.subscribeToTicks(retry_count + 1), 1000);
                }
                return;
            }

            // Clear previous subscription
            if (this.unsubscribe_ticks) {
                this.unsubscribe_ticks();
                this.unsubscribe_ticks = null;
            }

            if (this.active_stream_id && api_base.api) {
                try {
                    await api_base.api.send({ forget: this.active_stream_id });
                } catch (e) {}
                this.active_stream_id = null;
            }

            this.is_subscribing = true;
            const sym = this.symbol;
            const safeCount = Math.min(this.total_ticks || 5000, 5000);

            // 1. Initial history
            try {
                const history_res: any = await api_base.api.send({
                    ticks_history: sym,
                    count: safeCount,
                    end: 'latest',
                    style: 'ticks',
                });

                if (this.symbol !== sym) return;

                const history = history_res?.history || history_res?.ticks_history;
                if (history?.prices && Array.isArray(history.prices) && history.prices.length > 0) {
                    runInAction(() => {
                        const last_digits = history.prices.map((p: any) =>
                            this.stats_engine.extractLastDigit(Number(p))
                        );
                        this.ticks = last_digits;
                        this.last_digit = last_digits[last_digits.length - 1] ?? null;
                        this.stats_engine.update(last_digits, history.prices.map(Number));
                        this.updateFromEngine();
                    });
                }
            } catch (histErr) {
                console.warn('[DigitCrackerStore] ticks_history error:', histErr);
            }

            if (this.symbol !== sym) return;

            // 2. Direct RxJS observable via safeSubscribe
            const tickObservable = (api_base.api as any)?.subscribe?.({ ticks: sym });
            const subscription = safeSubscribe(
                tickObservable,
                (tickRes: any) => {
                    if (this.symbol !== sym) return;
                    if (tickRes?.tick && tickRes.tick.symbol === sym) {
                        this.handleTick(tickRes.tick);
                    }
                },
                (err: any) => {
                    console.warn(`[DigitCrackerStore] Stream error for ${sym}:`, err);
                }
            );

            this.unsubscribe_ticks = () => {
                try {
                    subscription?.unsubscribe?.();
                } catch (e) {}
            };

            runInAction(() => {
                this.is_subscribing = false;
            });

            console.log(`[DigitCrackerStore] Subscribed to ${sym}`);
        } catch (e) {
            console.error('[DigitCrackerStore] Subscription failed:', e);
            runInAction(() => {
                this.is_subscribing = false;
            });

            if (retry_count < 5) {
                setTimeout(() => this.subscribeToTicks(retry_count + 1), 2000);
            }
        }
    };

    @action
    updateFromEngine = () => {
        this.digit_stats = this.stats_engine.digit_stats;
        this.percentages = this.stats_engine.getPercentages();
        this.even_odd_history = this.stats_engine.even_odd_history;
        this.over_under_history = this.stats_engine.over_under_history;

        // Calculate Rankings for Matches
        const r = this.stats_engine.getRankedDigits();
        this.matches_ranks = {
            most: r.most,
            second: r.second_most,
            least: r.least,
        };

        // Automated Prediction Target Selection
        if (this.matches_config.is_auto) {
            this.matches_config.predictions = [r.most, r.second_most, r.least];
        }
    };

    @action
    setTotalTicks = (count: number) => {
        this.total_ticks = count;
        this.updateEngineConfig();
        this.subscribeToTicks();
    };

    @action
    dispose = () => {
        if (this.unsubscribe_ticks) {
            this.unsubscribe_ticks();
            this.unsubscribe_ticks = null;
        }
    };
}
