import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import classNames from 'classnames';
import './entry-scanner.scss';
import type { TStrategyType } from '@/stores/entry-scanner-store';

export const EntryScanner = observer(() => {
    const { entry_scanner } = useStore();

    const strategies: { key: TStrategyType; label: string; icon: string; desc: string }[] = [
        { key: 'over_under', label: 'Over / Under', icon: '⬆⬇', desc: 'Trade Over 1,2,3 or Under 8,7,6' },
        { key: 'even_odd', label: 'Even / Odd', icon: '🔢', desc: 'Even or Odd with pattern detection' },
        { key: 'differs', label: 'Differs', icon: '🎯', desc: 'Auto-differ on constant digit' },
    ];

    return (
        <div className="entry-scanner-container">
            <div className="entry-scanner-content">

                {/* ── Strategy Selector ── */}
                <div className="strategy-selector">
                    {strategies.map(s => (
                        <div
                            key={s.key}
                            className={classNames('strategy-card', { active: entry_scanner.strategy_type === s.key })}
                            onClick={() => entry_scanner.setStrategyType(s.key)}
                        >
                            <span className="strategy-icon">{s.icon}</span>
                            <span className="strategy-name">{s.label}</span>
                            <span className="strategy-desc">{s.desc}</span>
                        </div>
                    ))}
                </div>

                {/* ── Scan Scope Mode: Scan All vs Single Market ── */}
                <div className="scan-scope-selector" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button
                        type="button"
                        className={classNames('btn-scope', { active: entry_scanner.scan_mode === 'all' })}
                        onClick={() => entry_scanner.setScanMode('all')}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)',
                            background: entry_scanner.scan_mode === 'all' ? 'rgba(245,197,66,0.2)' : 'rgba(0,0,0,0.2)',
                            color: entry_scanner.scan_mode === 'all' ? '#f5c542' : 'rgba(255,255,255,0.7)',
                            fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                        }}
                    >
                        ⚡ Scan All Markets
                    </button>
                    <button
                        type="button"
                        className={classNames('btn-scope', { active: entry_scanner.scan_mode === 'single' })}
                        onClick={() => entry_scanner.setScanMode('single')}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)',
                            background: entry_scanner.scan_mode === 'single' ? 'rgba(245,197,66,0.2)' : 'rgba(0,0,0,0.2)',
                            color: entry_scanner.scan_mode === 'single' ? '#f5c542' : 'rgba(255,255,255,0.7)',
                            fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                        }}
                    >
                        🎯 Single Market
                    </button>
                </div>

                {/* Single Market Dropdown Selector */}
                {entry_scanner.scan_mode === 'single' && (
                    <div className="single-market-select-wrap" style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '10px', fontWeight: 'bold', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                            Select Single Market
                        </label>
                        <select
                            value={entry_scanner.target_single_symbol}
                            onChange={(e) => entry_scanner.setTargetSingleSymbol(e.target.value)}
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: '8px',
                                background: 'rgba(20,20,35,0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
                                fontSize: '13px', fontWeight: 'bold', outline: 'none'
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

                {/* ── Status Banner ── */}
                <div
                    className="phase-banner"
                    style={{ borderLeftColor: entry_scanner.phase_color }}
                >
                    <div className="phase-label">
                        <span className="phase-dot" style={{ background: entry_scanner.phase_color }} />
                        {entry_scanner.scan_phase.toUpperCase().replace('_', ' ')}
                    </div>
                    <div className="phase-status">{entry_scanner.scan_status}</div>
                </div>

                {/* ── Scan Result Card ── */}
                {entry_scanner.scan_result && (
                    <div className="result-card">
                        <div className="result-header">
                            <span className="result-market">{entry_scanner.scan_result.displayName}</span>
                            <span className="result-confidence">{entry_scanner.scan_result.confidence.toFixed(1)}%</span>
                        </div>
                        <div className="result-details">
                            <div className="detail-item">
                                <label>Direction</label>
                                <span className={classNames('direction-badge', entry_scanner.scan_result.direction.toLowerCase())}>
                                    {entry_scanner.scan_result.direction}
                                </span>
                            </div>
                            {entry_scanner.scan_result.prediction > 0 && (
                                <div className="detail-item">
                                    <label>Prediction</label>
                                    <span className="prediction-value">{entry_scanner.scan_result.prediction}</span>
                                </div>
                            )}
                            <div className="detail-item">
                                <label>Trigger Digit</label>
                                <span className="trigger-value">{entry_scanner.scan_result.triggerDigit >= 0 ? entry_scanner.scan_result.triggerDigit : 'Pattern'}</span>
                            </div>
                        </div>
                        {entry_scanner.wait_sequence.length > 0 && (
                            <div className="wait-sequence">
                                <label>Wait Sequence:</label>
                                <div className="digit-sequence">
                                    {entry_scanner.wait_sequence.slice(-20).map((d, i) => (
                                        <span key={i} className={classNames('seq-digit', {
                                            'highlight': d === entry_scanner.scan_result?.triggerDigit,
                                        })}>{d}</span>
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

                {/* ── Trade Log ── */}
                {entry_scanner.trade_log.length > 0 && (
                    <div className="trade-log">
                        <label>Trade Log</label>
                        <div className="log-entries">
                            {entry_scanner.trade_log.slice(-10).reverse().map((log, i) => (
                                <div key={i} className={classNames('log-entry', log.result.toLowerCase())}>
                                    <span className="log-time">{log.time}</span>
                                    <span className="log-market">{log.market}</span>
                                    <span className="log-direction">{log.direction}{log.prediction > 0 ? ` ${log.prediction}` : ''}</span>
                                    <span className={classNames('log-result', log.result.toLowerCase())}>{log.result}</span>
                                    <span className="log-profit">{log.profit >= 0 ? '+' : ''}{log.profit.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Parameters ── */}
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
                        <label>Martingale</label>
                        <div
                            className={classNames('toggle-switch', { active: entry_scanner.use_martingale })}
                            onClick={() => entry_scanner.use_martingale = !entry_scanner.use_martingale}
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
                        {entry_scanner.is_scanning ? '⬛ Stop Scan' : '▶ Scan Markets'}
                    </button>
                    <button
                        className="btn-load"
                        disabled={!entry_scanner.scan_result || entry_scanner.scan_phase === 'trading'}
                        onClick={() => entry_scanner.generateAndLoadBot()}
                    >
                        🚀 Load & Run
                    </button>
                </div>
            </div>
        </div>
    );
});

export default EntryScanner;
