import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import classNames from 'classnames';
import './entry-scanner.scss';
import type { TStrategyType } from '@/stores/entry-scanner-store';

export const EntryScanner = observer(() => {
    const { entry_scanner } = useStore();

    const strategies: { key: TStrategyType; label: string; icon: string }[] = [
        { key: 'over_under', label: 'Over / Under', icon: '↕' },
        { key: 'even_odd', label: 'Even / Odd', icon: '⚅' },
        { key: 'differs', label: 'Differs', icon: '✕' },
        { key: 'matches', label: 'Matches', icon: '★' },
        { key: 'rise_fall', label: 'Rise / Fall', icon: '↗' },
    ];

    const monitoredMarketsList = Array.from(entry_scanner.market_stats.values());
    const bestConfidence = entry_scanner.scan_result?.confidence ?? 0;

    return (
        <div className="entry-scanner-container">
            <div className="entry-scanner-content">

                {/* ── Minimal Header ── */}
                <div className="minimal-header">
                    <div className="header-left">
                        <span className="scanner-badge-dot" />
                        <span className="scanner-title">Entry Scanner</span>
                        <span className="phase-tag" style={{ borderColor: entry_scanner.phase_color, color: entry_scanner.phase_color }}>
                            {entry_scanner.scan_phase.toUpperCase().replace('_', ' ')}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="btn-minimal-reset"
                        onClick={() => entry_scanner.resetScan()}
                        title="Reset Scanner"
                    >
                        ↺ Reset
                    </button>
                </div>

                {/* ── Active Signal Minimal Card ── */}
                <div className="signal-minimal-card">
                    <div className="signal-card-top">
                        <div className="signal-asset-wrap">
                            <span className="signal-label">DETECTED ASSET</span>
                            <span className="signal-asset-name">
                                {entry_scanner.scan_result ? entry_scanner.scan_result.displayName : 'Scanning all synthetic indices...'}
                            </span>
                        </div>
                        <div className="confidence-pill">
                            <span className="confidence-num">{bestConfidence > 0 ? `${bestConfidence.toFixed(0)}%` : '--'}</span>
                            <span className="confidence-lbl">Match</span>
                        </div>
                    </div>

                    <div className="signal-grid-metrics">
                        <div className="metric-box">
                            <span className="metric-lbl">Strategy</span>
                            <span className="metric-val">
                                {entry_scanner.scan_result ? entry_scanner.scan_result.strategy.replace('_', '/').toUpperCase() : 'Auto'}
                            </span>
                        </div>
                        <div className="metric-box">
                            <span className="metric-lbl">Direction</span>
                            <span className={classNames('metric-val dir', {
                                active: !!entry_scanner.scan_result,
                                under: entry_scanner.scan_result?.direction === 'UNDER',
                                over: entry_scanner.scan_result?.direction === 'OVER',
                                even: entry_scanner.scan_result?.direction === 'EVEN',
                                odd: entry_scanner.scan_result?.direction === 'ODD',
                            })}>
                                {entry_scanner.scan_result?.direction || 'Waiting'}
                            </span>
                        </div>
                        <div className="metric-box">
                            <span className="metric-lbl">Barrier / Digit</span>
                            <span className="metric-val highlight">
                                {entry_scanner.custom_prediction !== null
                                    ? entry_scanner.custom_prediction
                                    : (entry_scanner.scan_result?.prediction ?? 'Auto')}
                            </span>
                        </div>
                    </div>

                    {/* Streamed Digit Sequence */}
                    {entry_scanner.wait_sequence.length > 0 && (
                        <div className="digit-stream-minimal">
                            <span className="stream-lbl">Live Ticks:</span>
                            <div className="stream-pills">
                                {entry_scanner.wait_sequence.slice(-10).map((d, i) => (
                                    <span
                                        key={i}
                                        className={classNames('stream-pill', {
                                            target: d === entry_scanner.scan_result?.triggerDigit
                                        })}
                                    >
                                        {d}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Scope Mode Switch ── */}
                <div className="minimal-segmented-bar">
                    <button
                        type="button"
                        className={classNames('seg-btn', { active: entry_scanner.scan_mode === 'all' })}
                        onClick={() => entry_scanner.setScanMode('all')}
                    >
                        ⚡ All Markets
                    </button>
                    <button
                        type="button"
                        className={classNames('seg-btn', { active: entry_scanner.scan_mode === 'single' })}
                        onClick={() => entry_scanner.setScanMode('single')}
                    >
                        🎯 Single Asset
                    </button>
                </div>

                {entry_scanner.scan_mode === 'single' && (
                    <div className="minimal-single-select">
                        <select
                            className="minimal-select"
                            value={entry_scanner.target_single_symbol}
                            onChange={(e) => entry_scanner.setTargetSingleSymbol(e.target.value)}
                        >
                            <option value="1HZ10V">Volatility 10 (1s) Index</option>
                            <option value="1HZ25V">Volatility 25 (1s) Index</option>
                            <option value="1HZ50V">Volatility 50 (1s) Index</option>
                            <option value="1HZ75V">Volatility 75 (1s) Index</option>
                            <option value="1HZ100V">Volatility 100 (1s) Index</option>
                            <option value="1HZ15V">Volatility 15 (1s) Index</option>
                            <option value="1HZ30V">Volatility 30 (1s) Index</option>
                            <option value="1HZ90V">Volatility 90 (1s) Index</option>
                            <option value="R_10">Volatility 10 Index</option>
                            <option value="R_25">Volatility 25 Index</option>
                            <option value="R_50">Volatility 50 Index</option>
                            <option value="R_75">Volatility 75 Index</option>
                            <option value="R_100">Volatility 100 Index</option>
                        </select>
                    </div>
                )}

                {/* ── Strategy Matrix Selector ── */}
                <div className="minimal-card">
                    <div className="card-lbl">STRATEGIES TO MONITOR</div>
                    <div className="strategy-minimal-grid">
                        {strategies.map(s => {
                            const isSelected = entry_scanner.selected_strategies.includes(s.key);
                            return (
                                <button
                                    key={s.key}
                                    type="button"
                                    className={classNames('strat-pill', { active: isSelected })}
                                    onClick={() => entry_scanner.toggleStrategy(s.key)}
                                >
                                    <span>{s.icon} {s.label}</span>
                                    <span className="check">{isSelected ? '✓' : ''}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Status & Progress Banner ── */}
                <div className="minimal-status-bar">
                    <div className="status-row">
                        <span className="status-msg">{entry_scanner.scan_status}</span>
                        {entry_scanner.is_scanning && (
                            <span className="ticks-tag">{entry_scanner.ticks_collected} ticks</span>
                        )}
                    </div>
                    {entry_scanner.is_scanning && (
                        <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${entry_scanner.scan_progress}%` }} />
                        </div>
                    )}
                </div>

                {/* ── Input Parameters Grid ── */}
                <div className="minimal-card">
                    <div className="card-lbl">TRADE PARAMETERS</div>
                    <div className="params-grid">
                        <div className="param-item">
                            <label>Stake ($)</label>
                            <input
                                type="number"
                                step="0.1"
                                min="0.35"
                                value={entry_scanner.stake}
                                onChange={e => entry_scanner.stake = Math.max(0.35, Number(e.target.value))}
                            />
                        </div>

                        <div className="param-item">
                            <label>Ticks</label>
                            <input
                                type="number"
                                min="1"
                                max="10"
                                value={entry_scanner.duration}
                                onChange={e => entry_scanner.duration = Math.max(1, Math.min(10, Number(e.target.value)))}
                            />
                        </div>

                        <div className="param-item">
                            <label>Martingale (×)</label>
                            <input
                                type="number"
                                step="0.1"
                                min="1"
                                value={entry_scanner.martingale}
                                onChange={e => entry_scanner.martingale = Number(e.target.value)}
                            />
                        </div>

                        <div className="param-item">
                            <label>Max Runs</label>
                            <input
                                type="number"
                                min="1"
                                max="20"
                                value={entry_scanner.max_runs_before_pause}
                                onChange={e => entry_scanner.max_runs_before_pause = Number(e.target.value)}
                            />
                        </div>

                        <div className="param-item">
                            <label>Take Profit ($)</label>
                            <input
                                type="number"
                                min="1"
                                value={entry_scanner.take_profit}
                                onChange={e => entry_scanner.take_profit = Number(e.target.value)}
                            />
                        </div>

                        <div className="param-item">
                            <label>Stop Loss ($)</label>
                            <input
                                type="number"
                                min="1"
                                value={entry_scanner.stop_loss}
                                onChange={e => entry_scanner.stop_loss = Number(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="toggle-row">
                        <div className="override-box">
                            <label>Prediction Override:</label>
                            <input
                                type="number"
                                min="0"
                                max="9"
                                placeholder="Auto"
                                value={entry_scanner.custom_prediction ?? ''}
                                onChange={e => entry_scanner.custom_prediction = e.target.value === '' ? null : Number(e.target.value)}
                            />
                        </div>

                        <div className="auto-toggle-wrap" onClick={() => entry_scanner.setAutoLoadOnMatch(!entry_scanner.auto_load_on_match)}>
                            <span>Auto-Trade on Signal</span>
                            <div className={classNames('switch-pill', { active: entry_scanner.auto_load_on_match })}>
                                <div className="switch-dot" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Active PnL & Runs (if active) ── */}
                {(entry_scanner.scan_phase === 'trading' || entry_scanner.current_runs > 0) && (
                    <div className="minimal-card trading-active-card">
                        <div className="trading-row">
                            <div className="trade-col">
                                <span className="lbl">Status</span>
                                <span className="val">{entry_scanner.is_executing_trade ? '⚡ Placing Trade...' : 'Monitoring Runs'}</span>
                            </div>
                            <div className="trade-col">
                                <span className="lbl">Runs</span>
                                <span className="val">{entry_scanner.current_runs} / {entry_scanner.max_runs_before_pause}</span>
                            </div>
                            <div className="trade-col right">
                                <span className="lbl">PnL</span>
                                <span className={classNames('val pnl', {
                                    pos: entry_scanner.total_profit >= 0,
                                    neg: entry_scanner.total_profit < 0
                                })}>
                                    {entry_scanner.total_profit >= 0 ? '+' : ''}${entry_scanner.total_profit.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Action Buttons ── */}
                <div className="minimal-action-bar">
                    <button
                        type="button"
                        className={classNames('btn-primary-scan', { scanning: entry_scanner.is_scanning })}
                        onClick={() => entry_scanner.startScanning()}
                    >
                        {entry_scanner.is_scanning ? (
                            <>
                                <span className="btn-spin" />
                                <span>Stop Scanner</span>
                            </>
                        ) : (
                            <>
                                <span>⚡ Start Scanner</span>
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        className="btn-secondary-bot"
                        disabled={!entry_scanner.scan_result}
                        onClick={() => entry_scanner.loadBotToBuilderAndRun(true)}
                    >
                        <span>🤖 Load Bot & Trade</span>
                    </button>
                </div>

            </div>
        </div>
    );
});

export default EntryScanner;
