import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import './dollarmine.scss';

export const Dollarmine = observer(() => {
    const store = useStore();
    if (!store) return null;
    
    const { dollarmine, scanner } = store;
    
    return (
        <div className="dollarmine-container">
            {/* Header Section */}
            <header className="dm-header">
                <div className="dm-header__left">
                    <div className="dm-logo">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2" />
                            <path d="M12 9v6" />
                            <path d="M9 12h6" />
                        </svg>
                    </div>
                    <div className="dm-title">
                        <h1>{localize('Dollarmine')}</h1>
                        <p>{localize('Market Radar & AI Engine')}</p>
                    </div>
                </div>
                
                <div className="dm-header__controls">
                    <div className="control-group">
                        <label>{localize('Stake (USD)')}</label>
                        <input 
                            type="number" 
                            value={dollarmine.stake} 
                            onChange={(e) => dollarmine.stake = Number(e.target.value)} 
                            min="0.35"
                            step="0.35"
                        />
                    </div>
                    <div className="control-group">
                        <label>{localize('Max Runs/Cycle')}</label>
                        <input 
                            type="number" 
                            value={dollarmine.max_runs} 
                            onChange={(e) => dollarmine.max_runs = Number(e.target.value)} 
                            min="1"
                        />
                    </div>
                    <div className="control-group">
                        <label>{localize('Switch After Losses')}</label>
                        <input 
                            type="number" 
                            value={scanner.switch_strategy_after_losses} 
                            onChange={(e) => scanner.switch_strategy_after_losses = Number(e.target.value)} 
                            min="1"
                        />
                    </div>
                    <div className="control-group">
                        <label>{localize('Target Strategy')}</label>
                        <select 
                            value={scanner.target_switch_strategy} 
                            onChange={(e) => scanner.target_switch_strategy = e.target.value as any}
                        >
                            <option value="auto">Auto Select</option>
                            <option value="over_under">Over/Under</option>
                            <option value="even_odd">Even/Odd</option>
                            <option value="differs">Differs</option>
                            <option value="rise_fall">Rise/Fall</option>
                        </select>
                    </div>
                    
                    <button 
                        className={classNames('dm-btn', {
                            'dm-btn--stop': dollarmine.is_scanning,
                            'dm-btn--start': !dollarmine.is_scanning
                        })}
                        onClick={() => dollarmine.is_scanning ? dollarmine.stopScanning() : dollarmine.startScanning()}
                    >
                        {dollarmine.is_scanning ? localize('Stop Radar') : localize('Start Radar')}
                    </button>
                </div>
            </header>

            {/* Main Layout: Radar + Details */}
            <div className="dm-layout">
                
                {/* LEFT: Market Radar */}
                <div className="dm-radar">
                    <div className="dm-card radar-panel">
                        <div className="radar-header">
                            <h2>{localize('Market Radar')}</h2>
                            <span className="count">{dollarmine.active_symbols?.length || 0} Markets</span>
                        </div>
                        
                        {!dollarmine.is_scanning ? (
                            <div className="radar-empty">
                                <p>{localize('Start Radar to scan markets')}</p>
                            </div>
                        ) : (
                            <div className="radar-grid">
                                {dollarmine.active_symbols?.map(s => {
                                    const stats = dollarmine.market_stats.get(s.symbol);
                                    const isSelected = dollarmine.viewing_market === s.symbol;
                                    
                                    return (
                                        <div 
                                            key={s.symbol} 
                                            className={classNames('radar-item', { active: isSelected })}
                                            onClick={() => dollarmine.viewing_market = s.symbol}
                                        >
                                            <div className="radar-item__name">{s.display_name}</div>
                                            
                                            {stats ? (
                                                <div className="radar-item__data">
                                                    <div className={classNames('price', {
                                                        'up': stats.priceDirection === 'UP',
                                                        'down': stats.priceDirection === 'DOWN'
                                                    })}>
                                                        {stats.currentPrice || '0.000'}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="radar-item__data loading">
                                                    loading...
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: Market Details & Strategies */}
                <div className="dm-details">
                    {!dollarmine.viewing_market ? (
                        <div className="dm-card empty-state">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="6" />
                                <circle cx="12" cy="12" r="2" />
                            </svg>
                            <h2>{localize('Select a Market')}</h2>
                            <p>{localize('Click on any market from the radar to view detailed statistics and enable auto-trading strategies.')}</p>
                        </div>
                    ) : (
                        (() => {
                            const stats = dollarmine.market_stats.get(dollarmine.viewing_market);
                            if (!stats) return <div className="dm-card empty-state">Loading data...</div>;

                            return (
                                <div className="dm-card details-panel">
                                    <div className="details-header">
                                        <div className="title">
                                            <h2>{stats.displayName}</h2>
                                            <span className="price">{stats.currentPrice}</span>
                                        </div>
                                    </div>

                                    <div className="strategies-grid">
                                        {/* Over/Under Strategy Box */}
                                        <div className="strategy-box">
                                            <div className="box-header">
                                                <h3>Over/Under 5</h3>
                                                <div className="status">
                                                    <span className={classNames('dot', { active: dollarmine.ou_is_auto_trading && dollarmine.ou_active_market === stats.symbol })} />
                                                    {localize('Auto-Trade')}
                                                </div>
                                            </div>
                                            
                                            <div className="box-stats">
                                                <div className="bar-chart">
                                                    <div className="bar under-bar" style={{ width: `${Math.max(stats.underPercent, 5)}%` }}>
                                                        <span>U {stats.underPercent.toFixed(1)}%</span>
                                                    </div>
                                                    <div className="bar over-bar" style={{ width: `${Math.max(stats.overPercent, 5)}%` }}>
                                                        <span>O {stats.overPercent.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <button 
                                                className={classNames('toggle-btn', { active: dollarmine.ou_is_auto_trading && dollarmine.ou_active_market === stats.symbol })}
                                                onClick={() => {
                                                    if (dollarmine.ou_is_auto_trading && dollarmine.ou_active_market === stats.symbol) {
                                                        dollarmine.ou_is_auto_trading = false;
                                                        dollarmine.ou_active_market = null;
                                                    } else {
                                                        dollarmine.ou_active_market = stats.symbol;
                                                        dollarmine.ou_is_auto_trading = true;
                                                    }
                                                }}
                                            >
                                                {dollarmine.ou_is_auto_trading && dollarmine.ou_active_market === stats.symbol ? 'Stop O/U' : 'Enable O/U'}
                                            </button>
                                        </div>

                                        {/* Even/Odd Strategy Box */}
                                        <div className="strategy-box">
                                            <div className="box-header">
                                                <h3>Even/Odd</h3>
                                                <div className="status">
                                                    <span className={classNames('dot', { active: dollarmine.eo_is_auto_trading && dollarmine.eo_active_market === stats.symbol })} />
                                                    {localize('Auto-Trade')}
                                                </div>
                                            </div>
                                            
                                            <div className="box-stats">
                                                <div className="bar-chart">
                                                    <div className="bar even-bar" style={{ width: `${Math.max(stats.evenPercent, 5)}%` }}>
                                                        <span>E {stats.evenPercent.toFixed(1)}%</span>
                                                    </div>
                                                    <div className="bar odd-bar" style={{ width: `${Math.max(stats.oddPercent, 5)}%` }}>
                                                        <span>O {stats.oddPercent.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <button 
                                                className={classNames('toggle-btn', { active: dollarmine.eo_is_auto_trading && dollarmine.eo_active_market === stats.symbol })}
                                                onClick={() => {
                                                    if (dollarmine.eo_is_auto_trading && dollarmine.eo_active_market === stats.symbol) {
                                                        dollarmine.eo_is_auto_trading = false;
                                                        dollarmine.eo_active_market = null;
                                                    } else {
                                                        dollarmine.eo_active_market = stats.symbol;
                                                        dollarmine.eo_is_auto_trading = true;
                                                    }
                                                }}
                                            >
                                                {dollarmine.eo_is_auto_trading && dollarmine.eo_active_market === stats.symbol ? 'Stop E/O' : 'Enable E/O'}
                                            </button>
                                        </div>

                                        {/* Differs Strategy Box */}
                                        <div className="strategy-box">
                                            <div className="box-header">
                                                <h3>Differs</h3>
                                                <div className="status">
                                                    <span className={classNames('dot', { active: dollarmine.diff_is_auto_trading && dollarmine.diff_active_market === stats.symbol })} />
                                                    {localize('Auto-Trade')}
                                                </div>
                                            </div>
                                            
                                            <div className="box-stats diff-stats">
                                                {stats.digitFrequencies.map((freq, digit) => (
                                                    <div key={digit} className={classNames('freq-pill', { 
                                                        active: dollarmine.diff_prediction === digit,
                                                        constant: freq > 0 && freq < 10
                                                    })}>
                                                        {digit}: {Math.round(freq)}%
                                                    </div>
                                                ))}
                                            </div>

                                            <button 
                                                className={classNames('toggle-btn', { active: dollarmine.diff_is_auto_trading && dollarmine.diff_active_market === stats.symbol })}
                                                onClick={() => {
                                                    if (dollarmine.diff_is_auto_trading && dollarmine.diff_active_market === stats.symbol) {
                                                        dollarmine.diff_is_auto_trading = false;
                                                        dollarmine.diff_active_market = null;
                                                    } else {
                                                        dollarmine.diff_active_market = stats.symbol;
                                                        dollarmine.diff_is_auto_trading = true;
                                                    }
                                                }}
                                            >
                                                {dollarmine.diff_is_auto_trading && dollarmine.diff_active_market === stats.symbol ? 'Stop Differs' : 'Enable Differs'}
                                            </button>
                                        </div>

                                    </div>
                                </div>
                            );
                        })()
                    )}

                    {/* Trade Log Panel */}
                    <div className="dm-card log-panel">
                        <div className="log-header">
                            <h3>{localize('Trade Log')}</h3>
                        </div>
                        <div className="log-content">
                            {dollarmine.trade_log.length === 0 ? (
                                <p className="no-trades">{localize('No trades executed yet.')}</p>
                            ) : (
                                <table className="log-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Strategy</th>
                                            <th>Market</th>
                                            <th>Result</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dollarmine.trade_log.map((log, i) => (
                                            <tr key={i}>
                                                <td>{log.time}</td>
                                                <td>{log.strategy.replace('_', ' ')}</td>
                                                <td>{log.market.replace('R_', 'V')}</td>
                                                <td className={log.result === 'WIN' ? 'positive' : 'negative'}>
                                                    {log.result}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Dollarmine;
