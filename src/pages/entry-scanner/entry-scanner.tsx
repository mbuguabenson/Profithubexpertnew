import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import classNames from 'classnames';
import './entry-scanner.scss';
import type { TStrategyType } from '@/stores/entry-scanner-store';

export const EntryScanner = observer(() => {
    const { entry_scanner } = useStore();

    const strategies: { key: TStrategyType; label: string; icon: string; tag: string }[] = [
        { key: 'over_under', label: 'Over / Under', icon: '↕', tag: 'High/Low' },
        { key: 'even_odd', label: 'Even / Odd', icon: '⚅', tag: 'Parity' },
        { key: 'differs', label: 'Differs', icon: '✕', tag: 'Cold Digits' },
        { key: 'matches', label: 'Matches', icon: '★', tag: 'Hot Digits' },
        { key: 'rise_fall', label: 'Rise / Fall', icon: '↗', tag: 'Momentum' },
    ];

    const monitoredMarketsList = Array.from(entry_scanner.market_stats.values());
    const bestConfidence = entry_scanner.scan_result?.confidence ?? 0;

    return (
        <div className='entry-scanner-container'>
            {/* Ambient Organic Aurora Blobs */}
            <div className='aurora-blob blob-1' />
            <div className='aurora-blob blob-2' />
            <div className='aurora-blob blob-3' />
            <div className='aurora-blob blob-4' />

            <div className='entry-scanner-content'>
                {/* ── Top Bar / Header ── */}
                <div className='scanner-glass-header'>
                    <div className='header-left'>
                        <div className='avatar-glass-pill'>
                            <span className='avatar-icon'>🔮</span>
                        </div>
                        <div className='header-titles'>
                            <span className='scanner-title'>AI Entry Scanner</span>
                            <span className='scanner-subtitle'>Next-Gen Quantum Signals</span>
                        </div>
                    </div>
                    <div className='header-right'>
                        <div
                            className='phase-pill-glow'
                            style={{
                                borderColor: entry_scanner.phase_color,
                                boxShadow: `0 0 12px ${entry_scanner.phase_color}40`,
                            }}
                        >
                            <span className='pulse-dot' style={{ background: entry_scanner.phase_color }} />
                            <span>{entry_scanner.scan_phase.toUpperCase().replace('_', ' ')}</span>
                        </div>
                        <button
                            type='button'
                            className='btn-glass-icon'
                            onClick={() => entry_scanner.resetScan()}
                            title='Reset Scanner'
                        >
                            ↺
                        </button>
                    </div>
                </div>

                {/* ── Holographic Glassmorphic VIP Card (Image 1 & 2 Style) ── */}
                <div className='holographic-glass-card'>
                    <div className='card-top-row'>
                        <div className='card-chip-wrap'>
                            <div className='gold-sim-chip' />
                            <span className='contactless-wave'>)))</span>
                        </div>
                        <div className='card-brand-badge'>
                            <span className='brand-dot' />
                            <span>{entry_scanner.scan_result ? 'ACTIVE SIGNAL' : 'RADAR STANDBY'}</span>
                        </div>
                    </div>

                    <div className='card-center-row'>
                        <div className='card-number-emboss'>
                            {entry_scanner.scan_result ? (
                                <span className='active-symbol-emboss'>{entry_scanner.scan_result.displayName}</span>
                            ) : (
                                <span className='standby-text'>
                                    •••• •••• •••• {entry_scanner.target_single_symbol || '1HZ100V'}
                                </span>
                            )}
                        </div>
                        <div className='card-confidence-gauge'>
                            <div className='gauge-circle-outer'>
                                <svg viewBox='0 0 36 36' className='circular-chart'>
                                    <path
                                        className='circle-bg'
                                        d='M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831'
                                    />
                                    <path
                                        className='circle-fill'
                                        strokeDasharray={`${bestConfidence || 75}, 100`}
                                        d='M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831'
                                    />
                                </svg>
                                <div className='gauge-text-val'>
                                    {bestConfidence > 0 ? `${bestConfidence.toFixed(0)}%` : 'AI'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className='card-bottom-row'>
                        <div className='card-meta-col'>
                            <span className='card-meta-label'>TARGET STRATEGY</span>
                            <span className='card-meta-val'>
                                {entry_scanner.scan_result
                                    ? entry_scanner.scan_result.strategy.replace('_', '/').toUpperCase()
                                    : 'MULTI-RADAR'}
                            </span>
                        </div>
                        <div className='card-meta-col'>
                            <span className='card-meta-label'>DIRECTION</span>
                            <span
                                className={classNames('card-meta-val direction-pill', {
                                    active: !!entry_scanner.scan_result,
                                    recovery: entry_scanner.is_in_recovery_mode,
                                    under:
                                        !entry_scanner.is_in_recovery_mode &&
                                        entry_scanner.scan_result?.direction === 'UNDER',
                                    over:
                                        !entry_scanner.is_in_recovery_mode &&
                                        entry_scanner.scan_result?.direction === 'OVER',
                                    even:
                                        !entry_scanner.is_in_recovery_mode &&
                                        entry_scanner.scan_result?.direction === 'EVEN',
                                    odd:
                                        !entry_scanner.is_in_recovery_mode &&
                                        entry_scanner.scan_result?.direction === 'ODD',
                                })}
                            >
                                {entry_scanner.is_in_recovery_mode
                                    ? 'UNDER 7 (RECOVERY)'
                                    : entry_scanner.scan_result?.direction || 'SCANNING'}
                            </span>
                        </div>
                        <div className='card-meta-col right'>
                            <span className='card-meta-label'>BARRIER / DIGIT</span>
                            <span className='card-meta-val highlight'>
                                {entry_scanner.custom_prediction !== null
                                    ? entry_scanner.custom_prediction
                                    : (entry_scanner.scan_result?.prediction ?? 'AUTO')}
                            </span>
                        </div>
                    </div>

                    {/* Streamed Digit Sequence Floating Pearls */}
                    {entry_scanner.wait_sequence.length > 0 && (
                        <div className='card-digit-pearls-bar'>
                            <span className='pearl-label'>STREAM:</span>
                            <div className='pearls-flow'>
                                {entry_scanner.wait_sequence.slice(-10).map((d, i) => (
                                    <span
                                        key={i}
                                        className={classNames('digit-pearl', {
                                            highlight: d === entry_scanner.scan_result?.triggerDigit,
                                        })}
                                    >
                                        {d}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Segmented Scope Tabs (All vs Single) ── */}
                <div className='segmented-scope-control'>
                    <button
                        type='button'
                        className={classNames('scope-segment-btn', { active: entry_scanner.scan_mode === 'all' })}
                        onClick={() => entry_scanner.setScanMode('all')}
                    >
                        <span>⚡ All Markets Radar</span>
                    </button>
                    <button
                        type='button'
                        className={classNames('scope-segment-btn', { active: entry_scanner.scan_mode === 'single' })}
                        onClick={() => entry_scanner.setScanMode('single')}
                    >
                        <span>🎯 Single Asset Focus</span>
                    </button>
                </div>

                {/* Single Market Dropdown Selector */}
                {entry_scanner.scan_mode === 'single' && (
                    <div className='single-market-card-select'>
                        <span className='select-hint'>SELECT TARGET VOLATILITY ASSET</span>
                        <select
                            className='glass-dropdown'
                            value={entry_scanner.target_single_symbol}
                            onChange={e => entry_scanner.setTargetSingleSymbol(e.target.value)}
                        >
                            <option value='1HZ10V'>Volatility 10 (1s) Index</option>
                            <option value='1HZ25V'>Volatility 25 (1s) Index</option>
                            <option value='1HZ50V'>Volatility 50 (1s) Index</option>
                            <option value='1HZ75V'>Volatility 75 (1s) Index</option>
                            <option value='1HZ100V'>Volatility 100 (1s) Index</option>
                            <option value='1HZ15V'>Volatility 15 (1s) Index</option>
                            <option value='1HZ30V'>Volatility 30 (1s) Index</option>
                            <option value='1HZ90V'>Volatility 90 (1s) Index</option>
                            <option value='R_10'>Volatility 10 Index</option>
                            <option value='R_25'>Volatility 25 Index</option>
                            <option value='R_50'>Volatility 50 Index</option>
                            <option value='R_75'>Volatility 75 Index</option>
                            <option value='R_100'>Volatility 100 Index</option>
                        </select>
                    </div>
                )}

                {/* ── 4-Grid Neumorphic Action / Metrics Tiles (Image 2 Style) ── */}
                <div className='neumorphic-tiles-grid'>
                    <div
                        className={classNames('neumorphic-tile action', {
                            active: entry_scanner.scan_phase === 'trading',
                        })}
                        onClick={() => entry_scanner.scan_result && entry_scanner.executeTrade()}
                    >
                        <div className='tile-icon-bubble trade-bubble'>⚡</div>
                        <div className='tile-text'>
                            <span className='tile-title'>Quick Trade</span>
                            <span className='tile-sub'>
                                {entry_scanner.is_executing_trade ? 'Executing...' : 'Direct Execution'}
                            </span>
                        </div>
                    </div>

                    <div
                        className='neumorphic-tile action'
                        onClick={() => entry_scanner.scan_result && entry_scanner.loadBotToBuilderAndRun(true)}
                    >
                        <div className='tile-icon-bubble bot-bubble'>🤖</div>
                        <div className='tile-text'>
                            <span className='tile-title'>Load Bot</span>
                            <span className='tile-sub'>Send to Builder</span>
                        </div>
                    </div>

                    <div className='neumorphic-tile metric'>
                        <div className='tile-icon-bubble stats-bubble'>📊</div>
                        <div className='tile-text'>
                            <span className='tile-title'>Live Ticks</span>
                            <span className='tile-sub'>{entry_scanner.ticks_collected} Captured</span>
                        </div>
                    </div>

                    <div className='neumorphic-tile metric'>
                        <div className='tile-icon-bubble pnl-bubble'>💰</div>
                        <div className='tile-text'>
                            <span className='tile-title'>Total PnL</span>
                            <span
                                className={classNames('tile-sub pnl-val', {
                                    positive: entry_scanner.total_profit >= 0,
                                    negative: entry_scanner.total_profit < 0,
                                })}
                            >
                                {entry_scanner.total_profit >= 0 ? '+' : ''}${entry_scanner.total_profit.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Active Strategy Selection Pills ── */}
                <div className='frosted-glass-box'>
                    <div className='box-header'>
                        <span className='box-title'>STRATEGY MATRIX</span>
                        <span className='box-tag'>Multi-Select</span>
                    </div>
                    <div className='strategy-pills-row'>
                        {strategies.map(s => {
                            const isSelected = entry_scanner.selected_strategies.includes(s.key);
                            return (
                                <button
                                    key={s.key}
                                    type='button'
                                    className={classNames('strategy-glow-pill', { active: isSelected })}
                                    onClick={() => entry_scanner.toggleStrategy(s.key)}
                                >
                                    <span className='pill-icon'>{s.icon}</span>
                                    <span className='pill-name'>{s.label}</span>
                                    <span className='pill-check'>{isSelected ? '✓' : '+'}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Live Scanner Radar Progress Bar ── */}
                <div className='frosted-glass-box radar-box'>
                    <div className='radar-status-top'>
                        <span className='radar-live-msg'>{entry_scanner.scan_status}</span>
                        <span className='radar-pct'>{entry_scanner.scan_progress}%</span>
                    </div>
                    <div className='radar-progress-track'>
                        <div className='radar-progress-fill' style={{ width: `${entry_scanner.scan_progress}%` }} />
                    </div>
                </div>

                {/* ── Monitored Markets Heatmap (Mobile Compact) ── */}
                {entry_scanner.is_scanning && monitoredMarketsList.length > 0 && (
                    <div className='frosted-glass-box'>
                        <div className='box-header'>
                            <span className='box-title'>MARKET HEATMAP RADAR</span>
                            <span className='box-tag'>{monitoredMarketsList.length} Active</span>
                        </div>
                        <div className='heatmap-mini-grid'>
                            {monitoredMarketsList.map(m => (
                                <div key={m.symbol} className='heatmap-card'>
                                    <div className='heatmap-top'>
                                        <span className='heatmap-symbol'>{m.displayName}</span>
                                        <span className='heatmap-ticks'>{m.recentDigits.length}t</span>
                                    </div>
                                    <div className='heatmap-bars'>
                                        <div className='h-bar under' title={`Under: ${m.underPercent.toFixed(0)}%`}>
                                            U {m.underPercent.toFixed(0)}%
                                        </div>
                                        <div className='h-bar over' title={`Over: ${m.overPercent.toFixed(0)}%`}>
                                            O {m.overPercent.toFixed(0)}%
                                        </div>
                                        <div className='h-bar even' title={`Even: ${m.evenPercent.toFixed(0)}%`}>
                                            E {m.evenPercent.toFixed(0)}%
                                        </div>
                                        <div className='h-bar odd' title={`Odd: ${m.oddPercent.toFixed(0)}%`}>
                                            D {m.oddPercent.toFixed(0)}%
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Input Parameters & Trading Instructions Grid ── */}
                <div className='frosted-glass-box'>
                    <div className='box-header'>
                        <span className='box-title'>INPUT INSTRUCTIONS & RISK CONFIG</span>
                    </div>

                    <div className='params-modern-grid'>
                        <div className='param-card'>
                            <span className='param-tag'>STAKE ($)</span>
                            <input
                                type='number'
                                step='0.1'
                                min='0.35'
                                className='param-field'
                                value={entry_scanner.stake}
                                onChange={e => (entry_scanner.stake = Math.max(0.35, Number(e.target.value)))}
                            />
                        </div>

                        <div className='param-card'>
                            <span className='param-tag'>DURATION (TICKS)</span>
                            <input
                                type='number'
                                min='1'
                                max='10'
                                className='param-field'
                                value={entry_scanner.duration}
                                onChange={e =>
                                    (entry_scanner.duration = Math.max(1, Math.min(10, Number(e.target.value))))
                                }
                            />
                        </div>

                        <div className='param-card'>
                            <span className='param-tag'>MARTINGALE (×)</span>
                            <input
                                type='number'
                                step='0.1'
                                min='1'
                                className='param-field'
                                value={entry_scanner.martingale}
                                onChange={e => (entry_scanner.martingale = Number(e.target.value))}
                            />
                        </div>

                        <div className='param-card'>
                            <span className='param-tag'>MAX RUNS</span>
                            <input
                                type='number'
                                min='1'
                                max='20'
                                className='param-field'
                                value={entry_scanner.max_runs_before_pause}
                                onChange={e => (entry_scanner.max_runs_before_pause = Number(e.target.value))}
                            />
                        </div>

                        <div className='param-card'>
                            <span className='param-tag'>TAKE PROFIT ($)</span>
                            <input
                                type='number'
                                min='1'
                                className='param-field'
                                value={entry_scanner.take_profit}
                                onChange={e => (entry_scanner.take_profit = Number(e.target.value))}
                            />
                        </div>

                        <div className='param-card'>
                            <span className='param-tag'>STOP LOSS ($)</span>
                            <input
                                type='number'
                                min='1'
                                className='param-field'
                                value={entry_scanner.stop_loss}
                                onChange={e => (entry_scanner.stop_loss = Number(e.target.value))}
                            />
                        </div>
                    </div>

                    {/* Auto-Load Switch & Deriv Automation API Switch */}
                    <div className='settings-toggle-bar'>
                        <div className='custom-override-wrap'>
                            <span className='override-label'>DIGIT OVERRIDE:</span>
                            <input
                                type='number'
                                min='0'
                                max='9'
                                placeholder='AUTO'
                                className='override-input'
                                value={entry_scanner.custom_prediction ?? ''}
                                onChange={e =>
                                    (entry_scanner.custom_prediction =
                                        e.target.value === '' ? null : Number(e.target.value))
                                }
                            />
                        </div>

                        <div
                            className='ios-toggle-wrap'
                            onClick={() => entry_scanner.setUseAutomationApi(!entry_scanner.use_automation_api)}
                            title='Use Deriv Server-Side auto_start Automation Engine'
                        >
                            <span className='toggle-caption'>Deriv Auto API</span>
                            <div className={classNames('ios-switch', { active: entry_scanner.use_automation_api })}>
                                <div className='switch-thumb' />
                            </div>
                        </div>

                        <div
                            className='ios-toggle-wrap'
                            onClick={() => entry_scanner.setAutoLoadOnMatch(!entry_scanner.auto_load_on_match)}
                        >
                            <span className='toggle-caption'>Auto-Trade</span>
                            <div className={classNames('ios-switch', { active: entry_scanner.auto_load_on_match })}>
                                <div className='switch-thumb' />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Live Trading Execution Log ── */}
                {entry_scanner.trade_log.length > 0 && (
                    <div className='frosted-glass-box'>
                        <div className='box-header'>
                            <span className='box-title'>RECENT TRADE EXECUTION HISTORY</span>
                            <span className='box-tag'>Runs: {entry_scanner.current_runs}</span>
                        </div>
                        <div className='trade-history-list'>
                            {entry_scanner.trade_log.slice(0, 5).map((log, idx) => (
                                <div key={idx} className={classNames('history-row', log.result.toLowerCase())}>
                                    <span className='row-time'>{log.time}</span>
                                    <span className='row-mkt'>{log.market}</span>
                                    <span className='row-dir'>{log.direction}</span>
                                    <span className={classNames('row-badge', log.result.toLowerCase())}>
                                        {log.result}
                                    </span>
                                    <span className='row-profit'>
                                        {log.profit >= 0 ? '+' : ''}${log.profit.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Main Action Bottom Floating Bar (Image 1 Style) ── */}
                <div className='bottom-action-dock'>
                    <button
                        type='button'
                        className={classNames('btn-dock-main', { scanning: entry_scanner.is_scanning })}
                        onClick={() => entry_scanner.startScanning()}
                    >
                        {entry_scanner.is_scanning ? (
                            <>
                                <span className='dock-spinner' />
                                <span>Stop AI Radar</span>
                            </>
                        ) : (
                            <>
                                <span className='dock-icon'>⚡</span>
                                <span>Launch Quantum Scan</span>
                            </>
                        )}
                    </button>

                    <button
                        type='button'
                        className='btn-dock-secondary'
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
