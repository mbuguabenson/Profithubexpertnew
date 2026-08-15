import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import classNames from 'classnames';
import './entry-scanner.scss';
import type { TStrategyType } from '@/stores/entry-scanner-store';

export const EntryScanner = observer(() => {
    const { entry_scanner } = useStore();

    const strategies: { key: TStrategyType; label: string; icon: string; desc: string }[] = [
        { key: 'over_under', label: 'Over / Under', icon: '⬆⬇', desc: 'Predict High/Low Barrier' },
        { key: 'even_odd', label: 'Even / Odd', icon: '🔢', desc: 'Parity Streaks' },
        { key: 'differs', label: 'Differs', icon: '🎯', desc: 'Cold Digit Avoidance' },
        { key: 'matches', label: 'Matches', icon: '✨', desc: 'Hot Digit Alignment' },
        { key: 'rise_fall', label: 'Rise / Fall', icon: '📈', desc: 'Tick Momentum' },
    ];

    const monitoredMarketsList = Array.from(entry_scanner.market_stats.values());

    return (
        <div className="entry-scanner-container">
            <div className="entry-scanner-content">

                {/* ── Glassmorphic Header ── */}
                <div className="scanner-glass-header">
                    <div className="header-left">
                        <div className="scanner-logo-pill">
                            <span className="radar-icon">📡</span>
                            <span className="scanner-title">AI Market Entry Scanner</span>
                        </div>
                        <span className="version-pill">v3.2 Glass</span>
                    </div>
                    <div className="header-right">
                        <div className="phase-indicator-pill" style={{ borderColor: entry_scanner.phase_color }}>
                            <span className="pulse-beacon" style={{ background: entry_scanner.phase_color }} />
                            <span>{entry_scanner.scan_phase.toUpperCase().replace('_', ' ')}</span>
                        </div>
                        <button
                            type="button"
                            className="btn-reset-glass"
                            onClick={() => entry_scanner.resetScan()}
                            title="Reset Scanner"
                        >
                            ↺
                        </button>
                    </div>
                </div>

                {/* ── Multi-Strategy Selector ── */}
                <div className="glass-section">
                    <div className="section-label">
                        <span>Active Strategies</span>
                        <span className="badge-hint">Multi-Select Enabled</span>
                    </div>
                    <div className="strategy-grid">
                        {strategies.map(s => {
                            const isSelected = entry_scanner.selected_strategies.includes(s.key);
                            return (
                                <div
                                    key={s.key}
                                    className={classNames('strategy-capsule', { active: isSelected })}
                                    onClick={() => entry_scanner.toggleStrategy(s.key)}
                                    title={`Toggle ${s.label}: ${s.desc}`}
                                >
                                    <span className="strategy-icon">{s.icon}</span>
                                    <div className="strategy-meta">
                                        <span className="strategy-name">{s.label}</span>
                                    </div>
                                    <span className="strategy-check">{isSelected ? '●' : '○'}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Scope Mode Selector (All vs Single) ── */}
                <div className="scan-scope-bar">
                    <button
                        type="button"
                        className={classNames('btn-scope-glass', { active: entry_scanner.scan_mode === 'all' })}
                        onClick={() => entry_scanner.setScanMode('all')}
                    >
                        <span className="scope-icon">⚡</span>
                        <span>All Synthetic Markets</span>
                    </button>
                    <button
                        type="button"
                        className={classNames('btn-scope-glass', { active: entry_scanner.scan_mode === 'single' })}
                        onClick={() => entry_scanner.setScanMode('single')}
                    >
                        <span className="scope-icon">🎯</span>
                        <span>Single Target Market</span>
                    </button>
                </div>

                {/* Single Market Dropdown Selector */}
                {entry_scanner.scan_mode === 'single' && (
                    <div className="single-market-dropdown-wrap">
                        <label className="input-label">Target Market Asset</label>
                        <select
                            className="glass-select"
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

                {/* ── Status & Radar Progress Banner ── */}
                <div
                    className="radar-status-card"
                    style={{ borderLeftColor: entry_scanner.phase_color }}
                >
                    <div className="radar-header">
                        <div className="radar-status-text">
                            <span className="status-text">{entry_scanner.scan_status}</span>
                        </div>
                        {entry_scanner.is_scanning && (
                            <span className="ticks-badge">
                                📊 {entry_scanner.ticks_collected} Ticks
                            </span>
                        )}
                    </div>

                    {/* Animated Progress Bar */}
                    {entry_scanner.is_scanning && (
                        <div className="progress-bar-container">
                            <div className="progress-bar-track">
                                <div
                                    className="progress-bar-fill"
                                    style={{ width: `${entry_scanner.scan_progress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* ── High Confidence Matched Entry Card ── */}
                {entry_scanner.scan_result && (
                    <div className="matched-entry-glass-card">
                        <div className="entry-header">
                            <div className="entry-asset-info">
                                <span className="entry-match-tag">🎯 MATCH CONFIRMED</span>
                                <span className="entry-market-title">{entry_scanner.scan_result.displayName}</span>
                            </div>
                            <div className="entry-confidence-pill">
                                {entry_scanner.scan_result.confidence.toFixed(1)}% Confidence
                            </div>
                        </div>

                        <div className="entry-badges-grid">
                            <div className="badge-item">
                                <span className="badge-label">Direction</span>
                                <span className={classNames('badge-value direction', entry_scanner.scan_result.direction.toLowerCase())}>
                                    {entry_scanner.scan_result.direction}
                                </span>
                            </div>

                            {entry_scanner.scan_result.prediction >= 0 && (
                                <div className="badge-item">
                                    <span className="badge-label">Barrier / Digit</span>
                                    <span className="badge-value barrier">
                                        {entry_scanner.custom_prediction !== null ? entry_scanner.custom_prediction : entry_scanner.scan_result.prediction}
                                    </span>
                                </div>
                            )}

                            <div className="badge-item">
                                <span className="badge-label">Strategy</span>
                                <span className="badge-value strategy">
                                    {entry_scanner.scan_result.strategy.replace('_', '/').toUpperCase()}
                                </span>
                            </div>
                        </div>

                        {/* Digit Stream Preview */}
                        {entry_scanner.wait_sequence.length > 0 && (
                            <div className="digit-stream-row">
                                <span className="stream-label">Live Digits:</span>
                                <div className="digit-stream-chips">
                                    {entry_scanner.wait_sequence.slice(-12).map((d, i) => (
                                        <span
                                            key={i}
                                            className={classNames('digit-chip', {
                                                target: d === entry_scanner.scan_result?.triggerDigit
                                            })}
                                        >
                                            {d}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Match Card Instant Actions */}
                        <div className="match-actions-row">
                            <button
                                type="button"
                                className="btn-match-action trade"
                                disabled={entry_scanner.is_executing_trade}
                                onClick={() => entry_scanner.executeTrade()}
                            >
                                ⚡ Quick Trade Now
                            </button>
                            <button
                                type="button"
                                className="btn-match-action load"
                                onClick={() => entry_scanner.loadBotToBuilderAndRun(true)}
                            >
                                🤖 Load Bot & Trade
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Monitored Markets Live Stats Grid (Mobile-First Compact) ── */}
                {entry_scanner.is_scanning && monitoredMarketsList.length > 0 && (
                    <div className="monitored-grid-section">
                        <div className="section-label">
                            <span>Live Scanner Feed ({monitoredMarketsList.length} Markets)</span>
                        </div>
                        <div className="markets-mini-grid">
                            {monitoredMarketsList.map(m => (
                                <div key={m.symbol} className="market-mini-card">
                                    <div className="market-card-top">
                                        <span className="market-name">{m.displayName}</span>
                                        <span className="market-ticks">{m.recentDigits.length}t</span>
                                    </div>
                                    <div className="stat-bars-row">
                                        <div className="stat-pill under">U: {m.underPercent.toFixed(0)}%</div>
                                        <div className="stat-pill over">O: {m.overPercent.toFixed(0)}%</div>
                                        <div className="stat-pill even">E: {m.evenPercent.toFixed(0)}%</div>
                                        <div className="stat-pill odd">D: {m.oddPercent.toFixed(0)}%</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Active Trading Performance Card ── */}
                {(entry_scanner.scan_phase === 'trading' || entry_scanner.current_runs > 0) && (
                    <div className="trading-stats-glass-card">
                        <div className="trading-stats-top">
                            <div className="stats-col">
                                <span className="stats-label">Execution Status</span>
                                <span className="stats-value-active">
                                    {entry_scanner.is_executing_trade ? '⚡ Placing Trade...' : 'Active Monitoring'}
                                </span>
                            </div>
                            <div className="stats-col right">
                                <span className="stats-label">Runs Count</span>
                                <span className="runs-badge">
                                    {entry_scanner.current_runs} / {entry_scanner.max_runs_before_pause}
                                </span>
                            </div>
                            <div className="stats-col right">
                                <span className="stats-label">Total PnL</span>
                                <span className={classNames('pnl-badge', {
                                    positive: entry_scanner.total_profit >= 0,
                                    negative: entry_scanner.total_profit < 0
                                })}>
                                    {entry_scanner.total_profit >= 0 ? '+' : ''}${entry_scanner.total_profit.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        {/* Mini Trade Log */}
                        {entry_scanner.trade_log.length > 0 && (
                            <div className="trade-mini-log">
                                <div className="log-header">Recent Execution History</div>
                                <div className="log-list">
                                    {entry_scanner.trade_log.slice(0, 5).map((log, idx) => (
                                        <div key={idx} className={classNames('log-item', log.result.toLowerCase())}>
                                            <span className="log-time">{log.time}</span>
                                            <span className="log-mkt">{log.market}</span>
                                            <span className="log-dir">{log.direction}</span>
                                            <span className={classNames('log-res', log.result.toLowerCase())}>{log.result}</span>
                                            <span className="log-pnl">{log.profit >= 0 ? '+' : ''}${log.profit.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Input Instructions & Trade Parameters Grid ── */}
                <div className="glass-section params-section">
                    <div className="section-label">
                        <span>Input Instructions & Trade Parameters</span>
                    </div>

                    <div className="params-compact-grid">
                        <div className="param-glass-box">
                            <label className="param-label">Stake ($)</label>
                            <input
                                type="number"
                                step="0.1"
                                min="0.35"
                                className="param-input"
                                value={entry_scanner.stake}
                                onChange={e => entry_scanner.stake = Math.max(0.35, Number(e.target.value))}
                            />
                        </div>

                        <div className="param-glass-box">
                            <label className="param-label">Ticks Duration</label>
                            <input
                                type="number"
                                min="1"
                                max="10"
                                className="param-input"
                                value={entry_scanner.duration}
                                onChange={e => entry_scanner.duration = Math.max(1, Math.min(10, Number(e.target.value)))}
                            />
                        </div>

                        <div className="param-glass-box">
                            <label className="param-label">Martingale (×)</label>
                            <input
                                type="number"
                                step="0.1"
                                min="1"
                                className="param-input"
                                value={entry_scanner.martingale}
                                onChange={e => entry_scanner.martingale = Number(e.target.value)}
                            />
                        </div>

                        <div className="param-glass-box">
                            <label className="param-label">Max Runs</label>
                            <input
                                type="number"
                                min="1"
                                max="20"
                                className="param-input"
                                value={entry_scanner.max_runs_before_pause}
                                onChange={e => entry_scanner.max_runs_before_pause = Number(e.target.value)}
                            />
                        </div>

                        <div className="param-glass-box">
                            <label className="param-label">Take Profit ($)</label>
                            <input
                                type="number"
                                min="1"
                                className="param-input"
                                value={entry_scanner.take_profit}
                                onChange={e => entry_scanner.take_profit = Number(e.target.value)}
                            />
                        </div>

                        <div className="param-glass-box">
                            <label className="param-label">Stop Loss ($)</label>
                            <input
                                type="number"
                                min="1"
                                className="param-input"
                                value={entry_scanner.stop_loss}
                                onChange={e => entry_scanner.stop_loss = Number(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Auto-Load Toggle & Custom Prediction */}
                    <div className="params-bottom-row">
                        <div className="custom-pred-box">
                            <label className="param-label">Custom Prediction (Override)</label>
                            <input
                                type="number"
                                min="0"
                                max="9"
                                placeholder="Auto"
                                className="param-input-small"
                                value={entry_scanner.custom_prediction ?? ''}
                                onChange={e => entry_scanner.custom_prediction = e.target.value === '' ? null : Number(e.target.value)}
                            />
                        </div>

                        <div className="toggle-switch-container">
                            <span className="toggle-title">Auto-Load & Trade On Match</span>
                            <div
                                className={classNames('glass-toggle-pill', { active: entry_scanner.auto_load_on_match })}
                                onClick={() => entry_scanner.setAutoLoadOnMatch(!entry_scanner.auto_load_on_match)}
                                title="Toggle automatic strategy bot loading upon finding a match"
                            >
                                <div className="toggle-thumb" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Main Action Buttons ── */}
                <div className="scanner-action-bar">
                    <button
                        type="button"
                        className={classNames('btn-main-scan', { scanning: entry_scanner.is_scanning })}
                        onClick={() => entry_scanner.startScanning()}
                    >
                        {entry_scanner.is_scanning ? (
                            <>
                                <span className="btn-spinner" />
                                <span>Stop Market Scanner</span>
                            </>
                        ) : (
                            <>
                                <span>⚡ Start Scan Markets</span>
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        className="btn-main-load"
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
