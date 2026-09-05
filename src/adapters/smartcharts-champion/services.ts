/**
 * Services layer wrapper for SmartCharts Champion Adapter
 * Wraps the existing ApiHelpers to match the TServices interface
 */

import ApiHelpers from '@/external/bot-skeleton/services/api/api-helpers';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { ALL_DERIV_MARKETS } from '@/constants/markets';
import type { TServices } from './types';

// Logger utility for services layer
const logger = {
    log: () => {}, // Disabled in production
    warn: console.warn.bind(console, '[SmartCharts Services]'),
    error: console.error.bind(console, '[SmartCharts Services]'),
};

/**
 * Type definition for initialized ApiHelpers instance
 */
interface InitializedApiHelpers {
    active_symbols: {
        retrieveActiveSymbols: () => Promise<any>;
        active_symbols?: any[];
    };
    trading_times: {
        initialise: () => Promise<void>;
        trading_times: any;
    };
}

/**
 * Type guard to check if ApiHelpers instance is properly initialized
 */
function isApiHelpersInitialized(instance: any): instance is InitializedApiHelpers {
    return (
        instance &&
        instance.active_symbols &&
        typeof instance.active_symbols.retrieveActiveSymbols === 'function' &&
        instance.trading_times &&
        typeof instance.trading_times.initialise === 'function'
    );
}

/**
 * Transform trading times data to SmartCharts Champion format
 * @param tradingTimesData Raw trading times data from TradingTimes class
 * @returns Transformed trading times data
 */
function transformTradingTimesData(tradingTimesData: any): any {
    // Transform to SmartCharts Champion format
    const transformedTradingTimes: any = {};

    // Filter out invalid keys first
    const validKeys = Object.keys(tradingTimesData || {}).filter(symbol => {
        // Skip undefined, null, or invalid symbol keys
        const isValidSymbol =
            symbol &&
            symbol !== 'undefined' &&
            symbol !== 'null' &&
            typeof symbol === 'string' &&
            symbol.trim() !== '' &&
            symbol !== '[object Object]';

        if (!isValidSymbol) {
            logger.warn(`Filtering out invalid symbol key: "${symbol}"`);
            return false;
        }

        return true;
    });

    validKeys.forEach(symbol => {
        const symbolData = tradingTimesData[symbol];

        if (symbolData && typeof symbolData === 'object') {
            // Initialize the structure
            transformedTradingTimes[symbol] = {
                open: [],
                close: [],
                settlement: undefined,
            };

            if (symbolData.is_open_all_day) {
                transformedTradingTimes[symbol].open = ['00:00:00'];
                transformedTradingTimes[symbol].close = ['23:59:59'];
            } else if (symbolData.is_closed_all_day) {
                transformedTradingTimes[symbol].open = ['--'];
                transformedTradingTimes[symbol].close = ['--'];
            } else if (symbolData.times && Array.isArray(symbolData.times)) {
                // Extract open and close times from the times array

                symbolData.times.forEach((timeSession: any) => {
                    if (timeSession && timeSession.open && timeSession.close) {
                        // Convert timestamps to time strings (HH:MM:SS format)
                        let openTime: string;
                        let closeTime: string;

                        // Handle Unix timestamps (numbers) - this is what TradingTimes class actually stores
                        if (typeof timeSession.open === 'number') {
                            openTime = new Date(timeSession.open * 1000).toISOString().substr(11, 8);
                        } else if (timeSession.open instanceof Date) {
                            openTime = timeSession.open.toISOString().substr(11, 8);
                        } else {
                            openTime = String(timeSession.open);
                        }

                        if (typeof timeSession.close === 'number') {
                            closeTime = new Date(timeSession.close * 1000).toISOString().substr(11, 8);
                        } else if (timeSession.close instanceof Date) {
                            closeTime = timeSession.close.toISOString().substr(11, 8);
                        } else {
                            closeTime = String(timeSession.close);
                        }

                        transformedTradingTimes[symbol].open.push(openTime);
                        transformedTradingTimes[symbol].close.push(closeTime);
                    } else {
                        logger.warn(`Invalid time session for ${symbol}:`, timeSession);
                    }
                });
            } else {
                logger.warn(`No valid times array for ${symbol}. Available properties:`, Object.keys(symbolData));

                // Check if this is fallback data with different structure
                if (symbolData.open && symbolData.close) {
                    // This might be fallback data from getTradingTimes utility
                    transformedTradingTimes[symbol].open = Array.isArray(symbolData.open)
                        ? symbolData.open
                        : [symbolData.open];
                    transformedTradingTimes[symbol].close = Array.isArray(symbolData.close)
                        ? symbolData.close
                        : [symbolData.close];
                }
            }
        }
    });

    return transformedTradingTimes;
}

/**
 * Create services wrapper around ApiHelpers
 * @returns TServices implementation
 */
const getFallbackSymbols = () =>
    ALL_DERIV_MARKETS.map(m => ({
        symbol: m.value,
        underlying_symbol: m.value,
        display_name: m.label,
        market: (m as any).market || 'synthetic_index',
        market_display_name: 'Derived',
        submarket: (m as any).submarket || 'random_index',
        submarket_display_name: m.group || 'Continuous Indices',
        subgroup: 'synthetics',
        subgroup_display_name: 'Synthetics',
        pip: 0.01,
        delay_amount: 0,
        exchange_is_open: 1,
        is_trading_suspended: 0,
    }));

function buildDefaultTradingTimes(): any {
    const times: Record<string, any> = {};
    ALL_DERIV_MARKETS.forEach(m => {
        times[m.value] = {
            open: ['00:00:00'],
            close: ['23:59:59'],
            settlement: undefined,
        };
    });
    return times;
}

export function createServices(): TServices {
    return {
        /**
         * Get active symbols data
         * @returns Promise resolving to active symbols array
         */
        async getActiveSymbols(): Promise<any> {
            try {
                const symbols = await api_base.getActiveSymbols();
                if (Array.isArray(symbols) && symbols.length > 0) {
                    return symbols;
                }
                return getFallbackSymbols();
            } catch (error) {
                logger.warn('[SmartCharts Services] getActiveSymbols notice, using fallback:', error);
                return getFallbackSymbols();
            }
        },

        /**
         * Get trading times data
         * @returns Promise resolving to trading times object
         */
        async getTradingTimes(): Promise<any> {
            try {
                const apiHelpers = ApiHelpers.instance as any;

                if (!apiHelpers || !apiHelpers.trading_times) {
                    return buildDefaultTradingTimes();
                }

                // If trading_times is already populated, return immediately
                const existing = apiHelpers.trading_times.trading_times;
                if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) {
                    const transformed = transformTradingTimesData(existing);
                    if (Object.keys(transformed).length > 0) {
                        return transformed;
                    }
                }

                // Race initialise with a fast 400ms timeout so chart connects to markets ASAP
                const timeoutPromise = new Promise(resolve => setTimeout(resolve, 400));
                await Promise.race([
                    apiHelpers.trading_times.initialise().catch(() => {}),
                    timeoutPromise,
                ]);

                // Get the trading times data
                const tradingTimesData = apiHelpers.trading_times.trading_times;

                if (tradingTimesData && typeof tradingTimesData === 'object' && Object.keys(tradingTimesData).length > 0) {
                    const transformed = transformTradingTimesData(tradingTimesData);
                    if (Object.keys(transformed).length > 0) {
                        return transformed;
                    }
                }

                return buildDefaultTradingTimes();
            } catch {
                return buildDefaultTradingTimes();
            }
        },
    };
}
