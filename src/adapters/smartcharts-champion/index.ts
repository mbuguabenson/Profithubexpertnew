/**
 * SmartCharts Champion Adapter
 * Provides the adapter pattern implementation for migrating from derivatives-charts to smartcharts-champion
 * Based on docs/adapter-design-smartcharts-champion.md
 */

import { ActiveSymbol } from '@deriv-com/smartcharts-champion';
import type {
    ActiveSymbols,
    AdapterConfig,
    SmartchartsChampionAdapter,
    TGetQuotesRequest,
    TGetQuotesResult,
    TGranularity,
    TQuote,
    TradingTimesMap,
    TServices,
    TSubscriptionCallback,
    TTransport,
    TUnsubscribeFunction,
} from './types';

// Transformation utilities
const transformations = {
    /**
     * Transform Deriv API ticks_history response to TGetQuotesResult
     */
    toTGetQuotesResult(response: any, granularity: TGranularity): TGetQuotesResult {
        const quotes: TQuote[] = [];

        if (!response) {
            return { quotes, meta: { symbol: '', granularity } };
        }

        const { history, candles, prices, times } = response;
        const symbol = response.echo_req?.ticks_history || '';

        // Handle ticks (granularity = 0)
        if (granularity === 0 && history) {
            const { prices: tick_prices, times: tick_times } = history;
            if (tick_prices && tick_times) {
                for (let i = 0; i < tick_prices.length; i++) {
                    const epoch = tick_times[i];
                    quotes.push({
                        Date: new Date(epoch * 1000).toISOString(),
                        Close: tick_prices[i],
                        DT: new Date(epoch * 1000),
                    });
                }
            }
        }
        // Handle candles (granularity > 0)
        else if (granularity > 0 && candles) {
            candles.forEach((candle: any) => {
                const epoch = candle.epoch || candle.open_time;
                quotes.push({
                    Date: new Date(epoch * 1000).toISOString(),
                    Open: typeof candle.open === 'number' ? candle.open : parseFloat(candle.open),
                    High: typeof candle.high === 'number' ? candle.high : parseFloat(candle.high),
                    Low: typeof candle.low === 'number' ? candle.low : parseFloat(candle.low),
                    Close: typeof candle.close === 'number' ? candle.close : parseFloat(candle.close),
                    DT: new Date(epoch * 1000),
                });
            });
        }
        // Fallback for direct prices/times arrays
        else if (prices && times) {
            for (let i = 0; i < prices.length; i++) {
                const epoch = times[i];
                quotes.push({
                    Date: new Date(epoch * 1000).toISOString(),
                    Close: prices[i],
                    DT: new Date(epoch * 1000),
                });
            }
        }

        const rawHistory = history || (prices && times ? { prices, times } : undefined);
        const rawCandles = candles || undefined;

        return {
            quotes,
            history: rawHistory ? {
                prices: rawHistory.prices.map((p: any) => +p),
                times: rawHistory.times.map((t: any) => +t),
            } : undefined,
            candles: rawCandles && Array.isArray(rawCandles) ? rawCandles.map((c: any) => ({
                open: +(c.open || 0),
                high: +(c.high || 0),
                low: +(c.low || 0),
                close: +(c.close || 0),
                epoch: +(c.epoch || c.open_time || 0),
            })) : undefined,
            meta: {
                symbol,
                granularity,
                delay_amount: response.pip_size || 0,
            },
        };
    },

    /**
     * Transform streaming tick/candle message to TQuote
     */
    toTQuoteFromStream(message: any, granularity: TGranularity): TQuote {
        if (granularity === 0) {
            if (message.tick) {
                const { tick } = message;
                const epoch = typeof tick.epoch === 'number' ? tick.epoch : parseInt(tick.epoch);
                return {
                    Date: new Date(epoch * 1000).toISOString(),
                    Close: typeof tick.quote === 'number' ? tick.quote : parseFloat(tick.quote),
                    tick,
                    DT: new Date(epoch * 1000),
                };
            }
            if (message.history?.prices?.length) {
                const lastIdx = message.history.prices.length - 1;
                const epoch = message.history.times[lastIdx];
                const quote = message.history.prices[lastIdx];
                return {
                    Date: new Date(epoch * 1000).toISOString(),
                    Close: quote,
                    DT: new Date(epoch * 1000),
                };
            }
        } else if (granularity > 0) {
            if (message.ohlc) {
                const { ohlc } = message;
                const epoch = typeof ohlc.open_time === 'number' ? ohlc.open_time : parseInt(ohlc.open_time || ohlc.epoch);
                return {
                    Date: new Date(epoch * 1000).toISOString(),
                    Open: parseFloat(ohlc.open),
                    High: parseFloat(ohlc.high),
                    Low: parseFloat(ohlc.low),
                    Close: parseFloat(ohlc.close),
                    ohlc,
                    DT: new Date(epoch * 1000),
                };
            }
            if (message.candles?.length) {
                const last = message.candles[message.candles.length - 1];
                const epoch = last.epoch || last.open_time;
                return {
                    Date: new Date(epoch * 1000).toISOString(),
                    Open: parseFloat(last.open),
                    High: parseFloat(last.high),
                    Low: parseFloat(last.low),
                    Close: parseFloat(last.close),
                    DT: new Date(epoch * 1000),
                };
            }
        }

        // Fallback for direct tick data
        const epoch = typeof message.epoch === 'number' ? message.epoch : parseInt(message.epoch || Date.now() / 1000);
        return {
            Date: new Date(epoch * 1000).toISOString(),
            Close: typeof (message.quote ?? message.price) === 'number' ? (message.quote ?? message.price) : parseFloat(message.quote ?? message.price ?? 0),
            DT: new Date(epoch * 1000),
        };
    },

    /**
     * Transform active symbols response to ActiveSymbols format
     */
    toActiveSymbols(activeSymbolsData: any[]): ActiveSymbol[] {
        const symbols: ActiveSymbol[] = [];

        if (!Array.isArray(activeSymbolsData)) {
            return symbols;
        }

        for (const symbol of activeSymbolsData) {
            if (!symbol || typeof symbol !== 'object') continue;
            const symbolCode = symbol.underlying_symbol || symbol.symbol;
            if (!symbolCode) continue;

            let validPip = 0.01;
            const rawPip = symbol.pip ?? symbol.pip_size;
            const pipNum = typeof rawPip === 'number' ? rawPip : parseFloat(rawPip);
            if (Number.isFinite(pipNum) && pipNum > 0) {
                if (pipNum < 1) {
                    validPip = pipNum;
                } else if (Number.isInteger(pipNum)) {
                    const dec = Math.max(1, Math.min(pipNum, 8));
                    validPip = Number((1 / Math.pow(10, dec)).toFixed(dec));
                }
            }
            if (validPip.toString().length - 2 < 0) {
                validPip = 0.01;
            }

            symbols.push({
                display_name: symbol.display_name || symbolCode,
                market: symbol.market || '',
                market_display_name: symbol.market_display_name || symbol.market || '',
                subgroup: symbol.subgroup || symbol.submarket || '', // Map submarket to subgroup
                subgroup_display_name: symbol.subgroup_display_name || symbol.submarket_display_name || '', // Map submarket_display_name to subgroup_display_name
                submarket: symbol.submarket || '',
                submarket_display_name: symbol.submarket_display_name || '',
                symbol: symbolCode,
                symbol_type: symbol.symbol_type || '',
                pip: validPip,
                exchange_is_open: symbol.exchange_is_open ? 1 : 0,
                is_trading_suspended: symbol.is_trading_suspended ? 1 : 0,
                delay_amount: symbol.delay_amount || 0,
            });
        }

        return symbols;
    },

    /**
     * Transform trading times data to SmartChart expected format
     * SmartChart expects: Record<string, { isOpen: boolean; openTime: string; closeTime: string }>
     */
    toTradingTimesMap(tradingTimesData: any, activeSymbolsData: ActiveSymbol[] = []): TradingTimesMap {
        const tradingTimes: TradingTimesMap = {};

        if (tradingTimesData && typeof tradingTimesData === 'object') {
            Object.keys(tradingTimesData).forEach(symbol => {
                const symbolData = tradingTimesData[symbol];

                if (symbolData) {
                    // Handle the format from services layer (with open/close arrays)
                    if (symbolData.open && symbolData.close) {
                        const openTimes = Array.isArray(symbolData.open) ? symbolData.open : [symbolData.open];
                        const closeTimes = Array.isArray(symbolData.close) ? symbolData.close : [symbolData.close];

                        tradingTimes[symbol] = {
                            isOpen: openTimes.length > 0 && openTimes[0] !== '--',
                            openTime: openTimes[0] || '00:00:00',
                            closeTime: closeTimes[0] || '23:59:59',
                        };
                    }
                    // Handle legacy format with times array
                    else if (symbolData.times && Array.isArray(symbolData.times)) {
                        const firstSession = symbolData.times[0];
                        if (firstSession && firstSession.open && firstSession.close) {
                            const openTime =
                                typeof firstSession.open === 'number'
                                    ? new Date(firstSession.open * 1000).toISOString().substr(11, 8)
                                    : new Date(firstSession.open).toISOString().substr(11, 8);
                            const closeTime =
                                typeof firstSession.close === 'number'
                                    ? new Date(firstSession.close * 1000).toISOString().substr(11, 8)
                                    : new Date(firstSession.close).toISOString().substr(11, 8);

                            tradingTimes[symbol] = {
                                isOpen: true,
                                openTime,
                                closeTime,
                            };
                        }
                    }
                    // Handle direct isOpen/openTime/closeTime format (if already in correct format)
                    else if ('isOpen' in symbolData && 'openTime' in symbolData && 'closeTime' in symbolData) {
                        tradingTimes[symbol] = {
                            isOpen: symbolData.isOpen,
                            openTime: symbolData.openTime || '00:00:00',
                            closeTime: symbolData.closeTime || '23:59:59',
                        };
                    }
                }
            });
        }

        // Guarantee every active symbol has an entry in tradingTimes so SmartCharts never throws undefined error
        if (Array.isArray(activeSymbolsData)) {
            activeSymbolsData.forEach(s => {
                if (s && s.symbol && !tradingTimes[s.symbol]) {
                    tradingTimes[s.symbol] = {
                        isOpen: Boolean(s.exchange_is_open !== 0),
                        openTime: '00:00:00',
                        closeTime: '23:59:59',
                    };
                }
            });
        }

        return tradingTimes;
    },
};

/**
 * Build the SmartCharts Champion adapter
 * @param transport - Transport layer (wraps chart_api.api)
 * @param services - Services layer (wraps ApiHelpers and trading-times)
 * @param config - Optional configuration
 * @returns SmartchartsChampionAdapter instance
 */
export function buildSmartchartsChampionAdapter(
    transport: TTransport,
    services: TServices,
    config: AdapterConfig = {}
): SmartchartsChampionAdapter {
    // Subscription management
    const subscriptions = new Map<string, () => void>();
    const debug = config.debug || false;

    // Create logger utility
    const logger = {
        log: debug ? console.log.bind(console, '[SmartCharts]') : () => {},
        warn: debug ? console.warn.bind(console, '[SmartCharts]') : () => {},
        error: console.error.bind(console, '[SmartCharts]'), // Always log errors
    };

    const adapter: SmartchartsChampionAdapter = {
        transport,
        services,

        /**
         * Get historical quotes for a symbol and granularity
         */
        async getQuotes(request: TGetQuotesRequest): Promise<TGetQuotesResult> {
            try {
                // Build ticks_history request
                const apiRequest: any = {
                    ticks_history: request.symbol,
                    end: request.end || 'latest',
                    count: request.count || 1000,
                    adjust_start_time: 1,
                };

                // Set style and granularity
                if (request.granularity === 0) {
                    apiRequest.style = 'ticks';
                } else {
                    apiRequest.style = 'candles';
                    apiRequest.granularity = request.granularity;
                }

                // Add start time if provided
                if (request.start) {
                    apiRequest.start = request.start;
                    delete apiRequest.count; // Don't use count when start is specified
                }

                const response = await transport.send(apiRequest);

                return transformations.toTGetQuotesResult(response, request.granularity);
            } catch (error) {
                logger.error('Error in getQuotes:', error);
                return {
                    quotes: [],
                    meta: {
                        symbol: request.symbol,
                        granularity: request.granularity,
                    },
                };
            }
        },

        /**
         * Subscribe to live quote updates
         */
        subscribeQuotes(request: TGetQuotesRequest, callback: TSubscriptionCallback): TUnsubscribeFunction {
            const subscriptionKey = `${request.symbol}-${request.granularity}`;

            // Build subscription request
            const apiRequest: any = {
                ticks_history: request.symbol,
                subscribe: 1,
                end: 'latest',
                count: 1,
            };

            if (request.granularity === 0) {
                apiRequest.style = 'ticks';
            } else {
                apiRequest.style = 'candles';
                apiRequest.granularity = request.granularity;
            }

            try {
                const subscriptionId = transport.subscribe(apiRequest, (response: any) => {
                    // Process all streaming messages for this subscription
                    // The transport layer already filters by subscription ID
                    try {
                        const quote = transformations.toTQuoteFromStream(response, request.granularity);
                        if (response?.tick && typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('live_tick_update', { detail: response.tick }));
                        }
                        callback(quote);
                    } catch (error) {
                        logger.error('Error transforming stream message:', error);
                    }
                });

                // Create unsubscribe function
                const unsubscribe = () => {
                    transport.unsubscribe(subscriptionId);
                    subscriptions.delete(subscriptionKey);
                };

                // Store subscription for cleanup
                subscriptions.set(subscriptionKey, unsubscribe);

                return unsubscribe;
            } catch (error) {
                logger.error('Error in subscribeQuotes:', error);
                return () => {}; // Return no-op function on error
            }
        },

        /**
         * Unsubscribe from quote updates (convenience wrapper)
         */
        unsubscribeQuotes(request: TGetQuotesRequest): void {
            const subscriptionKey = `${request.symbol}-${request.granularity}`;
            const unsubscribe = subscriptions.get(subscriptionKey);

            if (unsubscribe) {
                unsubscribe();
            } else {
                logger.warn('No active subscription found for:', subscriptionKey);
            }
        },

        /**
         * Get chart reference data (active symbols and trading times)
         */
        async getChartData(): Promise<{ activeSymbols: ActiveSymbols; tradingTimes: TradingTimesMap }> {
            try {
                // Get active symbols and trading times in parallel
                const [activeSymbolsData, tradingTimesData] = await Promise.all([
                    services.getActiveSymbols(),
                    services.getTradingTimes(),
                ]);

                const activeSymbols = transformations.toActiveSymbols(activeSymbolsData);
                const tradingTimes = transformations.toTradingTimesMap(tradingTimesData, activeSymbols);

                return { activeSymbols, tradingTimes };
            } catch (error) {
                logger.error('Error in getChartData:', error);
                return {
                    activeSymbols: [] as ActiveSymbols,
                    tradingTimes: {} as TradingTimesMap,
                };
            }
        },
    };

    return adapter;
}

// Export types and transformations for convenience
export { transformations };
export type { SmartchartsChampionAdapter, TGetQuotesRequest, TGetQuotesResult } from './types';
