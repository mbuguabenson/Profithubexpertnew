import React, { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { tickSubscriber, SignalWithSymbol, EngineState } from './engine/TickSubscriber';
import { SignalCard } from './components/SignalCard';
import { AnalysisResult } from './engine/SignalEngine';
import './signals.scss';

import { api_base } from '@/external/bot-skeleton/services/api/api-base';

const Signals = observer(() => {
    const [market, setMarket] = useState('ALL');
    const [strategyFilter, setStrategyFilter] = useState('ALL');
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [standard, setStandard] = useState<SignalWithSymbol[]>([]);
    const [pro, setPro] = useState<SignalWithSymbol[]>([]);
    const [superSignals, setSuperSignals] = useState<SignalWithSymbol[]>([]);
    const [availableMarkets, setAvailableMarkets] = useState<{value: string, label: string}[]>([
        { value: 'ALL', label: 'All Markets (Multi-Scan)' },
        { value: 'R_100', label: 'Volatility 100 Index' }
    ]);

    useEffect(() => {
        if (api_base.active_symbols && api_base.active_symbols.length > 0) {
            const symbols = api_base.active_symbols
                .filter((s: any) => {
                    if (!s.symbol && !s.underlying_symbol) return false;
                    const sym = (s.symbol || s.underlying_symbol).toUpperCase();
                    if (sym.includes('BOOM') || sym.includes('CRASH')) return false;
                    if (sym.includes('1HZ15V') || sym.includes('1HZ30V') || sym.includes('1HZ90V')) return false;
                    return sym.includes('1HZ') || sym.startsWith('R_') || sym.includes('JD') || sym.includes('JUMP');
                })
                .map((s: any) => ({
                    value: s.symbol || s.underlying_symbol,
                    label: s.display_name || s.symbol || s.underlying_symbol
                }));
            
            if (symbols.length > 0) {
                setAvailableMarkets([
                    { value: 'ALL', label: 'All Markets (Multi-Scan)' },
                    ...symbols
                ]);
            }
        }
    }, [api_base.active_symbols]);

    useEffect(() => {
        const handleState = (state: EngineState) => {
            setAnalysis(state.analysis);
            setStandard(state.standard.filter(s => s.status !== 'NEUTRAL').slice(0, 50));
            setPro(state.pro.filter(s => s.status !== 'NEUTRAL').slice(0, 50));
            setSuperSignals(state.super.slice(0, 50));
        };

        tickSubscriber.subscribe(handleState);
        tickSubscriber.startStreaming(market);

        return () => {
            tickSubscriber.unsubscribe(handleState);
            tickSubscriber.stopStreaming();
        };
    }, [market]);

    const handleMarketChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setMarket(e.target.value);
    };

    const filterSignal = (s: SignalWithSymbol) => {
        if (strategyFilter === 'ALL') return true;
        return s.type === strategyFilter;
    };

    const filteredSuper = useMemo(() => superSignals.filter(filterSignal), [superSignals, strategyFilter]);
    const filteredPro = useMemo(() => pro.filter(filterSignal), [pro, strategyFilter]);
    const filteredStandard = useMemo(() => standard.filter(filterSignal), [standard, strategyFilter]);

    return (
        <div className="signals-container">
            <div className="signals-header">
                <div className="header-text-glow">
                    <h2>Premium AI Signals</h2>
                    <p>Next-Generation Predictive Analytics & Trade Intelligence</p>
                </div>
                
                <div className="signals-controls-group" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="market-selector">
                        <label>Market:</label>
                        <div className="select-wrapper">
                            <select value={market} onChange={handleMarketChange}>
                                {availableMarkets.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="market-selector">
                        <label>Strategy Filter:</label>
                        <div className="select-wrapper">
                            <select value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)}>
                                <option value="ALL">All Strategies</option>
                                <option value="even_odd">Even / Odd</option>
                                <option value="over_under">Over / Under</option>
                                <option value="matches">Matches</option>
                                <option value="differs">Differs</option>
                                <option value="rise_fall">Rise / Fall</option>
                                <option value="pro_even_odd">Pro Even / Odd</option>
                                <option value="pro_over_under">Pro Over / Under</option>
                                <option value="pro_differs">Pro Differs</option>
                                <option value="under_7">Under 7</option>
                                <option value="over_2">Over 2</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {analysis && (
                <div className="analysis-stats">
                    <div className="stat-box">
                        <span className="stat-label">Total Ticks</span>
                        <span className="stat-value">{analysis.totalTicks}</span>
                    </div>
                    <div className="stat-box">
                        <span className="stat-label">Strongest Digit</span>
                        <span className="stat-value">{analysis.powerIndex.strongest}</span>
                    </div>
                    <div className="stat-box">
                        <span className="stat-label">Weakest Digit</span>
                        <span className="stat-value">{analysis.powerIndex.weakest}</span>
                    </div>
                    <div className="stat-box">
                        <span className="stat-label">Power Gap</span>
                        <span className="stat-value">{analysis.powerIndex.gap.toFixed(1)}%</span>
                    </div>
                    <div className="stat-box">
                        <span className="stat-label">Entropy</span>
                        <span className="stat-value">{analysis.entropy.toFixed(3)}</span>
                    </div>
                </div>
            )}

            <div className="signals-grid">
                <div className="signals-section">
                    <div className="section-title">
                        <h3>Super Signals</h3>
                        <span className="badge">LIVE MONITORING</span>
                    </div>
                    <div className="cards-container">
                        {filteredSuper.length > 0 ? (
                            filteredSuper.map((signal, idx) => (
                                <SignalCard key={`super-${idx}`} signal={signal} isSuper />
                            ))
                        ) : (
                            <div className="empty-state">No Super Signals matching active strategy filter.</div>
                        )}
                    </div>
                </div>

                <div className="signals-section">
                    <div className="section-title">
                        <h3>Pro Strategies</h3>
                        <span className="badge pro">ADVANCED</span>
                    </div>
                    <div className="cards-container">
                        {filteredPro.length > 0 ? (
                            filteredPro.map((signal, idx) => (
                                <SignalCard key={`pro-${idx}`} signal={signal} />
                            ))
                        ) : (
                            <div className="empty-state">No Pro Strategies matching active strategy filter.</div>
                        )}
                    </div>
                </div>

                <div className="signals-section">
                    <div className="section-title">
                        <h3>Standard Signals</h3>
                        <span className="badge std">BASIC</span>
                    </div>
                    <div className="cards-container">
                        {filteredStandard.length > 0 ? (
                            filteredStandard.map((signal, idx) => (
                                <SignalCard key={`std-${idx}`} signal={signal} />
                            ))
                        ) : (
                            <div className="empty-state">No Standard Signals matching active strategy filter.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Signals;
