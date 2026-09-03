import { action, makeObservable, observable, reaction, runInAction } from 'mobx';
import { api_base, ApiHelpers, observer as globalObserver } from '@/external/bot-skeleton';
import { safeSubscribe } from '@/utils/websocket-handler';
import { getAllMarketsFromApi, getGroupedMarkets, GroupedMarketOptions } from '@/constants/markets';
import RootStore from './root-store';

export type TMarketGroup = GroupedMarketOptions;

export default class EasyToolStore {
    root_store: RootStore;

    @observable accessor symbol: string = '1HZ100V';
    @observable accessor current_price: number | null = null;
    @observable accessor last_digit: number | null = null;
    @observable accessor ticks: number[] = [];
    @observable accessor stats_sample_size: number = 1000;
    @observable accessor markets: TMarketGroup[] = getGroupedMarkets();
    @observable accessor is_loading: boolean = false;
    @observable accessor is_connected: boolean = false;

    private _tick_sub: any = null;
    private _is_subscribing: boolean = false;

    constructor(root_store: RootStore) {
        makeObservable(this);
        this.root_store = root_store;

        // Ensure markets are immediately populated
        this.markets = getGroupedMarkets();

        // Socket open reaction
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

        // Account switched or authorized
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
        this.waitForApiAndConnect();
    }

    @action
    private waitForApiAndConnect = () => {
        const tryConnect = () => {
            if (api_base.api) {
                runInAction(() => {
                    this.is_connected = true;
                });
                this.fetchMarkets();
                this.subscribeToActiveSymbol();
            } else {
                setTimeout(tryConnect, 1000);
            }
        };
        tryConnect();
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

    @action
    fetchMarkets = async () => {
        let symbols: any[] = [];
        try {
            if (api_base.api) {
                const res: any = await api_base.api.send({ active_symbols: 'brief' });
                if (res?.active_symbols && Array.isArray(res.active_symbols) && res.active_symbols.length > 0) {
                    symbols = res.active_symbols;
                }
            }
        } catch (error) {
            console.warn('[EasyToolStore] API active_symbols fetch notice:', error);
        }

        if (symbols.length === 0) {
            try {
                if (
                    ApiHelpers.instance &&
                    typeof (ApiHelpers.instance as any).active_symbols?.retrieveActiveSymbols === 'function'
                ) {
                    symbols = await (ApiHelpers.instance as any).active_symbols.retrieveActiveSymbols();
                }
            } catch (e) {
                console.warn('[EasyToolStore] ApiHelpers retrieveActiveSymbols notice:', e);
            }
        }

        if (symbols && symbols.length > 0) {
            const allMarkets = getAllMarketsFromApi(symbols);
            const grouped = getGroupedMarkets(allMarkets);
            runInAction(() => {
                if (grouped.length > 0) {
                    this.markets = grouped;
                }
            });
        } else {
            runInAction(() => {
                this.markets = getGroupedMarkets();
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

    @action
    subscribeToActiveSymbol = async (retryCount = 0) => {
        if (this._is_subscribing) return;
        this.unsubscribe();
        this._is_subscribing = true;
        this.is_loading = true;

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
                    this.is_loading = false;
                }
                return;
            }

            // 1. Initial tick history
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
                        this.is_loading = false;
                    });
                }
            } catch (e) {
                console.debug('[EasyToolStore] History fetch notice:', e);
            }

            if (this.symbol !== sym) {
                this._is_subscribing = false;
                return;
            }

            // 2. Real-time tick stream via safeSubscribe
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
