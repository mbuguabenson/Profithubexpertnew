import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSmartchartsChampionAdapter } from '@/adapters/smartcharts-champion';
import { createServices } from '@/adapters/smartcharts-champion/services';
import { createTransport } from '@/adapters/smartcharts-champion/transport';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import type { SmartchartsChampionAdapter } from '@/types/smartchart.types';
import type {
    ActiveSymbols,
    TGetQuotes,
    TGranularity,
    TradingTimesMap,
    TSubscribeQuotes,
    TUnsubscribeQuotes,
} from '@deriv-com/smartcharts-champion';

// Logger utility
const logger = {
    log: () => {}, // Disabled in production
    warn: console.warn.bind(console, '[SmartCharts Hook]'),
    error: console.error.bind(console, '[SmartCharts Hook]'),
};

// Type guard for valid granularity values
function isValidGranularity(value: unknown): value is TGranularity {
    const validGranularities = [0, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400];
    return typeof value === 'number' && validGranularities.includes(value);
}

interface UseSmartChartAdaptorReturn {
    adapter: SmartchartsChampionAdapter | null;
    adapterInitialized: boolean;
    chartData: {
        activeSymbols: ActiveSymbols;
        tradingTimes: TradingTimesMap;
    };
    getQuotes: TGetQuotes;
    subscribeQuotes: TSubscribeQuotes;
    unsubscribeQuotes: TUnsubscribeQuotes;
    isLoading: boolean;
    error: Error | null;
}

/**
 * Custom hook for SmartChart Adaptor
 * Handles adapter initialization, data fetching, and subscription management
 * with proper memoization and memory leak prevention
 */
export const useSmartChartAdaptor = (): UseSmartChartAdaptorReturn => {
    // State management
    const [adapter, setAdapter] = useState<SmartchartsChampionAdapter | null>(null);
    const [adapterInitialized, setAdapterInitialized] = useState(false);
    const [chartData, setChartData] = useState<{
        activeSymbols: ActiveSymbols;
        tradingTimes: TradingTimesMap;
    }>({
        activeSymbols: [] as ActiveSymbols,
        tradingTimes: {} as TradingTimesMap,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Refs to track mounted state and prevent memory leaks
    const isMountedRef = useRef(true);
    const cleanupFunctionsRef = useRef<Array<() => void>>([]);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref to store timeout for cleanup

    // Track mounted state
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, []);

    const DEFAULT_ACTIVE_SYMBOLS: ActiveSymbols = [
        { symbol: 'R_10', display_name: 'Volatility 10 Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: '1HZ10V', display_name: 'Volatility 10 (1s) Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: 'R_25', display_name: 'Volatility 25 Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: '1HZ25V', display_name: 'Volatility 25 (1s) Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: 'R_50', display_name: 'Volatility 50 Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: '1HZ50V', display_name: 'Volatility 50 (1s) Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: 'R_75', display_name: 'Volatility 75 Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: '1HZ75V', display_name: 'Volatility 75 (1s) Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: 'R_100', display_name: 'Volatility 100 Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
        { symbol: '1HZ100V', display_name: 'Volatility 100 (1s) Index', symbol_type: 'stockindex', market: 'synthetic_index', is_trading_suspended: 0 },
    ] as any;

    const isInitializingRef = useRef(false);

    // Initialize adapter - polls safely until chart_api.api is available (runs ONCE)
    useEffect(() => {
        if (adapterInitialized || isInitializingRef.current) return;

        let initInterval: any = null;

        const tryInitialize = () => {
            if (isInitializingRef.current || adapterInitialized) {
                if (initInterval) clearInterval(initInterval);
                return;
            }
            if (chart_api.api) {
                isInitializingRef.current = true;
                if (initInterval) clearInterval(initInterval);
                try {
                    const transport = createTransport();
                    const services = createServices();
                    const championAdapter = buildSmartchartsChampionAdapter(transport, services, {
                        debug: false,
                        subscriptionTimeout: 30000,
                    });

                    if (isMountedRef.current) {
                        setAdapter(championAdapter);
                        setAdapterInitialized(true);
                        setError(null);
                    }
                } catch (err) {
                    isInitializingRef.current = false;
                    if (isMountedRef.current) {
                        setError(err instanceof Error ? err : new Error('Failed to initialize adapter'));
                        setIsLoading(false);
                    }
                }
            }
        };

        tryInitialize();
        if (!adapterInitialized && !isInitializingRef.current) {
            initInterval = setInterval(tryInitialize, 300);
        }

        return () => {
            if (initInterval) clearInterval(initInterval);
        };
    }, [adapterInitialized]);

    // Load chart data when adapter is initialized
    useEffect(() => {
        if (!adapter || !adapterInitialized) return;

        let cancelled = false;

        const loadChartData = async (retryCount = 0, maxRetries = 5, delayMs = 300) => {
            try {
                setIsLoading(true);
                const data = await adapter.getChartData();

                if (!cancelled && isMountedRef.current) {
                    if (data.activeSymbols && data.activeSymbols.length > 0) {
                        setChartData({
                            activeSymbols: data.activeSymbols,
                            tradingTimes: data.tradingTimes,
                        });
                        setError(null);
                    } else if (retryCount < maxRetries) {
                        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                        retryTimeoutRef.current = setTimeout(() => {
                            if (!cancelled && isMountedRef.current) {
                                loadChartData(retryCount + 1, maxRetries, delayMs);
                            }
                        }, delayMs);
                        return;
                    } else {
                        // Use default active symbols fallback so chart loads instantly without full refresh
                        setChartData({
                            activeSymbols: DEFAULT_ACTIVE_SYMBOLS,
                            tradingTimes: {} as TradingTimesMap,
                        });
                        setError(null);
                    }
                }
            } catch (err) {
                if (!cancelled && isMountedRef.current) {
                    setChartData({
                        activeSymbols: DEFAULT_ACTIVE_SYMBOLS,
                        tradingTimes: {} as TradingTimesMap,
                    });
                }
            } finally {
                if (!cancelled && isMountedRef.current) {
                    setIsLoading(false);
                }
            }
        };

        loadChartData();

        // Cleanup function to cancel async operations
        return () => {
            cancelled = true;

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, [adapter, adapterInitialized]);

    // Memoized getQuotes function
    const getQuotes: TGetQuotes = useCallback(
        async params => {
            if (!adapter) {
                throw new Error('Adapter not initialized');
            }

            const result = await adapter.getQuotes({
                symbol: params.symbol,
                granularity: isValidGranularity(params.granularity) ? params.granularity : 0,
                count: params.count,
                start: params.start,
                end: params.end,
            });

            // Transform adapter result to SmartCharts Champion format
            if (params.granularity === 0) {
                // For ticks, return history format
                return {
                    history: {
                        prices: result.quotes.map(q => q.Close),
                        times: result.quotes.map(q => parseInt(q.Date)),
                    },
                };
            } else {
                // For candles, return candles format
                return {
                    candles: result.quotes.map(q => ({
                        open: q.Open || q.Close,
                        high: q.High || q.Close,
                        low: q.Low || q.Close,
                        close: q.Close,
                        epoch: parseInt(q.Date),
                    })),
                };
            }
        },
        [adapter]
    );

    // Memoized subscribeQuotes function
    const subscribeQuotes: TSubscribeQuotes = useCallback(
        (params, callback) => {
            if (!adapter) {
                return () => {};
            }

            const unsubscribe = adapter.subscribeQuotes(
                {
                    symbol: params.symbol,
                    granularity: isValidGranularity(params.granularity) ? params.granularity : 0,
                },
                quote => {
                    if (isMountedRef.current) {
                        callback(quote);
                    }
                }
            );

            // Create wrapper BEFORE storing/returning to avoid race condition
            const wrappedUnsubscribe = () => {
                unsubscribe();
                const index = cleanupFunctionsRef.current.indexOf(wrappedUnsubscribe);
                if (index > -1) {
                    cleanupFunctionsRef.current.splice(index, 1);
                }
            };

            // Store BEFORE returning to avoid race condition
            cleanupFunctionsRef.current.push(wrappedUnsubscribe);

            return wrappedUnsubscribe;
        },
        [adapter]
    );

    // Memoized unsubscribeQuotes function
    const unsubscribeQuotes: TUnsubscribeQuotes = useCallback(
        request => {
            if (adapter) {
                // If we have request details, use the adapter's unsubscribe method
                if (request?.symbol && typeof request.granularity !== 'undefined') {
                    adapter.unsubscribeQuotes({
                        symbol: request.symbol,
                        granularity: isValidGranularity(request.granularity) ? request.granularity : 0,
                    });
                } else {
                    // Fallback: unsubscribe all via transport
                    adapter.transport.unsubscribeAll('ticks');
                }
            }
        },
        [adapter]
    );

    // Cleanup effect - runs on unmount
    useEffect(() => {
        return () => {
            // Execute all cleanup functions
            cleanupFunctionsRef.current.forEach(cleanup => {
                try {
                    cleanup();
                } catch (err) {
                    logger.error('Error during cleanup:', err);
                }
            });
            cleanupFunctionsRef.current = [];

            // Clean up adapter subscriptions
            if (adapter?.transport) {
                try {
                    adapter.transport.unsubscribeAll('ticks');
                } catch (err) {
                    logger.error('Error unsubscribing from adapter:', err);
                }
            }

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, [adapter]);

    // Return object without useMemo wrapper (callbacks are already memoized)
    return {
        adapter,
        adapterInitialized,
        chartData,
        getQuotes,
        subscribeQuotes,
        unsubscribeQuotes,
        isLoading,
        error,
    };
};
