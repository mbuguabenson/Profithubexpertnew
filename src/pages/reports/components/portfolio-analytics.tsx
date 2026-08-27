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
    'Accumulators': '#8b5cf6',
    'Multipliers': '#06b6d4',
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
            if (text.includes('MATCH') || text.includes('DIFF') || text.includes('DIGITMATCH') || text.includes('DIGITDIFF')) {
                strategyName = 'Matches / Differs';
            } else if (text.includes('EVEN') || text.includes('ODD') || text.includes('DIGITEVEN') || text.includes('DIGITODD')) {
                strategyName = 'Even / Odd';
            } else if (text.includes('OVER') || text.includes('UNDER') || text.includes('DIGITOVER') || text.includes('DIGITUNDER')) {
                strategyName = 'Over / Under';
            } else if (text.includes('ACCU')) {
                strategyName = 'Accumulators';
            } else if (text.includes('MULT') || text.includes('MULTIPLIER')) {
                strategyName = 'Multipliers';
            } else if (text.includes('HIGHER') || text.includes('LOWER') || text.includes('HIGH_LOW')) {
                strategyName = 'High / Low';
            } else if (text.includes('CALL') || text.includes('PUT') || text.includes('RISE') || text.includes('FALL')) {
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
    const maskedAcc = activeLoginid ? String(activeLoginid).slice(-4) : '5821';

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
            const timeStr = t.sell_time ? new Date(t.sell_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `#${idx + 1}`;

            return { label: timeStr, val: Math.max(volumePct, 15), gain: gainPct, profit: net };
        });
    }, [profitList]);

    return (
        <div className="portfolio-analytics">
            {/* ════════════════ TOP FINANCIAL STATS ROW ════════════════ */}
            <div className="pa-top-grid">
                {/* 1. Modern Bank Card / Net Worth Widget */}
                <div className="pa-bank-card-container">
                    <div className="pa-bank-card">
                        <div className="pa-bank-card__shimmer"></div>
                        <div className="pa-bank-card__top">
                            <div className="pa-bank-card__brand">
                                <span className="pa-bank-card__logo-dot"></span>
                                <span className="pa-bank-card__brand-text">DERIV {isVirtual ? 'DEMO' : 'REAL'}</span>
                            </div>
                            <span className="pa-bank-card__badge">{isVirtual ? 'VIRTUAL WALLET' : 'PRIMARY ACCOUNT'}</span>
                        </div>

                        <div className="pa-bank-card__chip-row">
                            <div className="pa-bank-card__chip">
                                <span className="pa-bank-card__chip-line"></span>
                                <span className="pa-bank-card__chip-line"></span>
                            </div>
                            <span className="pa-bank-card__contactless">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                                    <path d="M12 19a8.5 8.5 0 0 0 0-14" />
                                    <path d="M15.5 21.5a12 12 0 0 0 0-19" />
                                </svg>
                            </span>
                        </div>
                        <div className="pa-bank-card__number">
                            <span>••••</span>
                            <span>••••</span>
                            <span>••••</span>
                            <span>{maskedAcc}</span>
                        </div>
                        <div className="pa-bank-card__bottom">
                            <div className="pa-bank-card__holder">
                                <span className="pa-bank-card__label">{localize('BALANCE')}</span>
                                <span className="pa-bank-card__name">
                                    {formatMoney(currency, financialStats.netProfit + financialStats.deposits - financialStats.withdrawals, true)} {currency}
                                </span>
                            </div>
                            <div className="pa-bank-card__expiry">
                                <span className="pa-bank-card__label">{localize('CURRENCY')}</span>
                                <span className="pa-bank-card__name">{currency}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Total Deposits */}
                <div className="pa-kpi-card pa-kpi-card--deposit">
                    <div className="pa-kpi-card__header">
                        <span className="pa-kpi-card__label">{localize('Total Deposits')}</span>
                        <div className="pa-kpi-card__icon pa-kpi-card__icon--blue">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <path d="M12 19V5M5 12l7-7 7 7"/>
                            </svg>
                        </div>
                    </div>
                    <div className="pa-kpi-card__value">
                        +{formatMoney(currency, financialStats.deposits, true)} <span className="pa-kpi-card__curr">{currency}</span>
                    </div>
                    <div className="pa-kpi-card__footer">
                        <span className="pa-pill-badge pa-pill-badge--blue">
                            📥 {financialStats.depositCount} {localize('Deposits')}
                        </span>
                        <span className="pa-kpi-card__subtext">{localize('Capital inflow volume')}</span>
                    </div>
                </div>

                {/* 3. Total Withdrawals */}
                <div className="pa-kpi-card pa-kpi-card--withdraw">
                    <div className="pa-kpi-card__header">
                        <span className="pa-kpi-card__label">{localize('Total Withdrawals')}</span>
                        <div className="pa-kpi-card__icon pa-kpi-card__icon--purple">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <path d="M12 5v14M5 12l7 7 7-7"/>
                            </svg>
                        </div>
                    </div>
                    <div className="pa-kpi-card__value">
                        -{formatMoney(currency, financialStats.withdrawals, true)} <span className="pa-kpi-card__curr">{currency}</span>
                    </div>
                    <div className="pa-kpi-card__footer">
                        <span className="pa-pill-badge pa-pill-badge--purple">
                            📤 {financialStats.withdrawalCount} {localize('Processed')}
                        </span>
                        <span className="pa-kpi-card__subtext">{localize('Capital payout volume')}</span>
                    </div>
                </div>

                {/* 4. Net Profit */}
                <div className={`pa-kpi-card ${financialStats.netProfit >= 0 ? 'pa-kpi-card--profit' : 'pa-kpi-card--loss'}`}>
                    <div className="pa-kpi-card__header">
                        <span className="pa-kpi-card__label">{localize('Net Profit')}</span>
                        <div className={`pa-kpi-card__icon ${financialStats.netProfit >= 0 ? 'pa-kpi-card__icon--green' : 'pa-kpi-card__icon--red'}`}>
                            {financialStats.netProfit >= 0 ? '📈' : '📉'}
                        </div>
                    </div>
                    <div className={`pa-kpi-card__value ${financialStats.netProfit >= 0 ? 'pa-kpi-card__value--profit' : 'pa-kpi-card__value--loss'}`}>
                        {financialStats.netProfit >= 0 ? `+${formatMoney(currency, financialStats.netProfit, true)}` : formatMoney(currency, financialStats.netProfit, true)} <span className="pa-kpi-card__curr">{currency}</span>
                    </div>
                    <div className="pa-kpi-card__footer">
                        <span className={`pa-pill-badge ${financialStats.netProfit >= 0 ? 'pa-pill-badge--green' : 'pa-pill-badge--red'}`}>
                            {financialStats.winRate.toFixed(1)}% {localize('Win Rate')}
                        </span>
                        <span className="pa-kpi-card__subtext">PF: {financialStats.profitFactor}</span>
                    </div>
                </div>

                {/* 5. Total Loss */}
                <div className="pa-kpi-card pa-kpi-card--loss-stat">
                    <div className="pa-kpi-card__header">
                        <span className="pa-kpi-card__label">{localize('Total Loss')}</span>
                        <div className="pa-kpi-card__icon pa-kpi-card__icon--red">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                        </div>
                    </div>
                    <div className="pa-kpi-card__value pa-kpi-card__value--loss">
                        -{formatMoney(currency, financialStats.totalLoss, true)} <span className="pa-kpi-card__curr">{currency}</span>
                    </div>
                    <div className="pa-kpi-card__footer">
                        <span className="pa-pill-badge pa-pill-badge--red">
                            {financialStats.losses} {localize('Loss Contracts')}
                        </span>
                        <span className="pa-kpi-card__subtext">{localize('Controlled Risk')}</span>
                    </div>
                </div>
            </div>

            {/* ════════════════ VISUAL CHARTS & STRATEGIES SECTION ════════════════ */}
            <div className="pa-analytics-row">
                {/* 1. Best Traded Strategies Donut / Pie Chart */}
                <div className="pa-card pa-card--pie">
                    <div className="pa-card__header">
                        <div>
                            <h3 className="pa-card__title">🥧 {localize('Best Traded Strategies')}</h3>
                            <p className="pa-card__subtitle">{localize('Volume and win-rate distribution across contract types')}</p>
                        </div>
                        <div className="pa-period-pills">
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
                        <div className="pa-empty-pie">
                            <div className="icon">🥧</div>
                            <h4>{localize('No Closed Trades Recorded')}</h4>
                            <p>{localize('Your traded strategy distribution and win rates will automatically calculate from real closed contracts.')}</p>
                        </div>
                    ) : (
                        <div className="pa-pie-content">
                            {/* Interactive SVG Donut Chart */}
                            <div className="pa-pie-chart-box">
                                <svg width="220" height="220" viewBox="0 0 220 220" className="pa-donut-svg">
                                    <circle cx="110" cy="110" r="75" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="24" />
                                    {donutPaths.map(item => (
                                        <path
                                            key={item.idx}
                                            d={item.d}
                                            fill="none"
                                            stroke={item.color}
                                            strokeWidth={item.strokeWidth}
                                            strokeLinecap="round"
                                            className="pa-donut-segment"
                                            onMouseEnter={() => setSelectedStrategyIndex(item.idx)}
                                            onMouseLeave={() => setSelectedStrategyIndex(null)}
                                        />
                                    ))}
                                </svg>
                                {/* Central Telemetry Callout */}
                                <div className="pa-donut-center">
                                    <span className="pa-donut-center__pct">
                                        {activeDonutInfo ? `${activeDonutInfo.percentage.toFixed(0)}%` : '100%'}
                                    </span>
                                    <span className="pa-donut-center__label">
                                        {activeDonutInfo ? activeDonutInfo.name : localize('Dominant')}
                                    </span>
                                </div>
                            </div>

                            {/* Strategy Breakdown Legend & Win Rates */}
                            <div className="pa-strategy-legend">
                                {strategyStats.map((stat, idx) => (
                                    <div
                                        key={stat.name}
                                        className={`pa-legend-item ${selectedStrategyIndex === idx ? 'pa-legend-item--active' : ''}`}
                                        onMouseEnter={() => setSelectedStrategyIndex(idx)}
                                        onMouseLeave={() => setSelectedStrategyIndex(null)}
                                    >
                                        <div className="pa-legend-item__color" style={{ background: stat.color, boxShadow: `0 0 10px ${stat.color}80` }}></div>
                                        <div className="pa-legend-item__info">
                                            <span className="pa-legend-item__name">{stat.name}</span>
                                            <span className="pa-legend-item__count">{stat.trades} {localize('trades')}</span>
                                        </div>
                                        <div className="pa-legend-item__right">
                                            <span className="pa-legend-item__winrate">{stat.winRate.toFixed(1)}% WR</span>
                                            <span className={`pa-legend-item__pnl ${stat.profit >= 0 ? 'pa-legend-item__pnl--win' : 'pa-legend-item__pnl--loss'}`}>
                                                {stat.profit >= 0 ? `+${formatMoney(currency, stat.profit, true)}` : formatMoney(currency, stat.profit, true)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Trading Volume & Success Activity Visualizer */}
                <div className="pa-card pa-card--activity">
                    <div className="pa-card__header">
                        <div>
                            <h3 className="pa-card__title">📊 {localize('Income & Trade Dynamics')}</h3>
                            <p className="pa-card__subtitle">{localize('Performance density and trade execution flow')}</p>
                        </div>
                        <span className="pa-live-pulse-badge">● {localize('REALTIME SYNC')}</span>
                    </div>

                    <div className="pa-activity-bars-container">
                        <div className="pa-activity-summary-row">
                            <div className="pa-act-stat">
                                <span className="pa-act-stat__label">{localize('Total Executions')}</span>
                                <h4 className="pa-act-stat__val">{addComma(financialStats.totalTrades)}</h4>
                            </div>
                            <div className="pa-act-stat">
                                <span className="pa-act-stat__label">{localize('Profitable Trades')}</span>
                                <h4 className="pa-act-stat__val pa-act-stat__val--green">{financialStats.wins} W</h4>
                            </div>
                            <div className="pa-act-stat">
                                <span className="pa-act-stat__label">{localize('Open Live Positions')}</span>
                                <h4 className="pa-act-stat__val pa-act-stat__val--blue">{openPositionsCount}</h4>
                            </div>
                        </div>

                        {/* Real Telemetry Bars */}
                        {activityBars.length === 0 ? (
                            <div className="pa-empty-pie">
                                <div className="icon">📊</div>
                                <h4>{localize('No Trade Dynamics Data')}</h4>
                                <p>{localize('Live executions and volume flow will automatically stream here once trades are completed.')}</p>
                            </div>
                        ) : (
                            <>
                                <div className="pa-bars-grid">
                                    {activityBars.map((bar, i) => (
                                        <div key={bar.label + i} className="pa-bar-column">
                                            <div className="pa-bar-track">
                                                <div
                                                    className="pa-bar-fill pa-bar-fill--primary"
                                                    style={{ height: `${bar.val}%`, transitionDelay: `${i * 50}ms` }}
                                                    title={`Volume: ${bar.val}%`}
                                                ></div>
                                                <div
                                                    className="pa-bar-fill pa-bar-fill--secondary"
                                                    style={{ height: `${bar.gain}%`, transitionDelay: `${i * 50 + 25}ms` }}
                                                    title={`Gain: ${bar.gain}%`}
                                                ></div>
                                            </div>
                                            <span className="pa-bar-label">{bar.label}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="pa-activity-legend">
                                    <div className="pa-act-leg-item">
                                        <span className="pa-act-dot pa-act-dot--primary"></span>
                                        <span>{localize('Gross Trade Volume')}</span>
                                    </div>
                                    <div className="pa-act-leg-item">
                                        <span className="pa-act-dot pa-act-dot--secondary"></span>
                                        <span>{localize('Net Profit Harvest')}</span>
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
