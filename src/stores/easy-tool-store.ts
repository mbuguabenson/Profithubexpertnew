import { action, makeObservable, observable, reaction, runInAction } from 'mobx';
import { api_base, ApiHelpers, observer as globalObserver } from '@/external/bot-skeleton';
import { safeSubscribe } from '@/utils/websocket-handler';
import RootStore from './root-store';

export type TMarketItem = {
    value: string;
    label: string;
    market?: string;
    submarket?: string;
};

export type TMarketGroup = {
    group: string;
    items: TMarketItem[];
};

export default class EasyToolStore {
    root_store: RootStore;

    @observable accessor symbol: string = '1HZ100V';
    @observable accessor current_price: number | null = null;
    @observable accessor last_digit: number | null = null;
    @observable accessor ticks: number[] = [];
    @observable accessor stats_sample_size: number = 1000;
    @observable accessor markets: TMarketGroup[] = [];
    @observable accessor is_loading_markets: boolean = false;
    @observable accessor is_loading_ticks: boolean = false;
    @observable accessor is_connected: boolean = false;

    private _tick_sub: any = null;
    private _is_subscribing: boolean = false;

    constructor(root_store: RootStore) {
        makeObservable(this);
        this.root_store = root_store;

        // Auto-fetch markets & subscribe when socket connects
        reaction(
            () => this.root_store.common?.is_socket_opened,
            is_socket_opened => {
                this.is_connected = !!is_socket_opened;
                if (is_socket_opened) {
                    this.fetchMarkets();
                    this.subscribeToActiveSymbol();
                } else {
                    this.unsubscribe();
                }
            }
        );

        // Account switch or token authorization
        if (typeof window !== 'undefined') {
            window.addEventListener('account_switched', () => {
                this.fetchMarkets();
                this.subscribeToActiveSymbol();
            });
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && (!this.ticks || this.ticks.length === 0)) {
                    this.subscribeToActiveSymbol();
                }
            });
        }

        globalObserver.register('api.authorize', () => {
            this.fetchMarkets();
            this.subscribeToActiveSymbol();
        });

        // Initialize immediately
        this.initWebSocketConnection();
    }

    @action
    private initWebSocketConnection = async () => {
        // If api_base has cached active_symbols from WebSocket, populate immediately
        if (api_base.active_symbols && Array.isArray(api_base.active_symbols) && api_base.active_symbols.length > 0) {
            this.processWebSocketSymbols(api_base.active_symbols);
        }

        // Poll/wait for ready WebSocket
        const checkConnection = () => {
            if (api_base.api) {
                runInAction(() => {
                    this.is_connected = true;
                });
                this.fetchMarkets();
                this.subscribeToActiveSymbol();
            } else {
                setTimeout(checkConnection, 800);
            }
        };
        checkConnection();
    };

    @action
    setSymbol = (symbol: string) => {
        if (this.symbol === symbol) return;
        this.symbol = symbol;
        this.ticks = [];
        this.current_price = null;
        this.last_digit = null;
        this.subscribeToActiveSymbol();
    };

    @action
    setStatsSampleSize = (size: number) => {
        this.stats_sample_size = size;
    };

    /**
     * Group raw active_symbols from Deriv WebSocket by submarket/market display names
     */
    @action
    processWebSocketSymbols = (rawSymbols: any[]) => {
        if (!rawSymbols || !Array.isArray(rawSymbols) || rawSymbols.length === 0) return;

        const groupMap = new Map<string, TMarketItem[]>();

        rawSymbols.forEach((s: any) => {
            if (s.is_trading_suspended) return;
            const sym = s.symbol || s.underlying_symbol;
            if (!sym) return;

            const label = s.display_name || s.symbol_display_name || sym;
            const groupName =
                s.submarket_display_name ||
                s.market_display_name ||
                (s.market === 'synthetic_index' ? 'Derived Indices' : s.market) ||
                'Markets';

            if (!groupMap.has(groupName)) {
                groupMap.set(groupName, []);
            }

            groupMap.get(groupName)!.push({
                value: sym,
                label,
                market: s.market,
                submarket: s.submarket,
            });
        });

        const grouped: TMarketGroup[] = [];
        groupMap.forEach((items, group) => {
            grouped.push({
                group,
                items: items.sort((a, b) => a.label.localeCompare(b.label)),
            });
        });

        // Sort groups with Derived / Continuous first
        grouped.sort((a, b) => {
            if (a.group.toLowerCase().includes('continuous')) return -1;
            if (b.group.toLowerCase().includes('continuous')) return 1;
            if (a.group.toLowerCase().includes('derived')) return -1;
            if (b.group.toLowerCase().includes('derived')) return 1;
            return a.group.localeCompare(b.group);
        });

        runInAction(() => {
            this.markets = grouped;
            this.is_loading_markets = false;

            // If current symbol is not in available symbols, select the first one
            const allValues = grouped.flatMap(g => g.items.map(i => i.value));
            if (allValues.length > 0 && !allValues.includes(this.symbol)) {
                this.symbol = allValues[0];
            }
        });
    };

    /**
     * Fetch active_symbols directly over Deriv WebSocket
     */
    @action
    fetchMarkets = async (retryCount = 0) => {
        this.is_loading_markets = true;
        let symbols: any[] = [];

        try {
            if (api_base.api) {
                // Direct Deriv WebSocket active_symbols send
                const res: any = await api_base.api.send({ active_symbols: 'brief', product_type: 'basic' });
                if (res?.active_symbols && Array.isArray(res.active_symbols) && res.active_symbols.length > 0) {
                    symbols = res.active_symbols;
                }
            }
        } catch (error) {
            console.debug('[EasyToolStore] WS active_symbols send notice:', error);
        }

        // Fallback to ApiHelpers or api_base.active_symbols if send timed out
        if (symbols.length === 0) {
            try {
                if (api_base.active_symbols && Array.isArray(api_base.active_symbols) && api_base.active_symbols.length > 0) {
                    symbols = api_base.active_symbols;
                } else if (
                    ApiHelpers.instance &&
                    typeof (ApiHelpers.instance as any).active_symbols?.retrieveActiveSymbols === 'function'
                ) {
                    symbols = await (ApiHelpers.instance as any).active_symbols.retrieveActiveSymbols();
                }
            } catch (e) {
                console.debug('[EasyToolStore] ApiHelpers retrieveActiveSymbols notice:', e);
            }
        }

        if (symbols && symbols.length > 0) {
            this.processWebSocketSymbols(symbols);
        } else if (retryCount < 5) {
            setTimeout(() => this.fetchMarkets(retryCount + 1), 1500);
        } else {
            runInAction(() => {
                this.is_loading_markets = false;
            });
        }
    };

    @action
    unsubscribe = () => {
        if (this._tick_sub) {
            if (typeof this._tick_sub === 'function') {
                this._tick_sub();
            } else if (typeof this._tick_sub.unsubscribe === 'function') {
                this._tick_sub.unsubscribe();
            }
            this._tick_sub = null;
        }
    };

    /**
     * Stream live ticks directly from Deriv WebSocket for active symbol
     */
    @action
    subscribeToActiveSymbol = async (retryCount = 0) => {
        if (this._is_subscribing) return;
        this.unsubscribe();
        this._is_subscribing = true;
        this.is_loading_ticks = true;

        const sym = this.symbol;

        try {
            if (!api_base.api || (api_base.api as any)?.connection?.readyState !== 1) {
                try {
                    await api_base.init();
                } catch {}
            }

            if (!api_base.api) {
                if (retryCount < 5) {
                    setTimeout(() => {
                        this._is_subscribing = false;
                        this.subscribeToActiveSymbol(retryCount + 1);
                    }, 1000);
                } else {
                    this._is_subscribing = false;
                    this.is_loading_ticks = false;
                }
                return;
            }

            // 1. Initial tick history straight from WebSocket
            try {
                const res: any = await api_base.api.send({
                    ticks_history: sym,
                    end: 'latest',
                    count: this.stats_sample_size || 1000,
                    style: 'ticks',
                });

                if (this.symbol !== sym) {
                    this._is_subscribing = false;
                    return;
                }

                const history = res?.history || res?.ticks_history;
                if (history?.prices && Array.isArray(history.prices) && history.prices.length > 0) {
                    const prices: number[] = history.prices.map((p: any) => Number(p));
                    runInAction(() => {
                        this.ticks = prices;
                        const last = prices[prices.length - 1];
                        this.current_price = last;
                        const quoteStr = (last || 0).toString();
                        const parts = quoteStr.split('.');
                        const decimalPart = parts[1] || '0';
                        this.last_digit = parseInt(decimalPart[decimalPart.length - 1] || '0', 10);
                        this.is_loading_ticks = false;
                    });
                }
            } catch (e) {
                console.debug('[EasyToolStore] WS ticks_history notice:', e);
            }

            if (this.symbol !== sym) {
                this._is_subscribing = false;
                return;
            }

            // 2. Real-time tick stream over WebSocket using safeSubscribe
            const tickObservable = (api_base.api as any)?.subscribe?.({ ticks: sym });
            if (tickObservable) {
                this._tick_sub = safeSubscribe(tickObservable, (data: any) => {
                    if (data?.tick && data.tick.symbol === sym) {
                        const quote = Number(data.tick.quote);
                        const quoteStr = (data.tick.quote || 0).toString();
                        const parts = quoteStr.split('.');
                        const decimalPart = parts[1] || '0';
                        const digit = parseInt(decimalPart[decimalPart.length - 1] || '0', 10);

                        runInAction(() => {
                            this.current_price = quote;
                            this.last_digit = digit;
                            this.ticks.push(quote);
                            if (this.ticks.length > 2000) {
                                this.ticks.shift();
                            }
                        });
                    }
                });
            }
        } finally {
            this._is_subscribing = false;
        }
    };
}
