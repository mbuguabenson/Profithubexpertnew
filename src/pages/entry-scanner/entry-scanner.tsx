import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import classNames from 'classnames';
import './entry-scanner.scss';
import type { TStrategyType } from '@/stores/entry-scanner-store';

export const EntryScanner = observer(() => {
    const { entry_scanner } = useStore();

    const strategies: { key: TStrategyType; label: string; icon: string }[] = [
        { key: 'over_under', label: 'Over / Under', icon: '⬆⬇' },
        { key: 'even_odd', label: 'Even / Odd', icon: '🔢' },
        { key: 'differs', label: 'Differs', icon: '🎯' },
    ];

    return (
        <div className="entry-scanner-container">
            <div className="entry-scanner-content">

                {/* ── Compact Multi-Strategy Selector ── */}
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '2px' }}>
                    Select Strategies (Multi-Select Enabled)
                </div>
                <div className="strategy-selector">
                    {strategies.map(s => {
                        const isSelected = entry_scanner.selected_strategies.includes(s.key);
                        return (
                            <div
                                key={s.key}
                                className={classNames('strategy-card', { active: isSelected })}
                                onClick={() => entry_scanner.toggleStrategy(s.key)}
                                title="Click to toggle strategy"
                            >
                                <span className="strategy-icon">{s.icon}</span>
                                <span className="strategy-name">{s.label}</span>
                                {isSelected && <span className="strategy-check">✓</span>}
                            </div>
                        );
                    })}
                </div>

                {/* ── Scan Scope Mode: Scan All vs Single Market ── */}
                <div className="scan-scope-selector" style={{ display: 'flex', gap: '8px', margin: '4px 0 8px 0' }}>
                    <button
                        type="button"
                        className={classNames('btn-scope', { active: entry_scanner.scan_mode === 'all' })}
                        onClick={() => entry_scanner.setScanMode('all')}
                        style={{
                            flex: 1, padding: '7px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)',
                            background: entry_scanner.scan_mode === 'all' ? 'rgba(245,197,66,0.2)' : 'rgba(0,0,0,0.2)',
                            color: entry_scanner.scan_mode === 'all' ? '#f5c542' : 'rgba(255,255,255,0.7)',
                            fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                        }}
                    >
                        ⚡ Scan All Markets
                    </button>
                    <button
                        type="button"
                        className={classNames('btn-scope', { active: entry_scanner.scan_mode === 'single' })}
                        onClick={() => entry_scanner.setScanMode('single')}
                        style={{
                            flex: 1, padding: '7px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)',
                            background: entry_scanner.scan_mode === 'single' ? 'rgba(245,197,66,0.2)' : 'rgba(0,0,0,0.2)',
                            color: entry_scanner.scan_mode === 'single' ? '#f5c542' : 'rgba(255,255,255,0.7)',
                            fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                        }}
                    >
                        🎯 Single Market
                    </button>
                </div>

                {/* Single Market Dropdown Selector */}
                {entry_scanner.scan_mode === 'single' && (
                    <div className="single-market-select-wrap" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '10px', fontWeight: 'bold', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                            Target Market
                        </label>
                        <select
                            value={entry_scanner.target_single_symbol}
                            onChange={(e) => entry_scanner.setTargetSingleSymbol(e.target.value)}
                            style={{
                                width: '100%', padding: '7px 10px', borderRadius: '8px',
                                background: 'rgba(20,20,35,0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
                                fontSize: '12px', fontWeight: 'bold', outline: 'none'
                            }}
                        >
                            <option value="R_10">Volatility 10 Index</option>
                            <option value="1HZ10V">Volatility 10 (1s) Index</option>
                            <option value="1HZ15V">Volatility 15 (1s) Index</option>
                            <option value="R_25">Volatility 25 Index</option>
                            <option value="1HZ25V">Volatility 25 (1s) Index</option>
                            <option value="1HZ30V">Volatility 30 (1s) Index</option>
                            <option value="R_50">Volatility 50 Index</option>
                            <option value="1HZ50V">Volatility 50 (1s) Index</option>
                            <option value="R_75">Volatility 75 Index</option>
                            <option value="1HZ75V">Volatility 75 (1s) Index</option>
                            <option value="1HZ90V">Volatility 90 (1s) Index</option>
                            <option value="R_100">Volatility 100 Index</option>
                            <option value="1HZ100V">Volatility 100 (1s) Index</option>
                        </select>
                    </div>
                )}

                {/* ── Status & Progress Banner ── */}
                <div
                    className="phase-banner"
                    style={{ borderLeftColor: entry_scanner.phase_color }}
                >
                    <div className="phase-label" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="phase-dot" style={{ background: entry_scanner.phase_color }} />
                            {entry_scanner.scan_phase.toUpperCase().replace('_', ' ')}
                        </div>
                        {entry_scanner.is_scanning && (
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#f5c542' }}>
                                {entry_scanner.ticks_collected} Ticks Streamed
                            </span>
                        )}
                    </div>
                    <div className="phase-status">{entry_scanner.scan_status}</div>

                    {/* Animated Progress Bar */}
                    {entry_scanner.is_scanning && (
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 'bold', color: 'rgba(255,255,255,0.6)', marginBottom: '3px' }}>
                                <span>Scanning & History Buffer (1,000 ticks)</span>
                                <span>{entry_scanner.scan_progress}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                <div
                                    style={{
                                        width: `${entry_scanner.scan_progress}%`, height: '100%',
                                        background: 'linear-gradient(90deg, #3b82f6, #f5c542, #10b981)',
                                        transition: 'width 0.4s ease'
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Scan Result Card ── */}
                {entry_scanner.scan_result && (
                    <div className="result-card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(30,58,95,0.8))', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px', padding: '12px' }}>
                        <div className="result-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span className="result-market" style={{ fontWeight: 'bold', fontSize: '14px', color: '#fff' }}>
                                🎯 {entry_scanner.scan_result.displayName}
                            </span>
                            <span className="result-confidence" style={{ background: '#10b981', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px' }}>
                                {entry_scanner.scan_result.confidence.toFixed(1)}% Match
                            </span>
                        </div>
                        <div className="result-details" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '11px' }}>
                            <div className="detail-item">
                                <label style={{ display: 'block', fontSize: '9px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Direction</label>
                                <span className={classNames('direction-badge', entry_scanner.scan_result.direction.toLowerCase())} style={{ fontWeight: 'bold', color: '#4ade80' }}>
                                    {entry_scanner.scan_result.direction}
                                </span>
                            </div>
                            {entry_scanner.scan_result.prediction >= 0 && (
                                <div className="detail-item">
                                    <label style={{ display: 'block', fontSize: '9px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Barrier / Prediction</label>
                                    <span className="prediction-value" style={{ fontWeight: 'bold', color: '#f5c542' }}>
                                        {entry_scanner.scan_result.prediction}
                                    </span>
                                </div>
                            )}
                            <div className="detail-item">
                                <label style={{ display: 'block', fontSize: '9px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Strategy</label>
                                <span className="trigger-value" style={{ fontWeight: 'bold', color: '#cbd5e1' }}>
                                    {entry_scanner.scan_result.strategy.replace('_', '/')}
                                </span>
                            </div>
                        </div>
                        {entry_scanner.wait_sequence.length > 0 && (
                            <div className="wait-sequence" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <label style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '3px' }}>Recent Streamed Digits:</label>
                                <div className="digit-sequence" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    {entry_scanner.wait_sequence.slice(-15).map((d, i) => (
                                        <span key={i} style={{
                                            padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)',
                                            fontSize: '11px', fontWeight: 'bold', color: d === entry_scanner.scan_result?.triggerDigit ? '#f5c542' : '#fff'
                                        }}>{d}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Trading Status ── */}
                {entry_scanner.scan_phase === 'trading' && (
                    <div className="trading-card">
                        <div className="trading-header">
                            <span>Auto-Trading Active</span>
                            <span className="runs-counter">{entry_scanner.current_runs}/{entry_scanner.max_runs_before_pause} Runs</span>
                        </div>
                        <div className="trading-profit">
                            <label>Total Profit</label>
                            <span className={classNames('profit-value', { positive: entry_scanner.total_profit >= 0, negative: entry_scanner.total_profit < 0 })}>
                                {entry_scanner.total_profit >= 0 ? '+' : ''}{entry_scanner.total_profit.toFixed(2)} USD
                            </span>
                        </div>
                    </div>
                )}

                {/* ── Parameters & Auto-Load Toggle ── */}
                <div className="params-grid">
                    <div className="param-field">
                        <label>Stake (USD)</label>
                        <input type="number" step="0.1" min="0.35" value={entry_scanner.stake} onChange={e => entry_scanner.stake = Number(e.target.value)} />
                    </div>
                    <div className="param-field">
                        <label>Martingale ×</label>
                        <input type="number" step="0.1" min="1" value={entry_scanner.martingale} onChange={e => entry_scanner.martingale = Number(e.target.value)} />
                    </div>
                    <div className="param-field">
                        <label>Max Runs</label>
                        <input type="number" min="1" max="20" value={entry_scanner.max_runs_before_pause} onChange={e => entry_scanner.max_runs_before_pause = Number(e.target.value)} />
                    </div>
                    <div className="param-field">
                        <label>Stop Loss (USD)</label>
                        <input type="number" min="1" value={entry_scanner.stop_loss} onChange={e => entry_scanner.stop_loss = Number(e.target.value)} />
                    </div>
                    <div className="param-field toggle-field">
                        <label>Auto-Load & Run</label>
                        <div
                            className={classNames('toggle-switch', { active: entry_scanner.auto_load_on_match })}
                            onClick={() => entry_scanner.setAutoLoadOnMatch(!entry_scanner.auto_load_on_match)}
                            title="Auto-trigger strategy execution when high-confidence match is found"
                        >
                            <div className="toggle-knob" />
                        </div>
                    </div>
                </div>

                {/* ── Action Buttons ── */}
                <div className="action-buttons">
                    <button
                        className={classNames('btn-scan', { scanning: entry_scanner.is_scanning })}
                        onClick={() => entry_scanner.startScanning()}
                    >
                        {entry_scanner.is_scanning ? '⬛ Stop Scanning' : '⚡ Start Scan Markets'}
                    </button>
                    <button
                        className="btn-load"
                        disabled={!entry_scanner.scan_result || entry_scanner.scan_phase === 'trading'}
                        onClick={() => entry_scanner.generateAndLoadBot()}
                    >
                        🚀 Run Strategy
                    </button>
                </div>
            </div>
        </div>
    );
});

export default EntryScanner;
