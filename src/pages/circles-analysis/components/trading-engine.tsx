import React, { useState } from 'react';
import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './trading-engine.scss';

const TradingEngine = observer(() => {
    const { smart_auto, analysis } = useStore();
    const [activeTab, setActiveTab] = useState<
        'even_odd' | 'over_under' | 'differs' | 'matches' | 'smart_auto_24' | 'rise_fall'
    >('even_odd');
    const [bulkRuns, setBulkRuns] = useState<number>(1);

    const { bot_status, is_executing, session_profit, total_profit, logs } = smart_auto;
    const logRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs.length]);

    const config = (smart_auto as any)[`${activeTab}_config`] || smart_auto.even_odd_config;

    const totalTrades = logs.filter(l => l.type === 'success' || l.type === 'error').length;
    const totalWins = logs.filter(l => l.type === 'success').length;
    const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0';

    return (
        <div className='circles-trading-engine-hud'>
            <div className='hud-header-bar'>
                <div className='header-title-box'>
                    <div className='engine-badge'>
                        <span className='pulse-circle' />
                        <span>QUANT ENGINE</span>
                    </div>
                    <h4>Command & Execution Deck</h4>
                </div>

                <div className='strategy-pills-scroll'>
                    {[
                        { id: 'even_odd', label: 'EVEN / ODD' },
                        { id: 'over_under', label: 'OVER / UNDER' },
                        { id: 'differs', label: 'DIFFERS' },
                        { id: 'matches', label: 'MATCHES' },
                        { id: 'rise_fall', label: 'RISE / FALL' },
                    ].map(t => (
                        <button
                            key={t.id}
                            className={`pill-btn ${activeTab === t.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(t.id as any)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Performance Stats Strip */}
            <div className='stats-strip'>
                <div className='stat-tile'>
                    <span className='tile-label'>SESSION PROFIT</span>
                    <span className={`tile-value num ${session_profit >= 0 ? 'win' : 'loss'}`}>
                        {session_profit >= 0 ? '+' : ''}${session_profit.toFixed(2)}
                    </span>
                </div>
                <div className='stat-tile'>
                    <span className='tile-label'>WIN RATE</span>
                    <span className='tile-value num cyan'>{winRate}%</span>
                </div>
                <div className='stat-tile'>
                    <span className='tile-label'>RUNS PROCESSED</span>
                    <span className='tile-value num'>{config.runs_count || 0}</span>
                </div>
                <div className='stat-tile'>
                    <span className='tile-label'>ENGINE STATUS</span>
                    <span className='tile-value num status-chip'>{bot_status}</span>
                </div>
            </div>

            {/* Parameter Input Matrix */}
            <div className='parameters-matrix'>
                <div className='input-card'>
                    <label>BASE STAKE ($)</label>
                    <input
                        type='number'
                        step='0.1'
                        min='0.35'
                        value={config.stake}
                        onChange={e => smart_auto.updateConfig(activeTab, 'stake', parseFloat(e.target.value) || 0.35)}
                        className='num'
                    />
                </div>
                <div className='input-card'>
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
                            smart_auto.updateConfig(activeTab, 'bulk_trades_count' as any, val);
                        }}
                        className='num bulk-input'
                    />
                </div>
                <div className='input-card'>
                    <label>STOP LOSS ($)</label>
                    <input
                        type='number'
                        step='1'
                        value={config.max_loss}
                        onChange={e => smart_auto.updateConfig(activeTab, 'max_loss', parseFloat(e.target.value) || 5)}
                        className='num'
                    />
                </div>
                <div className='input-card'>
                    <label>TAKE PROFIT ($)</label>
                    <input
                        type='number'
                        step='1'
                        value={config.take_profit || 10}
                        onChange={e =>
                            smart_auto.updateConfig(activeTab, 'take_profit', parseFloat(e.target.value) || 10)
                        }
                        className='num'
                    />
                </div>
                <div className='input-card'>
                    <label>MAX STAKE SAFETY ($)</label>
                    <input
                        type='number'
                        step='1'
                        value={config.max_stake || 25}
                        onChange={e =>
                            smart_auto.updateConfig(activeTab, 'max_stake', parseFloat(e.target.value) || 25)
                        }
                        className='num'
                    />
                </div>
                {(activeTab === 'over_under' || activeTab === 'differs' || activeTab === 'matches') && (
                    <div className='input-card highlight'>
                        <label>TARGET DIGIT (0-9)</label>
                        <input
                            type='number'
                            min='0'
                            max='9'
                            value={config.prediction ?? 4}
                            onChange={e =>
                                smart_auto.updateConfig(activeTab, 'prediction', parseInt(e.target.value) || 0)
                            }
                            className='num'
                        />
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className='execution-actions'>
                <button
                    className={`btn-primary-auto ${config.is_running && config.is_auto ? 'running' : ''}`}
                    onClick={() => smart_auto.toggleBot(activeTab, 'auto', bulkRuns)}
                >
                    <span className='btn-icon'>{config.is_running && config.is_auto ? '⏹' : '▶'}</span>
                    <span className='btn-text'>
                        {config.is_running && config.is_auto
                            ? 'TERMINATE AUTONOMOUS ENGINE'
                            : 'START AUTONOMOUS ENGINE'}
                    </span>
                </button>

                <button
                    className='btn-bulk-manual'
                    onClick={() => smart_auto.toggleBot(activeTab, 'manual', bulkRuns)}
                    disabled={is_executing}
                >
                    <span className='btn-icon'>⚡</span>
                    <span className='btn-text'>
                        {bulkRuns > 1 ? `EXECUTE ${bulkRuns} BULK TRADES` : 'EXECUTE SINGLE TRADE'}
                    </span>
                </button>
            </div>

            {/* Live Telemetry Log */}
            <div className='telemetry-box'>
                <div className='telemetry-header'>
                    <span className='label'>LIVE ORDER & STREAM TELEMETRY</span>
                    <button
                        className='btn-clear'
                        onClick={() => {
                            runInAction(() => {
                                smart_auto.session_profit = 0;
                                smart_auto.clearLogs();
                            });
                        }}
                    >
                        RESET METRICS
                    </button>
                </div>
                <div className='telemetry-stream' ref={logRef}>
                    {logs.length === 0 && (
                        <div className='empty-state'>Waiting for next tick or trade execution...</div>
                    )}
                    {logs.map((log, i) => (
                        <div key={i} className={`telemetry-item ${log.type}`}>
                            <span className='timestamp num'>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className='log-msg'>{log.message}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

export default TradingEngine;
