/* eslint-disable no-confusing-arrow */
import { Map } from 'immutable';
import { getLast, historyToTicks } from '../../utils/binary-utils';
import { observer as globalObserver } from '../../utils/observer';
import { doUntilDone, getUUID } from '../tradeEngine/utils/helpers';
import { api_base } from './api-base';

const parseTick = tick => ({
    epoch: +tick.epoch,
    quote: +tick.quote,
});

const parseOhlc = ohlc => ({
    open: +ohlc.open,
    high: +ohlc.high,
    low: +ohlc.low,
    close: +ohlc.close,
    epoch: +(ohlc.open_time || ohlc.epoch),
});

const parseCandles = candles => candles.map(t => parseOhlc(t));

const updateTicks = (ticks, newTick) => {
    const last = getLast(ticks);
    if (!last || !newTick) return [...(ticks || []), newTick].filter(Boolean);
    return last.epoch >= newTick.epoch ? ticks : [...ticks.slice(1), newTick];
};

const updateCandles = (candles, ohlc) => {
    const lastCandle = getLast(candles);
    if (!lastCandle || !ohlc) return [...(candles || []), ohlc].filter(Boolean);
    if (
        (lastCandle.open === ohlc.open &&
            lastCandle.high === ohlc.high &&
            lastCandle.low === ohlc.low &&
            lastCandle.close === ohlc.close &&
            lastCandle.epoch === ohlc.epoch) ||
        lastCandle.epoch > ohlc.epoch
    ) {
        return candles;
    }
    const prevCandles = lastCandle.epoch === ohlc.epoch ? candles.slice(0, -1) : candles.slice(1);
    return [...prevCandles, ohlc];
};

const getType = isCandle => (isCandle ? 'candles' : 'ticks');

export default class TicksService {
    constructor() {
        this.ticks = new Map();
        this.candles = new Map();
        this.tickListeners = new Map();
        this.ohlcListeners = new Map();
        this.subscriptions = new Map();
        this.ticks_history_promise = null;
        this.active_symbols_promise = null;
        this.candles_promise = null;

        this.observe();
    }

    requestPipSizes() {
        if (this.pipSizes) {
            return Promise.resolve(this.pipSizes);
        }

        if (!this.active_symbols_promise) {
            this.active_symbols_promise = new Promise(resolve => {
                this.pipSizes = api_base.pip_sizes;
                resolve(this.pipSizes);
            });
        }
        return this.active_symbols_promise;
    }

    async request(options) {
        return new Promise((resolve, reject) => {
            const { symbol, granularity } = options;

            const style = getType(granularity);

            if (style === 'ticks' && this.ticks.has(symbol)) {
                resolve(this.ticks.get(symbol));
            }

            if (style === 'candles' && this.candles.hasIn([symbol, Number(granularity)])) {
                resolve(this.candles.getIn([symbol, Number(granularity)]));
            }
            this.requestStream({ ...options, style })
                .then(res => {
                    resolve(res);
                })
                .catch(e => {
                    reject(e);
                });
        });
    }

    monitor(options) {
        return new Promise((resolve, reject) => {
            const { symbol, granularity, callback } = options;

            const type = getType(granularity);

            const key = getUUID();
            this.request(options)
                .then(() => {
                    if (type === 'ticks') {
                        this.tickListeners = this.tickListeners.setIn([symbol, key], callback);
                        globalObserver.emit('bot.bot_ready');
                        api_base.toggleRunButton(false);
                    } else {
                        this.ohlcListeners = this.ohlcListeners.setIn([symbol, Number(granularity), key], callback);
                    }
                    resolve(key);
                })
                .catch(e => {
                    globalObserver.emit('Error', e);
                    this.ticks_history_promise = null;
                    api_base.toggleRunButton(false);
                    reject(e);
                });
        });
    }

    async stopMonitor(options) {
        const { symbol, granularity, key } = options;
        const type = getType(granularity);

        if (type === 'ticks' && this.tickListeners.hasIn([symbol, key])) {
            this.tickListeners = this.tickListeners.deleteIn([symbol, key]);
        }

        if (type === 'candles' && this.ohlcListeners.hasIn([symbol, Number(granularity), key])) {
            this.ohlcListeners = this.ohlcListeners.deleteIn([symbol, Number(granularity), key]);
        }

        await this.unsubscribeIfEmptyListeners(options);
    }

    async unsubscribeIfEmptyListeners(options) {
        const { symbol, granularity } = options;

        let needToUnsubscribe = false;

        const tickListener = this.tickListeners.get(symbol);

        if (tickListener && !tickListener.size) {
            this.tickListeners = this.tickListeners.delete(symbol);
            this.ticks = this.ticks.delete(symbol);
            needToUnsubscribe = true;
        }

        const ohlcListener = this.ohlcListeners.getIn([symbol, Number(granularity)]);

        if (ohlcListener && !ohlcListener.size) {
            this.ohlcListeners = this.ohlcListeners.deleteIn([symbol, Number(granularity)]);
            this.candles = this.candles.deleteIn([symbol, Number(granularity)]);
            needToUnsubscribe = true;
        }

        if (needToUnsubscribe) {
            await this.unsubscribeAllAndSubscribeListeners(symbol);
        }
    }

    unsubscribeAllAndSubscribeListeners(symbol) {
        const ohlcSubscriptions = this.subscriptions.getIn(['ohlc', symbol]);

        const subscription = [...(ohlcSubscriptions ? Array.from(ohlcSubscriptions.values()) : [])];

        Promise.all(subscription.map(id => doUntilDone(() => api_base.api.forget(id))));

        this.subscriptions = new Map();
    }

    updateTicksAndCallListeners(symbol, ticks) {
        if (this.ticks.get(symbol) === ticks) {
            return;
        }
        this.ticks = this.ticks.set(symbol, ticks);

        const listeners = this.tickListeners.get(symbol);

        if (listeners) {
            listeners.forEach(callback => callback(this.ticks.get(symbol)));
        }
    }

    updateCandlesAndCallListeners(address, candles) {
        if (this.ticks.getIn(address) === candles) {
            return;
        }
        this.candles = this.candles.setIn(address, candles);

        const listeners = this.ohlcListeners.getIn(address);

        if (listeners) {
            listeners.forEach(callback => callback(this.candles.getIn(address)));
        }
    }

    observe() {
        if (api_base.api) {
            const subscription = api_base.api.onMessage().subscribe(({ data }) => {
                if (data.msg_type === 'tick') {
                    let tick = data.tick;
                    if (!tick || typeof tick !== 'object') {
                        if (data.quote !== undefined || data.price !== undefined) {
                            tick = {
                                symbol: data.symbol || data.echo_req?.ticks,
                                quote: data.quote ?? data.price,
                                epoch: data.epoch || Math.floor(Date.now() / 1000),
                                id: data.id || data.req_id,
                            };
                        } else if (typeof data.tick === 'number' || typeof data.tick === 'string') {
                            tick = {
                                symbol: data.symbol || data.echo_req?.ticks,
                                quote: Number(data.tick),
                                epoch: data.epoch || Math.floor(Date.now() / 1000),
                                id: data.id || data.req_id,
                            };
                        } else {
                            return;
                        }
                    }

                    const { symbol, id } = tick;
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('live_tick_update', { detail: tick }));
                    }
                    if (symbol && this.ticks.has(symbol)) {
                        this.subscriptions = this.subscriptions.setIn(['tick', symbol], id);
                        this.updateTicksAndCallListeners(symbol, updateTicks(this.ticks.get(symbol), parseTick(tick)));
                    }
                }

                    if (data.msg_type === 'ohlc') {
                        const { ohlc } = data;
                        if (!ohlc || typeof ohlc !== 'object') {
                            try {
                                console.warn('[TicksService] Ignoring malformed ohlc message', {
                                    msg_type: data.msg_type,
                                    raw: data?.ohlc ?? null,
                                });
                            } catch (e) {
                                /* noop */
                            }
                            return;
                        }

                        const { symbol, granularity, id } = ohlc;
                        if (this.candles.hasIn([symbol, Number(granularity)])) {
                            this.subscriptions = this.subscriptions.setIn(['ohlc', symbol, Number(granularity)], id);
                            const address = [symbol, Number(granularity)];
                            this.updateCandlesAndCallListeners(
                                address,
                                updateCandles(this.candles.getIn(address), parseOhlc(ohlc))
                            );
                        }
                    }
            });
            api_base.pushSubscription(subscription);
        }
    }

    requestStream(options) {
        const { style } = options;
        const stringified_options = JSON.stringify(options);

        if (style === 'ticks') {
            // Check if we already have a promise for these exact options
            if (!this.ticks_history_promise || this.ticks_history_promise.stringified_options !== stringified_options) {
                this.ticks_history_promise = {
                    promise: this.requestPipSizes().then(() => this.requestTicks(options)).catch(err => {
                        console.warn('[TicksService] ticks_history stream notice:', err?.error?.message || err?.message || err);
                        return this.ticks.get(options.symbol) || [];
                    }),
                    stringified_options,
                };
            }

            return this.ticks_history_promise.promise;
        }

        if (style === 'candles') {
            // Check if we already have a promise for these exact options
            if (!this.candles_promise || this.candles_promise.stringified_options !== stringified_options) {
                this.candles_promise = {
                    promise: this.requestPipSizes().then(() => this.requestTicks(options)).catch(err => {
                        console.warn('[TicksService] candles stream notice:', err?.error?.message || err?.message || err);
                        return this.candles.getIn([options.symbol, Number(options.granularity)]) || [];
                    }),
                    stringified_options,
                };
            }

            return this.candles_promise.promise;
        }

        return [];
    }

    requestTicks(options) {
        const { symbol, granularity, style } = options;
        const targetSymbol = symbol === 'na' || !symbol ? 'R_100' : symbol;
        const request_object = {
            ticks_history: targetSymbol,
            subscribe: 1,
            end: 'latest',
            count: 1000,
            granularity: granularity ? Number(granularity) : undefined,
            style,
        };
        return new Promise(resolve => {
            if (!api_base.api) {
                resolve([]);
                return;
            }

            const processResponse = r => {
                if (style === 'ticks') {
                    const ticks = historyToTicks(r.history || r.ticks_history || []);
                    this.updateTicksAndCallListeners(targetSymbol, ticks);
                    const lastTick = ticks[ticks.length - 1];
                    if (lastTick && typeof window !== 'undefined') {
                        window.dispatchEvent(
                            new CustomEvent('live_tick_update', {
                                detail: { quote: lastTick.quote, symbol: targetSymbol, epoch: lastTick.epoch },
                            })
                        );
                    }
                    resolve(ticks);
                } else {
                    const candles = parseCandles(r.candles || []);
                    this.updateCandlesAndCallListeners([targetSymbol, Number(granularity)], candles);
                    resolve(candles);
                }
            };

            api_base.api
                .send(request_object)
                .then(processResponse)
                .catch(async error => {
                    const errCode = error?.error?.code || error?.code;
                    // If already subscribed, fetch history without subscribe parameter to avoid infinite 5s retry loops
                    if (errCode === 'AlreadySubscribed') {
                        try {
                            const reqNoSub = { ...request_object };
                            delete reqNoSub.subscribe;
                            const r = await api_base.api.send(reqNoSub);
                            processResponse(r);
                            return;
                        } catch (subErr) {
                            console.warn('[TicksService] History fallback notice:', subErr);
                        }
                    }

                    if (style === 'ticks' && this.ticks.has(targetSymbol)) {
                        resolve(this.ticks.get(targetSymbol));
                    } else if (style === 'candles' && this.candles.hasIn([targetSymbol, Number(granularity)])) {
                        resolve(this.candles.getIn([targetSymbol, Number(granularity)]));
                    } else {
                        resolve([]);
                    }
                });
        });
    }

    forget = () => {
        return new Promise(resolve => {
            if (api_base?.api) {
                try {
                    const tickSubscriptions = this.subscriptions.get('tick');
                    const subscriptionIds = tickSubscriptions ? Array.from(tickSubscriptions.values()) : [];
                    this.subscriptions = this.subscriptions.delete('tick');
                    Promise.all(subscriptionIds.map(id => api_base.api.forget(id).catch(() => {})))
                        .then(() => resolve())
                        .catch(() => resolve());
                } catch (e) {
                    console.warn('Error in forget ticks', e);
                    resolve();
                }
            } else {
                resolve();
            }
        });
    };

    forgetCandleSubscription = () => {
        return new Promise(resolve => {
            if (api_base?.api) {
                try {
                    const ohlcSubscriptions = this.subscriptions.get('ohlc');
                    let subscriptionIds = [];
                    if (ohlcSubscriptions) {
                        ohlcSubscriptions.forEach(granularityMap => {
                            if (granularityMap && typeof granularityMap.values === 'function') {
                                subscriptionIds = subscriptionIds.concat(Array.from(granularityMap.values()));
                            }
                        });
                    }
                    this.subscriptions = this.subscriptions.delete('ohlc');
                    Promise.all(subscriptionIds.map(id => api_base.api.forget(id).catch(() => {})))
                        .then(() => resolve())
                        .catch(() => resolve());
                } catch (e) {
                    console.warn('Error in forget candles', e);
                    resolve();
                }
            } else {
                resolve();
            }
        });
    };

    unsubscribeFromTicksService() {
        return new Promise(resolve => {
            this.ticks_history_promise = null;
            Promise.all([this.forget(), this.forgetCandleSubscription()])
                .then(() => resolve())
                .catch(() => resolve());
        });
    }
}
