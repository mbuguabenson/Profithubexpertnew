import { useEffect, useMemo, useRef, useState } from 'react';
import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import classNames from 'classnames';
import TickSelector from '@/components/tick-selector/tick-selector';
import { useStore } from '@/hooks/useStore';
import { TTradeConfig } from '@/lib/digit-trade-engine';
import { TDigitStat } from '@/stores/analysis-store';
import DiffersCracker from './differs-cracker';
import EvenOddCracker from './even-odd-cracker';
import OverUnderCracker from './over-under-cracker';
import MatchesCracker from './matches-cracker';
import './digit-cracker.scss';

const DigitCracker = observer(() => {
    const { digit_cracker, client } = useStore();
    const [activeStrategy, setActiveStrategy] = useState<'even_odd' | 'differs' | 'matches' | 'over_under'>('even_odd');
    const [activeLogTab, setActiveLogTab] = useState<'journal' | 'summary'>('journal');
    const [bulkRuns, setBulkRuns] = useState<number>(1);
    const logRef = useRef<HTMLDivElement>(null);

    const { symbol, digit_stats, is_connected, total_ticks, setTotalTicks, markets, trade_engine, last_digit } =
        digit_cracker;

    if (!trade_engine) return null;

    const { trade_status, is_executing, session_profit, total_profit, logs } = trade_engine;

    // Initialize/Cleanup
    useEffect(() => {
        return () => {
            digit_cracker.dispose();
        };
    }, [digit_cracker]);

    // Auto-scroll logs
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs.length]);

    const handleMarketChange = (newSymbol: string) => {
        digit_cracker.setSymbol(newSymbol);
    };

    // Calculate ranked stats
    const sortedStats = useMemo(() => [...digit_stats].sort((a, b) => b.count - a.count), [digit_stats]);
    const maxCount = sortedStats[0]?.count || 1;
    const minCount = sortedStats[sortedStats.length - 1]?.count || 0;

    const availableMarkets = markets.length > 0 ? markets.flatMap(group => group.items) : [];

    const totalTrades = logs.filter(l => l.type === 'success' || l.type === 'error').length;
    const totalWins = logs.filter(l => l.type === 'success').length;
    const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0';

    const renderDigitReactors = () => {
        return (
            <div className='digit-reactor-hud-deck'>
                {digit_stats.map((stat: TDigitStat) => {
                    const isCurrent = stat.digit === last_digit;
                    const isHot = stat.count === maxCount && maxCount > minCount;
                    const isCold = stat.count === minCount && maxCount > minCount;

                    let ringColor = '#6366f1';
                    if (isHot) ringColor = '#10b981';
                    else if (isCold) ringColor = '#f43f5e';
                    else if (stat.digit % 2 === 0) ringColor = '#06b6d4';
                    else ringColor = '#a855f7';

                    if (isCurrent) ringColor = '#f59e0b';

                    const radius = 38;
                    const circumference = 2 * Math.PI * radius;
                    const strokeDashoffset = circumference - (stat.percentage / 100) * circumference;

                    const rank = sortedStats.findIndex(s => s.digit === stat.digit) + 1;

                    return (
                        <div
                            key={stat.digit}
                            className={classNames('reactor-core-card', {
                                'is-active': isCurrent,
                                'is-hot': isHot,
                                'is-cold': isCold,
                            })}
                            onClick={() => {
                                trade_engine.updateConfig(activeStrategy, 'prediction', stat.digit);
                            }}
                        >
                            <div className='core-svg-wrap'>
                                <svg width='92' height='92' viewBox='0 0 92 92'>
                                    <circle
                                        cx='46'
                                        cy='46'
                                        r={radius}
                                        fill='none'
                                        stroke='rgba(255, 255, 255, 0.04)'
                                        strokeWidth='4'
                                    />
                                    <circle
                                        cx='46'
                                        cy='46'
                                        r={radius}
                                        fill='none'
                                        stroke={ringColor}
                                        strokeWidth={isCurrent ? '5' : '4'}
                                        strokeDasharray={circumference}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap='round'
                                        transform='rotate(-90 46 46)'
                                        style={{
                                            filter: isCurrent ? `drop-shadow(0 0 10px ${ringColor})` : 'none',
                                            transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                        }}
                                    />
                                </svg>
                                <div className='core-center-info'>
                                    <span className='digit-num num'>{stat.digit}</span>
                                    <span className='digit-pct num'>{stat.percentage.toFixed(1)}%</span>
                                </div>
                                {isCurrent && <div className='radar-ping-halo' />}
                            </div>

                            <div className='core-badges'>
                                <span className='rank-tag num'>#{rank}</span>
                                <span className='sample-n num'>n={stat.count}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderQuickConfig = () => {
        const configKey = `${activeStrategy}_config` as keyof typeof trade_engine;
        const config = trade_engine[configKey] as unknown as TTradeConfig;

        return (
            <div className='quick-config-deck'>
                <div className='deck-head'>
                    <h4>Execution Parameters • {activeStrategy.toUpperCase().replace('_', ' ')}</h4>
                    <span className='cycle-badge num'>
                        Runs: {config.runs_count || 0} / {config.max_runs || 100}
                    </span>
                </div>

                <div className='config-inputs-grid'>
                    <div className='input-box'>
                        <label>BASE STAKE ($)</label>
                        <input
                            type='number'
                            step='0.1'
                            min='0.35'
                            value={config.stake}
                            onChange={e => trade_engine.updateConfig(activeStrategy, 'stake', parseFloat(e.target.value) || 0.35)}
                            className='num'
                        />
                    </div>
                    <div className='input-box'>
                        <label>BULK RUNS (1-20)</label>
                        <input
                            type='number'
                            step='1'
                            min='1'
                            max='20'
                            value={bulkRuns}
                            onChange={e => {
                                const val = Math.max(1, Math.min(parseInt(e.target.value) || 1, 20));
                                setBulkRuns(val);
                                trade_engine.updateConfig(activeStrategy, 'bulk_trades_count' as any, val);
                            }}
                            className='num bulk-highlight'
                        />
                    </div>
                    <div className='input-box'>
                        <label>STOP LOSS ($)</label>
                        <input
                            type='number'
                            step='1'
                            value={config.max_loss}
                            onChange={e => trade_engine.updateConfig(activeStrategy, 'max_loss', parseFloat(e.target.value) || 5)}
                            className='num'
                        />
                    </div>
                    <div className='input-box'>
                        <label>TAKE PROFIT ($)</label>
                        <input
                            type='number'
                            step='1'
                            value={config.take_profit || 10}
                            onChange={e => trade_engine.updateConfig(activeStrategy, 'take_profit', parseFloat(e.target.value) || 10)}
                            className='num'
                        />
                    </div>
                    <div className='input-box'>
                        <label>MAX STAKE ($)</label>
                        <input
                            type='number'
                            step='1'
                            value={config.max_stake || 25}
                            onChange={e => trade_engine.updateConfig(activeStrategy, 'max_stake', parseFloat(e.target.value) || 25)}
                            className='num'
                        />
                    </div>
                    {['over_under', 'matches', 'differs'].includes(activeStrategy) && (
                        <div className='input-box highlight-box'>
                            <label>TARGET DIGIT</label>
                            <input
                                type='number'
                                min='0'
                                max='9'
                                value={config.prediction}
                                onChange={e => trade_engine.updateConfig(activeStrategy, 'prediction', parseInt(e.target.value) || 0)}
                                className='num'
                            />
                        </div>
                    )}
                </div>

                <div className='action-bar-dual'>
                    <button
                        className={classNames('btn-auto-launch', { 'is-running': config.is_running })}
                        onClick={() => trade_engine.toggleStrategy(activeStrategy)}
                    >
                        <span>{config.is_running ? '⏹ TERMINATE ENGINE' : '▶ INITIALIZE AUTO TRADER'}</span>
                    </button>
                    <button
                        className='btn-manual-launch'
                        onClick={() => trade_engine.executeManualTrade(activeStrategy, symbol, client.currency || 'USD', bulkRuns)}
                        disabled={is_executing}
                    >
                        <span>⚡ {bulkRuns > 1 ? `EXECUTE ${bulkRuns} BULK RUNS` : 'EXECUTE SINGLE TRADE'}</span>
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className='digit-cracker-hud-page'>
            {/* 1. Header HUD */}
            <div className='cracker-hud-header'>
                <div className='header-left-box'>
                    <div className='cyber-badge'>
                        <span className='pulse-point' />
                        <span className='badge-txt'>NEURAL CRACKER V2</span>
                    </div>
                    <div className='asset-selector-group'>
                        <label>ASSET STREAM</label>
                        <select
                            className='asset-select num'
                            value={symbol}
                            onChange={e => handleMarketChange(e.target.value)}
                        >
                            {availableMarkets.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className='header-right-metrics'>
                    <div className='metric-pill'>
                        <TickSelector value={total_ticks} onChange={setTotalTicks} label='SAMPLE DEPTH' />
                    </div>
                    <div className='metric-pill spot-card'>
                        <label>SPOT PRICE</label>
                        <span className='val num'>{digit_cracker.current_price || '0.000'}</span>
                    </div>
                    <div className='metric-pill live-digit-box'>
                        <label>LAST DIGIT</label>
                        <span className='val num'>{last_digit ?? '-'}</span>
                    </div>
                    <div className='metric-pill network-box'>
                        <label>NETWORK</label>
                        <span className={classNames('status-chip', { online: is_connected })}>
                            {is_connected ? 'SYNCHRONIZED' : 'OFFLINE'}
                        </span>
                    </div>
                </div>
            </div>

            {/* 2. Top Stats Strip */}
            <div className='stats-telemetry-strip'>
                <div className='telemetry-card'>
                    <span className='lbl'>SESSION PROFIT</span>
                    <span className={classNames('val num', { win: session_profit > 0, loss: session_profit < 0 })}>
                        {session_profit >= 0 ? '+' : ''}${session_profit.toFixed(2)}
                    </span>
                </div>
                <div className='telemetry-card'>
                    <span className='lbl'>WIN RATE</span>
                    <span className='val num cyan'>{winRate}%</span>
                </div>
                <div className='telemetry-card'>
                    <span className='lbl'>ACCOUNT BALANCE</span>
                    <span className='val num'>
                        ${client.balance ? parseFloat(String(client.balance)).toFixed(2) : '0.00'}
                    </span>
                </div>
                <div className='telemetry-card'>
                    <span className='lbl'>ENGINE STATUS</span>
                    <span className='val num amber'>{trade_status.toUpperCase()}</span>
                </div>
            </div>

            {/* 3. Digit Frequency Reactor (0-9) */}
            <div className='reactor-section-deck'>
                <div className='deck-header'>
                    <div className='title-area'>
                        <h3>10-Digit Reactor Spectrum</h3>
                        <span className='meta-tag'>{symbol} • {digit_cracker.ticks.length} Samples</span>
                    </div>
                    <span className='hint-txt'>Click core to assign target digit</span>
                </div>
                {renderDigitReactors()}
            </div>

            {/* 4. Strategy & Trading Control Workspace */}
            <div className='cracker-workspace-grid'>
                {/* LEFT: Strategy Tabs & Specific Strategy Deck */}
                <div className='strategy-column'>
                    <div className='strategy-tabs-nav'>
                        {[
                            { id: 'even_odd', label: '⚖️ EVEN / ODD' },
                            { id: 'differs', label: '🎯 DIFFERS' },
                            { id: 'matches', label: '🎲 MATCHES' },
                            { id: 'over_under', label: '📊 OVER / UNDER' },
                        ].map(s => (
                            <button
                                key={s.id}
                                onClick={() => setActiveStrategy(s.id as any)}
                                className={classNames('nav-tab-btn', { active: activeStrategy === s.id })}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <div className='strategy-body-wrapper'>
                        {activeStrategy === 'even_odd' && <EvenOddCracker />}
                        {activeStrategy === 'over_under' && <OverUnderCracker />}
                        {activeStrategy === 'differs' && <DiffersCracker />}
                        {activeStrategy === 'matches' && <MatchesCracker />}
                    </div>

                    {renderQuickConfig()}
                </div>

                {/* RIGHT: Live Journal & Performance Telemetry */}
                <div className='telemetry-column'>
                    <div className='journal-card-deck'>
                        <div className='journal-tabs-row'>
                            <button
                                className={classNames('j-tab', { active: activeLogTab === 'journal' })}
                                onClick={() => setActiveLogTab('journal')}
                            >
                                LIVE ORDER JOURNAL
                            </button>
                            <button
                                className={classNames('j-tab', { active: activeLogTab === 'summary' })}
                                onClick={() => setActiveLogTab('summary')}
                            >
                                METRIC SUMMARY
                            </button>
                            <button
                                className='clear-j-btn'
                                onClick={() => trade_engine.clearLogs()}
                            >
                                CLEAR
                            </button>
                        </div>

                        <div className='journal-viewport' ref={logRef}>
                            {activeLogTab === 'journal' ? (
                                logs.length === 0 ? (
                                    <div className='empty-journal'>Awaiting market triggers or manual orders...</div>
                                ) : (
                                    logs.map((log, i) => (
                                        <div key={i} className={classNames('journal-entry', log.type)}>
                                            <span className='time num'>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                            <span className='msg'>{log.message}</span>
                                        </div>
                                    ))
                                )
                            ) : (
                                <div className='summary-metrics-list'>
                                    <div className='metric-line'>
                                        <span>Current Session P&L:</span>
                                        <strong className={session_profit >= 0 ? 'win' : 'loss'}>
                                            ${session_profit.toFixed(2)}
                                        </strong>
                                    </div>
                                    <div className='metric-line'>
                                        <span>Lifetime P&L:</span>
                                        <strong className={total_profit >= 0 ? 'win' : 'loss'}>
                                            ${total_profit.toFixed(2)}
                                        </strong>
                                    </div>
                                    <div className='metric-line'>
                                        <span>Total Trades Run:</span>
                                        <strong className='num'>{totalTrades}</strong>
                                    </div>
                                    <div className='metric-line'>
                                        <span>Win Rate:</span>
                                        <strong className='cyan num'>{winRate}%</strong>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className='journal-footer-action'>
                            <button
                                className='btn-reset-stats'
                                onClick={() => {
                                    runInAction(() => {
                                        trade_engine.session_profit = 0;
                                        trade_engine.total_profit = 0;
                                        trade_engine.clearLogs();
                                    });
                                }}
                            >
                                RESET SESSION STATS
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default DigitCracker;
