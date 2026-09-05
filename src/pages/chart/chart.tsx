import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
/* [AI] - Analytics removed - rudderstack event tracking removed */
/* [/AI] */
import ChunkLoader from '@/components/loader/chunk-loader';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { useSmartChartAdaptor } from '@/hooks/useSmartChartAdaptor';
import { useStore } from '@/hooks/useStore';
import { ChartTitle, SmartChart, TGranularity, TStateChangeListener } from '@deriv-com/smartcharts-champion';
import { useDevice } from '@deriv-com/ui';
import ToolbarWidgets from './toolbar-widgets';
import DigitDistributionCircles from './digit-distribution-circles';
import '@deriv-com/smartcharts-champion/dist/smartcharts.css';

const Chart = observer(({ show_digits_stats }: { show_digits_stats: boolean }) => {
    const barriers: [] = [];
    const store = useStore();
    const [isSafari, setIsSafari] = useState(false);

    const common = store?.common;
    const ui = store?.ui;
    const chart_store = store?.chart_store;
    const run_panel = store?.run_panel;
    const dashboard = store?.dashboard;

    const chart_type = chart_store?.chart_type;
    const getMarketsOrder = chart_store?.getMarketsOrder;
    const granularity = chart_store?.granularity;
    const onSymbolChange = chart_store?.onSymbolChange || (() => {});
    const setChartStatus = chart_store?.setChartStatus || (() => {});
    const symbol = chart_store?.symbol;
    const updateChartType = chart_store?.updateChartType || (() => {});
    const updateGranularity = chart_store?.updateGranularity || (() => {});
    const updateSymbol = chart_store?.updateSymbol || (() => {});

    // Use the custom hook for SmartChart Adaptor
    const { chartData, getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartAdaptor();

    const { isDesktop, isMobile } = useDevice();
    const is_drawer_open = run_panel?.is_drawer_open ?? false;
    const is_chart_modal_visible = dashboard?.is_chart_modal_visible ?? false;

    const settings = useMemo(() => ({
        assetInformation: false, // ui.is_chart_asset_info_visible,
        countdown: true,
        isHighestLowestMarkerEnabled: false, // TODO: Pending UI,
        language: common?.current_language ? common.current_language.toLowerCase() : 'en',
        position: (ui?.is_chart_layout_default ? 'bottom' : 'left') as 'bottom' | 'left',
        theme: (ui?.is_dark_mode_on ? 'dark' : 'light') as 'dark' | 'light',
    }), [common?.current_language, ui?.is_chart_layout_default, ui?.is_dark_mode_on]);

    useEffect(() => {
        // Safari browser detection using feature detection
        // More robust than user agent sniffing
        const isSafariBrowser = () => {
            // Check for Safari-specific features
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

            // Additional check: Safari has specific webkit features
            const hasWebkitFeatures = 'webkitAudioContext' in window || 'WebKitMediaSource' in window;

            return isSafari && hasWebkitFeatures;
        };

        setIsSafari(isSafariBrowser());

        return () => {
            try {
                chart_api.api?.forgetAll?.('ticks');
            } catch {}
        };
    }, []);

    useEffect(() => {
        if (chartData.activeSymbols.length > 0) {
            const hasValidSymbol = Boolean(symbol && chartData.activeSymbols.some(s => s.symbol === symbol));
            if (!hasValidSymbol) {
                // Auto-select a safe default so the chart never stays stuck
                const defaultSymbol =
                    chartData.activeSymbols.find(s => s.symbol === 'R_100')?.symbol ||
                    chartData.activeSymbols.find(s => s.symbol === 'R_50')?.symbol ||
                    chartData.activeSymbols[0]?.symbol ||
                    'R_100';
                onSymbolChange(defaultSymbol);
            }
        } else if (!symbol) {
            updateSymbol();
        }
    }, [chartData.activeSymbols, symbol, onSymbolChange, updateSymbol]);

    // Safety: if symbols load but selected symbol still invalid after 3s, force a default
    const symbolResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (symbolResetTimerRef.current) clearTimeout(symbolResetTimerRef.current);
        if (chartData.activeSymbols.length > 0 && symbol) {
            const isSymbolInList = chartData.activeSymbols.some(s => s.symbol === symbol);
            if (!isSymbolInList) {
                symbolResetTimerRef.current = setTimeout(() => {
                    const fallback =
                        chartData.activeSymbols.find(s => s.symbol === 'R_100')?.symbol ||
                        chartData.activeSymbols[0]?.symbol ||
                        'R_100';
                    onSymbolChange(fallback);
                }, 3000);
            }
        }
        return () => {
            if (symbolResetTimerRef.current) clearTimeout(symbolResetTimerRef.current);
        };
    }, [chartData.activeSymbols, symbol, onSymbolChange]);

    // Handle chart canvas recalculation when run panel drawer opens/closes or when navigating to chart tab
    useEffect(() => {
        const timer1 = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
        const timer2 = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 280);
        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
        };
    }, [is_drawer_open]);

    // Manage reactive connection state for SmartChart
    const [isSocketConnected, setIsSocketConnected] = useState(() =>
        Boolean(common?.is_socket_opened || chart_api?.api?.connection?.readyState === WebSocket.OPEN)
    );

    useEffect(() => {
        let isMounted = true;

        const updateConnectionStatus = () => {
            if (!isMounted) return;
            const isOpen = Boolean(
                common?.is_socket_opened ||
                chart_api?.api?.connection?.readyState === WebSocket.OPEN
            );
            setIsSocketConnected(prev => (prev !== isOpen ? isOpen : prev));
        };

        updateConnectionStatus();

        // Proactively request chart API initialization if not already done
        chart_api.init?.().then(() => {
            updateConnectionStatus();
            const conn = chart_api.api?.connection;
            if (conn) {
                conn.addEventListener('open', updateConnectionStatus);
                conn.addEventListener('close', updateConnectionStatus);
                conn.addEventListener('error', updateConnectionStatus);
            }
        }).catch(() => {});

        const conn = chart_api.api?.connection;
        if (conn) {
            conn.addEventListener('open', updateConnectionStatus);
            conn.addEventListener('close', updateConnectionStatus);
            conn.addEventListener('error', updateConnectionStatus);
        }

        // Fast poll every 100ms for 3 seconds to catch early socket state transitions
        const intervalId = setInterval(updateConnectionStatus, 100);
        const timeoutId = setTimeout(() => clearInterval(intervalId), 3000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            const currentConn = chart_api.api?.connection;
            if (currentConn) {
                currentConn.removeEventListener('open', updateConnectionStatus);
                currentConn.removeEventListener('close', updateConnectionStatus);
                currentConn.removeEventListener('error', updateConnectionStatus);
            }
        };
    }, [common?.is_socket_opened]);

    const is_connection_opened = Boolean(
        isSocketConnected ||
        common?.is_socket_opened ||
        chart_api?.api?.connection?.readyState === WebSocket.OPEN
    );

    const handleStateChange: TStateChangeListener = (state, _options) => {
        /* [AI] - Analytics removed - rudderstack event call removed */
        // Handle state changes: INITIAL, READY, SCROLL_TO_LEFT
        /* [/AI] */
        if (state === 'READY') {
            setChartStatus(true);
        }
    };

    const effectiveTradingTimes = useMemo(() => {
        const times = { ...(chartData.tradingTimes || {}) };
        if (symbol && !times[symbol]) {
            times[symbol] = {
                isOpen: true,
                openTime: '00:00:00',
                closeTime: '23:59:59',
            };
        }
        return times;
    }, [chartData.tradingTimes, symbol]);

    const chartDataProp = useMemo(() => ({
        activeSymbols: chartData.activeSymbols,
        tradingTimes: effectiveTradingTimes,
    }), [chartData.activeSymbols, effectiveTradingTimes]);

    const renderToolbarWidget = useCallback(() => (
        <ToolbarWidgets
            updateChartType={updateChartType}
            updateGranularity={updateGranularity}
            position={!isDesktop ? 'bottom' : 'top'}
            isDesktop={isDesktop}
        />
    ), [updateChartType, updateGranularity, isDesktop]);

    const renderTopWidgets = useCallback(() => (
        <ChartTitle onChange={onSymbolChange} />
    ), [onSymbolChange]);

    const renderBottomWidgets = useCallback((props: any) => (
        <div
            className='bottom-widgets'
            style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
        >
            <DigitDistributionCircles digits={props?.digits} tick={props?.tick} />
        </div>
    ), []);

    // isSymbolReady: allow render if activeSymbols loaded and symbol is either valid
    // OR has a fallback default ready — avoids infinite spinner on stale stored symbols
    const isSymbolReady =
        Boolean(symbol) &&
        (
            chartData.activeSymbols.some(s => s.symbol === symbol) ||
            // If symbols are loaded but don't contain the stored symbol, still render
            // (the useEffect above will update the symbol shortly)
            (chartData.activeSymbols.length > 0 && Boolean(symbol))
        );

    if (!store || !chart_store || !isSymbolReady) {
        return <ChunkLoader message='' />;
    }

    return (
        <div
            className={classNames('dashboard__chart-wrapper', {
                'dashboard__chart-wrapper--expanded': is_drawer_open && isDesktop,
                'dashboard__chart-wrapper--modal': is_chart_modal_visible && isDesktop,
                'dashboard__chart-wrapper--safari': isSafari,
            })}
            dir='ltr'
        >
            <SmartChart
                id={`dbot-${symbol}`}
                key={`chart-${symbol}`}
                barriers={barriers}
                bottomWidgets={show_digits_stats ? (renderBottomWidgets as any) : undefined}
                showLastDigitStats={show_digits_stats}
                chartControlsWidgets={null}
                enabledChartFooter={false}
                stateChangeListener={handleStateChange}
                toolbarWidget={renderToolbarWidget}
                chartType={chart_type}
                isMobile={isMobile}
                enabledNavigationWidget={isDesktop}
                granularity={granularity as TGranularity}
                getQuotes={getQuotes}
                subscribeQuotes={subscribeQuotes}
                unsubscribeQuotes={unsubscribeQuotes}
                chartData={chartDataProp}
                settings={settings}
                symbol={symbol}
                topWidgets={renderTopWidgets}
                isConnectionOpened={is_connection_opened}
                getMarketsOrder={getMarketsOrder}
                isLive
                leftMargin={isDesktop ? 20 : 10}
                yAxisMargin={{ top: 0, bottom: 0 }}
                drawingToolFloatingMenuPosition={isMobile ? { x: 100, y: 100 } : { x: 200, y: 200 }}
            />
        </div>
    );
});

export default Chart;
