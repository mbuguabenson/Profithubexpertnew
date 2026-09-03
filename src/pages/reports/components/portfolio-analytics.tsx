import React, { useState, useMemo } from 'react';
import { localize } from '@deriv-com/translations';
import { formatMoney, addComma } from '@/components/shared';
import './portfolio-analytics.scss';

interface StrategyStat {
    name: string;
    trades: number;
    wins: number;
    profit: number;
    winRate: number;
    percentage: number;
    color: string;
}

interface PortfolioAnalyticsProps {
    profitList: any[];
    statementList: any[];
    openPositionsCount: number;
    currency: string;
    activeLoginid: string;
}

const STRATEGY_COLORS: Record<string, string> = {
    'Matches / Differs': '#3b82f6',
    'Even / Odd': '#6366f1',
    'Over / Under': '#f59e0b',
    'Rise / Fall': '#10b981',
    'High / Low': '#ec4899',
    Accumulators: '#8b5cf6',
    Multipliers: '#06b6d4',
    'Other Strategies': '#64748b',
};

export const PortfolioAnalytics: React.FC<PortfolioAnalyticsProps> = ({
    profitList,
    statementList,
    openPositionsCount,
    currency,
    activeLoginid,
}) => {
    const [selectedStrategyIndex, setSelectedStrategyIndex] = useState<number | null>(null);
    const [activeFilterPeriod, setActiveFilterPeriod] = useState<'ALL' | '30D' | '7D' | '24H'>('ALL');

    // ── Calculate Deposits, Withdrawals, Net Profit & Total Loss ──
    const financialStats = useMemo(() => {
        let deposits = 0;
        let depositCount = 0;
        let withdrawals = 0;
        let withdrawalCount = 0;

        statementList.forEach(item => {
            const act = (item.action_type || '').toLowerCase();
            const amt = Math.abs(Number(item.amount) || 0);
            if (act === 'deposit') {
                deposits += amt;
                depositCount++;
            } else if (act === 'withdrawal') {
                withdrawals += amt;
                withdrawalCount++;
            }
        });

        let grossProfit = 0;
        let totalLoss = 0;
        let wins = 0;
        let losses = 0;

        profitList.forEach(t => {
            const net = (Number(t.sell_price) || 0) - (Number(t.buy_price) || 0);
            if (net > 0) {
                grossProfit += net;
                wins++;
            } else if (net < 0) {
                totalLoss += Math.abs(net);
                losses++;
            }
        });

        const netProfit = grossProfit - totalLoss;
        const totalTrades = profitList.length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        const profitFactor = totalLoss > 0 ? (grossProfit / totalLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';

        return {
            deposits,
            depositCount,
            withdrawals,
            withdrawalCount,
            grossProfit,
            totalLoss,
            netProfit,
            totalTrades,
            wins,
            losses,
            winRate,
            profitFactor,
        };
    }, [statementList, profitList]);

    // ── Group and Calculate Best Traded Strategies ──
    const strategyStats = useMemo<StrategyStat[]>(() => {
        const map: Record<string, { trades: number; wins: number; profit: number }> = {};

        profitList.forEach(t => {
            const net = (Number(t.sell_price) || 0) - (Number(t.buy_price) || 0);
            const text = `${t.longcode || ''} ${t.shortcode || ''} ${t.contract_type || ''}`.toUpperCase();

            let strategyName = 'Rise / Fall';
            if (
                text.includes('MATCH') ||
                text.includes('DIFF') ||
                text.includes('DIGITMATCH') ||
                text.includes('DIGITDIFF')
            ) {
                strategyName = 'Matches / Differs';
            } else if (
                text.includes('EVEN') ||
                text.includes('ODD') ||
                text.includes('DIGITEVEN') ||
                text.includes('DIGITODD')
            ) {
                strategyName = 'Even / Odd';
            } else if (
                text.includes('OVER') ||
                text.includes('UNDER') ||
                text.includes('DIGITOVER') ||
                text.includes('DIGITUNDER')
            ) {
                strategyName = 'Over / Under';
            } else if (text.includes('ACCU')) {
                strategyName = 'Accumulators';
            } else if (text.includes('MULT') || text.includes('MULTIPLIER')) {
                strategyName = 'Multipliers';
            } else if (text.includes('HIGHER') || text.includes('LOWER') || text.includes('HIGH_LOW')) {
                strategyName = 'High / Low';
            } else if (
                text.includes('CALL') ||
                text.includes('PUT') ||
                text.includes('RISE') ||
                text.includes('FALL')
            ) {
                strategyName = 'Rise / Fall';
            }

            if (!map[strategyName]) {
                map[strategyName] = { trades: 0, wins: 0, profit: 0 };
            }
            map[strategyName].trades++;
            if (net > 0) map[strategyName].wins++;
            map[strategyName].profit += net;
        });

        const totalTrades = profitList.length;
        if (totalTrades === 0) {
            return [];
        }

        const result: StrategyStat[] = Object.keys(map).map(name => {
            const data = map[name];
            return {
                name,
                trades: data.trades,
                wins: data.wins,
                profit: data.profit,
                winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
                percentage: (data.trades / totalTrades) * 100,
                color: STRATEGY_COLORS[name] || '#3b82f6',
            };
        });

        return result.sort((a, b) => b.trades - a.trades);
    }, [profitList]);

    // ── Generate Donut Pie Chart Paths ──
    const donutPaths = useMemo(() => {
        const size = 220;
        const center = size / 2;
        const radius = 75;
        const strokeWidth = 24;

        let accumulatedAngle = -90; // Start at 12 o'clock

        return strategyStats.map((stat, idx) => {
            const angle = (stat.percentage / 100) * 360;
            const startAngle = accumulatedAngle;
            const endAngle = accumulatedAngle + angle;
            accumulatedAngle += angle;

            // Compute SVG arc coordinates
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;

            const x1 = center + radius * Math.cos(startRad);
            const y1 = center + radius * Math.sin(startRad);
            const x2 = center + radius * Math.cos(endRad);
            const y2 = center + radius * Math.sin(endRad);

            const largeArc = angle > 180 ? 1 : 0;
            const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;

            return {
                d,
                color: stat.color,
                stat,
                idx,
                strokeWidth: selectedStrategyIndex === idx ? strokeWidth + 6 : strokeWidth,
            };
        });
    }, [strategyStats, selectedStrategyIndex]);

    const activeDonutInfo = selectedStrategyIndex !== null ? strategyStats[selectedStrategyIndex] : strategyStats[0];
    const isVirtual = Boolean(activeLoginid && (activeLoginid.startsWith('VRTC') || activeLoginid.startsWith('VRT')));

    // ── Real Activity Bars from Closed Transactions ──
    const activityBars = useMemo(() => {
        if (profitList.length === 0) return [];
        const recent = profitList.slice(-7);
        const maxTradeVal = Math.max(...recent.map(t => Number(t.buy_price) || 1), 1);

        return recent.map((t, idx) => {
            const net = (Number(t.sell_price) || 0) - (Number(t.buy_price) || 0);
            const buy = Number(t.buy_price) || 1;
            const volumePct = Math.min(Math.round((buy / maxTradeVal) * 100), 100);
            const gainPct = net > 0 ? Math.min(Math.round((net / buy) * 100), 100) : 0;
            const timeStr = t.sell_time
                ? new Date(t.sell_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : `#${idx + 1}`;

            return { label: timeStr, val: Math.max(volumePct, 15), gain: gainPct, profit: net };
        });
    }, [profitList]);

    return (
        <div className='portfolio-analytics'>
            {/* ════════════════ TOP FINANCIAL STATS ROW ════════════════ */}
            <div className='pa-top-grid'>
                {/* 1. Modern Fintech Account Card */}
                <div className='pa-deriv-account-card'>
                    <div className='pa-deriv-account-card__bg-glow'></div>
                    <div className='pa-deriv-account-card__top-row'>
                        <div className='pa-deriv-account-card__chip-box'>
                            <svg width='28' height='22' viewBox='0 0 32 24' fill='none'>
                                <rect
                                    width='32'
                                    height='24'
                                    rx='4'
                                    fill='rgba(255, 215, 0, 0.25)'
                                    stroke='rgba(255, 215, 0, 0.6)'
                                    strokeWidth='1.2'
                                />
                                <path d='M0 12h32M10 0v24M22 0v24' stroke='rgba(255, 215, 0, 0.4)' strokeWidth='0.8' />
                            </svg>
                            <span className='pa-deriv-account-card__contactless'>
                                <svg
                                    width='14'
                                    height='14'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2.4'
                                >
                                    <path d='M8.5 16.5a5 5 0 0 1 0-9M12 20a10 10 0 0 0 0-16M15.5 23.5a15 15 0 0 0 0-23' />
                                </svg>
                            </span>
                        </div>
                        <span
                            className={`pa-deriv-account-card__badge ${isVirtual ? 'pa-deriv-account-card__badge--demo' : 'pa-deriv-account-card__badge--real'}`}
                        >
                            {isVirtual ? 'DEMO' : 'DERIV REAL'}
                        </span>
                    </div>

                    <div className='pa-deriv-account-card__balance-box'>
                        <span className='pa-deriv-account-card__balance-label'>{localize('Account Balance')}</span>
                        <div className='pa-deriv-account-card__balance-value'>
                            <span className='pa-deriv-account-card__amount'>
                                {formatMoney(
                                    currency,
                                    financialStats.netProfit + financialStats.deposits - financialStats.withdrawals,
                                    true
                                )}
                            </span>
                            <span className='pa-deriv-account-card__currency'>{currency}</span>
                        </div>
                    </div>

                    <div className='pa-deriv-account-card__footer'>
                        <div className='pa-deriv-account-card__acc-num'>
                            •••• •••• •••• {activeLoginid ? activeLoginid.slice(-4) : '5821'}
                        </div>
                        <div className='pa-deriv-account-card__cashflow-tag'>
                            {financialStats.deposits - financialStats.withdrawals >= 0 ? '+' : ''}
                            {formatMoney(currency, financialStats.deposits - financialStats.withdrawals, true)}{' '}
                            {currency}
                        </div>
                    </div>
                </div>

                {/* 2. Total Deposits KPI */}
                <div className='pa-kpi-card pa-kpi-card--deposit'>
                    <div className='pa-kpi-card__header'>
                        <div className='pa-kpi-card__title-box'>
                            <span className='pa-kpi-card__caption'>{localize('Deposits')}</span>
                            <h3 className='pa-kpi-card__value'>
                                {formatMoney(currency, financialStats.deposits, true)}{' '}
                                <span className='pa-kpi-card__unit'>{currency}</span>
                            </h3>
                        </div>
                        <div className='pa-kpi-card__icon pa-kpi-card__icon--deposit'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.2'
                            >
                                <path d='M12 5v14M5 12l7 7 7-7' />
                            </svg>
                        </div>
                    </div>
                    <div className='pa-kpi-card__footer'>
                        <span className='pa-badge pa-badge--neutral'>
                            {financialStats.depositCount}{' '}
                            {financialStats.depositCount === 1 ? localize('Txn') : localize('Txns')}
                        </span>
                    </div>
                </div>

                {/* 3. Total Withdrawals KPI */}
                <div className='pa-kpi-card pa-kpi-card--withdrawal'>
                    <div className='pa-kpi-card__header'>
                        <div className='pa-kpi-card__title-box'>
                            <span className='pa-kpi-card__caption'>{localize('Withdrawals')}</span>
                            <h3 className='pa-kpi-card__value'>
                                {formatMoney(currency, financialStats.withdrawals, true)}{' '}
                                <span className='pa-kpi-card__unit'>{currency}</span>
                            </h3>
                        </div>
                        <div className='pa-kpi-card__icon pa-kpi-card__icon--withdrawal'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.2'
                            >
                                <path d='M12 19V5M5 12l7-7 7 7' />
                            </svg>
                        </div>
                    </div>
                    <div className='pa-kpi-card__footer'>
                        <span className='pa-badge pa-badge--neutral'>
                            {financialStats.withdrawalCount}{' '}
                            {financialStats.withdrawalCount === 1 ? localize('Txn') : localize('Txns')}
                        </span>
                    </div>
                </div>

                {/* 4. Net Profit / Loss KPI */}
                <div
                    className={`pa-kpi-card ${financialStats.netProfit >= 0 ? 'pa-kpi-card--profit' : 'pa-kpi-card--loss'}`}
                >
                    <div className='pa-kpi-card__header'>
                        <div className='pa-kpi-card__title-box'>
                            <span className='pa-kpi-card__caption'>{localize('Net Profit')}</span>
                            <h3
                                className={`pa-kpi-card__value ${financialStats.netProfit >= 0 ? 'pa-kpi-card__value--profit' : 'pa-kpi-card__value--loss'}`}
                            >
                                {financialStats.netProfit >= 0
                                    ? `+${formatMoney(currency, financialStats.netProfit, true)}`
                                    : formatMoney(currency, financialStats.netProfit, true)}
                                <span className='pa-kpi-card__unit'> {currency}</span>
                            </h3>
                        </div>
                        <div
                            className={`pa-kpi-card__icon ${financialStats.netProfit >= 0 ? 'pa-kpi-card__icon--profit' : 'pa-kpi-card__icon--loss'}`}
                        >
                            {financialStats.netProfit >= 0 ? (
                                <svg
                                    width='18'
                                    height='18'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2.2'
                                >
                                    <path d='M23 6l-9.5 9.5-5-5L1 18' />
                                    <path d='M17 6h6v6' />
                                </svg>
                            ) : (
                                <svg
                                    width='18'
                                    height='18'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2.2'
                                >
                                    <path d='M23 18l-9.5-9.5-5 5L1 6' />
                                    <path d='M17 18h6v-6' />
                                </svg>
                            )}
                        </div>
                    </div>
                    <div className='pa-kpi-card__footer'>
                        <span
                            className={`pa-badge ${financialStats.winRate >= 50 ? 'pa-badge--success' : 'pa-badge--danger'}`}
                        >
                            {financialStats.winRate.toFixed(0)}% {localize('Win')}
                        </span>
                    </div>
                </div>

                {/* 5. Profit Factor KPI */}
                <div className='pa-kpi-card'>
                    <div className='pa-kpi-card__header'>
                        <div className='pa-kpi-card__title-box'>
                            <span className='pa-kpi-card__caption'>{localize('Profit Factor')}</span>
                            <h3 className='pa-kpi-card__value pa-kpi-card__value--muted'>
                                {financialStats.profitFactor}
                            </h3>
                        </div>
                        <div className='pa-kpi-card__icon'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.2'
                            >
                                <path d='M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' />
                            </svg>
                        </div>
                    </div>
                    <div className='pa-kpi-card__footer'>
                        <span className='pa-badge pa-badge--neutral'>
                            {addComma(financialStats.totalTrades)} {localize('Trades')}
                        </span>
                    </div>
                </div>
            </div>

            {/* ════════════════ VISUAL ANALYTICS GRID ════════════════ */}
            <div className='pa-analytics-grid'>
                {/* ── CARD 1: BEST TRADED STRATEGIES DONUT CHART ── */}
                <div className='pa-analytics-card'>
                    <div className='pa-analytics-card__header'>
                        <div>
                            <h3 className='pa-analytics-card__title'>{localize('Strategy Breakdown')}</h3>
                        </div>
                        <div className='pa-period-pills'>
                            {(['ALL', '30D', '7D', '24H'] as const).map(p => (
                                <button
                                    key={p}
                                    className={`pa-period-pill ${activeFilterPeriod === p ? 'pa-period-pill--active' : ''}`}
                                    onClick={() => setActiveFilterPeriod(p)}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    {strategyStats.length === 0 ? (
                        <div className='pa-empty-state'>
                            <div className='pa-empty-state__icon'>
                                <svg
                                    width='32'
                                    height='32'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='1.8'
                                >
                                    <circle cx='12' cy='12' r='10' />
                                    <path d='M12 6v6l4 2' />
                                </svg>
                            </div>
                            <h4 className='pa-empty-state__title'>{localize('No Closed Trades Found')}</h4>
                            <p className='pa-empty-state__description'>
                                {localize(
                                    'Completed trading positions from your Deriv account will automatically appear here.'
                                )}
                            </p>
                        </div>
                    ) : (
                        <div className='pa-donut-layout'>
                            {/* Left: SVG Donut Visualizer */}
                            <div className='pa-donut-chart-container'>
                                <svg className='pa-donut-svg' viewBox='0 0 220 220'>
                                    <circle
                                        cx='110'
                                        cy='110'
                                        r='75'
                                        fill='none'
                                        stroke='var(--general-section-1, rgba(255,255,255,0.06))'
                                        strokeWidth='22'
                                    />
                                    {donutPaths.map(item => (
                                        <path
                                            key={item.stat.name}
                                            d={item.d}
                                            fill='none'
                                            stroke={item.color}
                                            strokeWidth={item.strokeWidth}
                                            strokeLinecap='round'
                                            className='pa-donut-slice'
                                            onClick={() =>
                                                setSelectedStrategyIndex(
                                                    selectedStrategyIndex === item.idx ? null : item.idx
                                                )
                                            }
                                            onMouseEnter={() => setSelectedStrategyIndex(item.idx)}
                                            style={{ cursor: 'pointer', transition: 'all 0.25s ease' }}
                                        />
                                    ))}
                                </svg>
                                <div className='pa-donut-center-info'>
                                    <span className='pa-donut-center-label'>
                                        {activeDonutInfo ? activeDonutInfo.name : localize('Total Trades')}
                                    </span>
                                    <span className='pa-donut-center-val'>
                                        {activeDonutInfo
                                            ? `${activeDonutInfo.winRate.toFixed(1)}%`
                                            : addComma(financialStats.totalTrades)}
                                    </span>
                                    <span className='pa-donut-center-sub'>
                                        {activeDonutInfo ? localize('Win Rate') : localize('Closed Contracts')}
                                    </span>
                                </div>
                            </div>

                            {/* Right: Strategy Metrics Breakdown List */}
                            <div className='pa-strategy-legend-list'>
                                {strategyStats.map((stat, idx) => (
                                    <div
                                        key={stat.name}
                                        className={`pa-legend-row ${selectedStrategyIndex === idx ? 'pa-legend-row--active' : ''}`}
                                        onClick={() =>
                                            setSelectedStrategyIndex(selectedStrategyIndex === idx ? null : idx)
                                        }
                                        onMouseEnter={() => setSelectedStrategyIndex(idx)}
                                    >
                                        <div className='pa-legend-row__top'>
                                            <div className='pa-legend-row__title-group'>
                                                <span
                                                    className='pa-legend-row__dot'
                                                    style={{ backgroundColor: stat.color }}
                                                ></span>
                                                <span className='pa-legend-row__name'>{stat.name}</span>
                                            </div>
                                            <div className='pa-legend-row__metrics'>
                                                <span
                                                    className={`pa-legend-row__profit ${stat.profit >= 0 ? 'pa-legend-row__profit--pos' : 'pa-legend-row__profit--neg'}`}
                                                >
                                                    {stat.profit >= 0
                                                        ? `+${formatMoney(currency, stat.profit, true)}`
                                                        : formatMoney(currency, stat.profit, true)}{' '}
                                                    {currency}
                                                </span>
                                                <span className='pa-legend-row__share'>
                                                    {stat.percentage.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>

                                        <div className='pa-legend-row__progress-track'>
                                            <div
                                                className='pa-legend-row__progress-fill'
                                                style={{ width: `${stat.percentage}%`, backgroundColor: stat.color }}
                                            ></div>
                                        </div>

                                        <div className='pa-legend-row__bottom'>
                                            <span className='pa-legend-row__subtext'>
                                                {stat.trades} {localize('trades')} ({stat.wins}W /{' '}
                                                {stat.trades - stat.wins}L)
                                            </span>
                                            <span className='pa-legend-row__winrate'>
                                                {stat.winRate.toFixed(0)}% {localize('win rate')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── CARD 2: EXECUTION & VOLUME ── */}
                <div className='pa-analytics-card'>
                    <div className='pa-analytics-card__header'>
                        <div>
                            <h3 className='pa-analytics-card__title'>{localize('Execution & Volume')}</h3>
                        </div>
                        <div className='pa-live-badge'>
                            <span className='pa-live-badge__dot'></span>
                            <span>
                                {openPositionsCount} {localize('Open')}
                            </span>
                        </div>
                    </div>

                    <div className='pa-activity-content'>
                        {/* Summary Bar */}
                        <div className='pa-activity-kpis'>
                            <div className='pa-act-kpi'>
                                <span className='pa-act-kpi__label'>{localize('Total Executed')}</span>
                                <h4 className='pa-act-kpi__val'>{addComma(financialStats.totalTrades)}</h4>
                            </div>
                            <div className='pa-act-kpi'>
                                <span className='pa-act-kpi__label'>{localize('Profitable Trades')}</span>
                                <h4 className='pa-act-kpi__val pa-act-kpi__val--green'>{financialStats.wins} W</h4>
                            </div>
                            <div className='pa-act-kpi'>
                                <span className='pa-act-kpi__label'>{localize('Loss Contracts')}</span>
                                <h4 className='pa-act-kpi__val pa-act-kpi__val--red'>{financialStats.losses} L</h4>
                            </div>
                            <div className='pa-act-kpi'>
                                <span className='pa-act-kpi__label'>{localize('Gross Volume')}</span>
                                <h4 className='pa-act-kpi__val pa-act-kpi__val--blue'>
                                    {formatMoney(currency, financialStats.grossProfit + financialStats.totalLoss, true)}
                                </h4>
                            </div>
                        </div>

                        {/* Win / Loss Ratio Progress Bar */}
                        <div className='pa-ratio-meter'>
                            <div className='pa-ratio-meter__labels'>
                                <span className='pa-ratio-meter__win-label'>
                                    {localize('Wins')}: {financialStats.winRate.toFixed(1)}%
                                </span>
                                <span className='pa-ratio-meter__loss-label'>
                                    {localize('Losses')}: {(100 - financialStats.winRate).toFixed(1)}%
                                </span>
                            </div>
                            <div className='pa-ratio-meter__track'>
                                <div
                                    className='pa-ratio-meter__win-fill'
                                    style={{
                                        width: `${financialStats.totalTrades > 0 ? financialStats.winRate : 50}%`,
                                    }}
                                ></div>
                                <div
                                    className='pa-ratio-meter__loss-fill'
                                    style={{
                                        width: `${financialStats.totalTrades > 0 ? 100 - financialStats.winRate : 50}%`,
                                    }}
                                ></div>
                            </div>
                        </div>

                        {/* Real Telemetry Bars */}
                        {activityBars.length === 0 ? (
                            <div className='pa-empty-state'>
                                <div className='pa-empty-state__icon'>
                                    <svg
                                        width='32'
                                        height='32'
                                        viewBox='0 0 24 24'
                                        fill='none'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                    >
                                        <rect x='3' y='3' width='18' height='18' rx='2' />
                                        <line x1='3' y1='9' x2='21' y2='9' />
                                        <line x1='9' y1='21' x2='9' y2='9' />
                                    </svg>
                                </div>
                                <h4 className='pa-empty-state__title'>{localize('No Execution Data')}</h4>
                                <p className='pa-empty-state__description'>
                                    {localize('Telemetry and volume flow will stream here as contracts complete.')}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className='pa-bars-grid'>
                                    {activityBars.map((bar, i) => (
                                        <div key={bar.label + i} className='pa-bar-column'>
                                            <div className='pa-bar-track'>
                                                <div
                                                    className='pa-bar-fill pa-bar-fill--primary'
                                                    style={{ height: `${bar.val}%` }}
                                                    title={`Volume: ${bar.val}%`}
                                                ></div>
                                                <div
                                                    className={`pa-bar-fill ${bar.profit >= 0 ? 'pa-bar-fill--secondary' : 'pa-bar-fill--loss'}`}
                                                    style={{ height: `${bar.gain > 0 ? bar.gain : 20}%` }}
                                                    title={`Gain: ${bar.gain}%`}
                                                ></div>
                                            </div>
                                            <span className='pa-bar-label'>{bar.label}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className='pa-activity-legend'>
                                    <div className='pa-act-leg-item'>
                                        <span className='pa-act-dot pa-act-dot--primary'></span>
                                        <span>{localize('Trade Stake Volume')}</span>
                                    </div>
                                    <div className='pa-act-leg-item'>
                                        <span className='pa-act-dot pa-act-dot--secondary'></span>
                                        <span>{localize('Realized Net Gain')}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortfolioAnalytics;
