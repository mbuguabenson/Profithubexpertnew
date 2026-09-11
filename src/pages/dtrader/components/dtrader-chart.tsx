import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { ChartTitle, SmartChart, TGranularity, TStateChangeListener } from '@deriv-com/smartcharts-champion';
import { useDevice } from '@deriv-com/ui';
import ChunkLoader from '@/components/loader/chunk-loader';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { useSmartChartAdaptor } from '@/hooks/useSmartChartAdaptor';
import { useStore } from '@/hooks/useStore';
import ToolbarWidgets from '@/pages/chart/toolbar-widgets';
import type { OpenPosition } from '@/adapters/dtrader';
import '@deriv-com/smartcharts-champion/dist/smartcharts.css';

interface DTraderChartProps {
    symbol: string;
    onSymbolChange: (symbol: string) => void;
    barrier?: string;
    openPositions?: OpenPosition[];
    className?: string;
}

export const DTraderChart: React.FC<DTraderChartProps> = memo(({
    symbol,
    onSymbolChange,
    barrier,
    openPositions = [],
    className,
}) => {
    const store = useStore();
    const ui = store?.ui;
    const common = store?.common;
    const chart_store = store?.chart_store;

    const { isDesktop, isMobile } = useDevice();
    const { chartData, getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartAdaptor();

    const [chartType, setChartType] = useState<string>(chart_store?.chart_type || 'line');
    const [granularity, setGranularity] = useState<TGranularity>((chart_store?.granularity as TGranularity) || 0);

    const updateChartType = useCallback((type: string) => {
        setChartType(type);
        chart_store?.updateChartType?.(type);
    }, [chart_store]);

    const updateGranularity = useCallback((gran: number) => {
        setGranularity(gran as TGranularity);
        chart_store?.updateGranularity?.(gran);
    }, [chart_store]);

    const settings = useMemo(() => ({
        assetInformation: false,
        countdown: true,
        isHighestLowestMarkerEnabled: false,
        language: common?.current_language ? common.current_language.toLowerCase() : 'en',
        position: 'bottom' as const,
        theme: (ui?.is_dark_mode_on ? 'dark' : 'light') as 'dark' | 'light',
    }), [common?.current_language, ui?.is_dark_mode_on]);

    // Construct barriers array for SmartCharts
    const barriers = useMemo(() => {
        const list: any[] = [];

        // Add barrier offset line if defined
        if (barrier && barrier.trim() !== '') {
            list.push({
                color: '#3b82f6',
                lineStyle: 'dashed',
                shade: 'NONE_SINGLE',
                title: `Barrier ${barrier}`,
                value: barrier,
                relative: barrier.startsWith('+') || barrier.startsWith('-'),
                draggable: false,
            });
        }

        // Add active open position barriers / entry spots
        openPositions.forEach(pos => {
            if (pos.underlying === symbol) {
                if (pos.entry_spot) {
                    list.push({
                        color: pos.profit >= 0 ? '#10b981' : '#ef4444',
                        lineStyle: 'solid',
                        title: `${pos.contract_type} Entry: ${pos.entry_spot}`,
                        value: pos.entry_spot,
                        relative: false,
                        draggable: false,
                    });
                }
                if (pos.barrier && !isNaN(Number(pos.barrier))) {
                    list.push({
                        color: '#f59e0b',
                        lineStyle: 'dotted',
                        title: `Target: ${pos.barrier}`,
                        value: Number(pos.barrier),
                        relative: false,
                        draggable: false,
                    });
                }
            }
        });

        return list;
    }, [barrier, openPositions, symbol]);

    // Handle connection state
    const [isSocketConnected, setIsSocketConnected] = useState(() =>
        Boolean(common?.is_socket_opened || chart_api?.api?.connection?.readyState === WebSocket.OPEN)
    );

    useEffect(() => {
        let isMounted = true;
        const check = () => {
            if (!isMounted) return;
            const isOpen = Boolean(common?.is_socket_opened || chart_api?.api?.connection?.readyState === WebSocket.OPEN);
            setIsSocketConnected(isOpen);
        };
        check();
        const conn = chart_api.api?.connection;
        if (conn) {
            conn.addEventListener('open', check);
            conn.addEventListener('close', check);
            conn.addEventListener('error', check);
        }
        return () => {
            isMounted = false;
            if (conn) {
                conn.removeEventListener('open', check);
                conn.removeEventListener('close', check);
                conn.removeEventListener('error', check);
            }
        };
    }, [common?.is_socket_opened]);

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

    const handleStateChange: TStateChangeListener = useCallback(() => {}, []);

    const isSymbolReady =
        Boolean(symbol) &&
        (chartData.activeSymbols.some(s => s.symbol === symbol) || chartData.activeSymbols.length > 0);

    if (!isSymbolReady) {
        return (
            <div className='dtrader-chart-loader'>
                <ChunkLoader message='Loading chart feed...' />
            </div>
        );
    }

    return (
        <div className={classNames('dtrader-chart-container', className)} dir='ltr'>
            <SmartChart
                id={`dtrader-${symbol}`}
                key={`dtrader-chart-${symbol}`}
                barriers={barriers}
                showLastDigitStats={false}
                chartControlsWidgets={null}
                enabledChartFooter={false}
                stateChangeListener={handleStateChange}
                toolbarWidget={renderToolbarWidget}
                chartType={chartType}
                isMobile={isMobile}
                enabledNavigationWidget={isDesktop}
                granularity={granularity}
                getQuotes={getQuotes}
                subscribeQuotes={subscribeQuotes}
                unsubscribeQuotes={unsubscribeQuotes}
                chartData={chartDataProp}
                settings={settings}
                symbol={symbol}
                topWidgets={renderTopWidgets}
                isConnectionOpened={isSocketConnected}
                isLive
                leftMargin={isDesktop ? 20 : 10}
                yAxisMargin={{ top: 10, bottom: 10 }}
            />
        </div>
    );
});

DTraderChart.displayName = 'DTraderChart';
export default DTraderChart;
