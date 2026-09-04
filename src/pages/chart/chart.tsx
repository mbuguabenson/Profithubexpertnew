import { useEffect, useState } from 'react';
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
    const { common, ui } = useStore();
    const { chart_store, run_panel, dashboard } = useStore();
    const [isSafari, setIsSafari] = useState(false);

    const {
        chart_type,
        getMarketsOrder,
        granularity,
        onSymbolChange,
        setChartStatus,
        symbol,
        updateChartType,
        updateGranularity,
        updateSymbol,
    } = chart_store;

    // Use the custom hook for SmartChart Adaptor
    const { chartData, getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartAdaptor();

    const { isDesktop, isMobile } = useDevice();
    const { is_drawer_open } = run_panel;
    const { is_chart_modal_visible } = dashboard;

    const settings = {
        assetInformation: false, // ui.is_chart_asset_info_visible,
        countdown: true,
        isHighestLowestMarkerEnabled: false, // TODO: Pending UI,
        language: common.current_language.toLowerCase(),
        position: ui.is_chart_layout_default ? 'bottom' : 'left',
        theme: ui.is_dark_mode_on ? 'dark' : 'light',
    };

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
                const defaultSymbol =
                    chartData.activeSymbols.find(s => s.symbol === 'R_100')?.symbol ||
                    chartData.activeSymbols[0]?.symbol ||
                    'R_100';
                onSymbolChange(defaultSymbol);
            }
        } else if (!symbol) {
            updateSymbol();
        }
    }, [chartData.activeSymbols, symbol, onSymbolChange, updateSymbol]);

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

    const is_connection_opened = !!chart_api?.api;

    const handleStateChange: TStateChangeListener = (state, _options) => {
        /* [AI] - Analytics removed - rudderstack event call removed */
        // Handle state changes: INITIAL, READY, SCROLL_TO_LEFT
        /* [/AI] */
        if (state === 'READY') {
            setChartStatus(true);
        }
    };

    const isSymbolReady =
        Boolean(symbol) &&
        chartData.activeSymbols.length > 0 &&
        chartData.activeSymbols.some(s => s.symbol === symbol) &&
        Boolean(symbol && chartData.tradingTimes && (chartData.tradingTimes as Record<string, any>)[symbol]);

    if (!isSymbolReady) {
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
                bottomWidgets={
                    show_digits_stats
                        ? (((props: any) => (
                              <div
                                  className='bottom-widgets'
                                  style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
                              >
                                  <DigitDistributionCircles digits={props?.digits} tick={props?.tick} />
                              </div>
                          )) as any)
                        : undefined
                }
                showLastDigitStats={show_digits_stats}
                chartControlsWidgets={null}
                enabledChartFooter={false}
                stateChangeListener={handleStateChange}
                toolbarWidget={() => (
                    <ToolbarWidgets
                        updateChartType={updateChartType}
                        updateGranularity={updateGranularity}
                        position={!isDesktop ? 'bottom' : 'top'}
                        isDesktop={isDesktop}
                    />
                )}
                chartType={chart_type}
                isMobile={isMobile}
                enabledNavigationWidget={isDesktop}
                granularity={granularity as TGranularity}
                getQuotes={getQuotes}
                subscribeQuotes={subscribeQuotes}
                unsubscribeQuotes={unsubscribeQuotes}
                chartData={{ activeSymbols: chartData.activeSymbols, tradingTimes: chartData.tradingTimes }}
                settings={settings}
                symbol={symbol}
                topWidgets={() => <ChartTitle onChange={onSymbolChange} />}
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
