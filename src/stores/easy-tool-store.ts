import { action, makeObservable, observable, runInAction } from 'mobx';
import { api_base } from '@/external/bot-skeleton';
import { safeSubscribe } from '@/utils/websocket-handler';
import { getGroupedMarkets } from '@/constants/markets';
import RootStore from './root-store';

export type TMarketGroup = {
    group: string;
    items: { label: string; value: string }[];
};

export default class EasyToolStore {
    root_store: RootStore;

    @observable accessor symbol: string = '1HZ100V';
    @observable accessor current_price: number | null = null;
    @observable accessor last_digit: number | null = null;
    @observable accessor ticks: number[] = [];
    @observable accessor stats_sample_size: number = 1000;
    @observable accessor markets: TMarketGroup[] = [];

    private _tick_sub: any = null;

    constructor(root_store: RootStore) {
        makeObservable(this);
        this.root_store = root_store;
    }

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
        try {
            if (api_base.api) {
                const res: any = await api_base.api.send({ active_symbols: 'brief' });
                if (res?.active_symbols && Array.isArray(res.active_symbols)) {
                    const synthetics = res.active_symbols
                        .filter((s: any) => s.market === 'synthetic_index')
                        .map((s: any) => ({
                            label: s.display_name,
                            value: s.symbol,
                        }));
                    if (synthetics.length > 0) {
                        runInAction(() => {
                            this.markets = [{ group: 'Derived Indices', items: synthetics }];
                        });
                        return;
                    }
                }
            }
        } catch {
            /* fallback below */
        }
        runInAction(() => {
            this.markets = getGroupedMarkets();
        });
    };

    @action
    subscribeToActiveSymbol = async () => {
        if (this._tick_sub) {
            this._tick_sub.unsubscribe?.();
            this._tick_sub = null;
        }

        if (!api_base.api || (api_base.api as any)?.connection?.readyState !== 1) {
            try {
                await api_base.init();
            } catch {}
        }

        if (!api_base.api || (api_base.api as any)?.connection?.readyState !== 1) return;

        const sym = this.symbol;

        // 1. Initial tick history
        try {
            const res: any = await api_base.api.send({
                ticks_history: sym,
                end: 'latest',
                count: 1000,
                style: 'ticks',
            });

            if (res?.history?.prices && Array.isArray(res.history.prices)) {
                const prices: number[] = res.history.prices;
                runInAction(() => {
                    this.ticks = prices;
                    if (prices.length > 0) {
                        const last = prices[prices.length - 1];
                        this.current_price = last;
                        const quoteStr = (last || 0).toString();
                        const parts = quoteStr.split('.');
                        const decimalPart = parts[1] || '0';
                        this.last_digit = parseInt(decimalPart[decimalPart.length - 1] || '0', 10);
                    }
                });
            }
        } catch (e) {
            console.debug('[EasyToolStore] History fetch notice:', e);
        }

        // 2. Real-time tick stream
        try {
            const tickObservable = (api_base.api as any).subscribe({ ticks: sym });
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
                        if (this.ticks.length > 1000) {
                            this.ticks.shift();
                        }
                    });
                }
            });
        } catch (e) {
            console.debug('[EasyToolStore] Stream subscribe notice:', e);
        }
    };
}
