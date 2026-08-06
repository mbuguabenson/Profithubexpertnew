import React, { useState } from 'react';

export const RecoveryEngineTab: React.FC = () => {
    const [subTab, setSubTab] = useState<'recovery' | 'hourly'>('recovery');
    const [safeStrategy, setSafeStrategy] = useState<string>('Over 1');
    const [consecutiveLossTrigger, setConsecutiveLossTrigger] = useState<number>(2);
    const [recoveryMarket, setRecoveryMarket] = useState<string>('1HZ100V');

    // Advanced Hourly state
    const [tradingHours, setTradingHours] = useState<string>('08:00 - 22:00');
    const [hourlyTarget, setHourlyTarget] = useState<number>(10.0);
    const [riskPct, setRiskPct] = useState<number>(2);
    const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState<number>(5);
    const [multiplierOver3, setMultiplierOver3] = useState<number>(1.5);
    const [multiplierOver2, setMultiplierOver2] = useState<number>(2.1);
    const [multiplierOver1, setMultiplierOver1] = useState<number>(3.1);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Inner Subtab Navigation */}
            <div className="ace-card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                    className={`ace-btn ${subTab === 'recovery' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSubTab('recovery')}
                >
                    🛡️ Safe Recovery Engine
                </button>
                <button
                    className={`ace-btn ${subTab === 'hourly' ? 'btn-accent' : 'btn-secondary'}`}
                    onClick={() => setSubTab('hourly')}
                >
                    ⏰ Advanced Hourly Engine
                </button>
            </div>

            {subTab === 'recovery' ? (
                <div className="ace-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Safe Strategy Recovery Parameters</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                        Triggers high-probability safe recovery strategies upon consecutive loss events.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>
                                Safe Recovery Strategy
                            </label>
                            <select
                                className="ace-input"
                                value={safeStrategy}
                                onChange={(e) => setSafeStrategy(e.target.value)}
                            >
                                <option value="Over 0">Over 0 (90% Win Probability)</option>
                                <option value="Over 1">Over 1 (80% Win Probability)</option>
                                <option value="Under 9">Under 9 (90% Win Probability)</option>
                                <option value="Under 8">Under 8 (80% Win Probability)</option>
                                <option value="Even">Even Parity</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>
                                Trigger Consecutive Losses
                            </label>
                            <input
                                type="number"
                                className="ace-input"
                                value={consecutiveLossTrigger}
                                onChange={(e) => setConsecutiveLossTrigger(parseInt(e.target.value, 10) || 1)}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>
                                Target Recovery Market
                            </label>
                            <select
                                className="ace-input"
                                value={recoveryMarket}
                                onChange={(e) => setRecoveryMarket(e.target.value)}
                            >
                                <option value="1HZ100V">Volatility 100 (1s) Index</option>
                                <option value="1HZ75V">Volatility 75 (1s) Index</option>
                                <option value="R_100">Volatility 100 Index</option>
                            </select>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="ace-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Advanced Hourly Engine Configuration</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                        Trades exclusively high-probability Over 1/2/3 and Under 6/7/8 digit barriers with custom recovery multipliers.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Trading Hours Window</label>
                            <input className="ace-input" value={tradingHours} onChange={(e) => setTradingHours(e.target.value)} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Hourly Target ($)</label>
                            <input
                                type="number"
                                className="ace-input"
                                value={hourlyTarget}
                                onChange={(e) => setHourlyTarget(parseFloat(e.target.value) || 0)}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Account Risk % (1–5%)</label>
                            <input
                                type="number"
                                className="ace-input"
                                value={riskPct}
                                onChange={(e) => setRiskPct(parseFloat(e.target.value) || 1)}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Max Consecutive Losses</label>
                            <input
                                type="number"
                                className="ace-input"
                                value={maxConsecutiveLosses}
                                onChange={(e) => setMaxConsecutiveLosses(parseInt(e.target.value, 10) || 1)}
                            />
                        </div>
                    </div>

                    <h4 style={{ margin: '0.5rem 0 0 0' }}>Editable Multipliers by Barrier</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Over 3 / Under 6 Multiplier</label>
                            <input
                                type="number"
                                step="0.1"
                                className="ace-input"
                                value={multiplierOver3}
                                onChange={(e) => setMultiplierOver3(parseFloat(e.target.value) || 1.5)}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Over 2 / Under 7 Multiplier</label>
                            <input
                                type="number"
                                step="0.1"
                                className="ace-input"
                                value={multiplierOver2}
                                onChange={(e) => setMultiplierOver2(parseFloat(e.target.value) || 2.1)}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Over 1 / Under 8 Multiplier</label>
                            <input
                                type="number"
                                step="0.1"
                                className="ace-input"
                                value={multiplierOver1}
                                onChange={(e) => setMultiplierOver1(parseFloat(e.target.value) || 3.1)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
