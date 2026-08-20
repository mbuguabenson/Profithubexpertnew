import React, { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { tickSubscriber, SignalWithSymbol, EngineState } from './engine/TickSubscriber';
import { SignalCard } from './components/SignalCard';
import { AnalysisResult } from './engine/SignalEngine';
import { Sparkles, Globe, SlidersHorizontal, Activity, Flame, Shield, Layers } from 'lucide-react';
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
        <div className="signals-tab-wrapper">
            <div className="signals-main-container">

                {/* Top Control Bar Header */}
                <div className="signals-header-card">
                    <div className="header-brand-box">
                        <div className="badge-live-pulse">
                            <span className="pulse-dot" />
                            <span>REAL-TIME AI SIGNALS</span>
                        </div>
                        <h2 className="header-title">
                            Predictive <span className="title-highlight">Market Signals</span>
                        </h2>
                        <p className="header-sub">
                            Live tick algorithmic analysis & high-confidence trade recommendations
                        </p>
                    </div>

                    <div className="header-filters-row">
                        {/* Market Selector */}
                        <div className="soft-select-box">
                            <label className="select-lbl">
                                <Globe size={14} className="lbl-icon" /> Market Target
                            </label>

                            <div className="select-input-wrap">
                                <select value={market} onChange={handleMarketChange} className="soft-select">
                                    {availableMarkets.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Strategy Filter Selector */}
                        <div className="soft-select-box">
                            <label className="select-lbl">
                                <SlidersHorizontal size={14} className="lbl-icon" /> Strategy Type
                            </label>

                            <div className="select-input-wrap">
                                <select
                                    value={strategyFilter}
                                    onChange={e => setStrategyFilter(e.target.value)}
                                    className="soft-select"
                                >
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

                {/* Analysis Metrics Cards Row */}
                {analysis && (
                    <div className="signals-metrics-grid">
                        <div className="metric-soft-card">
                            <div className="metric-icon-orb text-cyan">
                                <Activity size={18} />
                            </div>
                            <div className="metric-body">
                                <span className="metric-lbl">Total Ticks</span>
                                <span className="metric-val">{analysis.totalTicks}</span>
                            </div>
                        </div>

                        <div className="metric-soft-card">
                            <div className="metric-icon-orb text-green">
                                <Flame size={18} />
                            </div>
                            <div className="metric-body">
                                <span className="metric-lbl">Strongest Digit</span>
                                <span className="metric-val text-green">{analysis.powerIndex.strongest}</span>
                            </div>
                        </div>

                        <div className="metric-soft-card">
                            <div className="metric-icon-orb text-red">
                                <Shield size={18} />
                            </div>
                            <div className="metric-body">
                                <span className="metric-lbl">Weakest Digit</span>
                                <span className="metric-val text-red">{analysis.powerIndex.weakest}</span>
                            </div>
                        </div>

                        <div className="metric-soft-card">
                            <div className="metric-icon-orb text-purple">
                                <Sparkles size={18} />
                            </div>
                            <div className="metric-body">
                                <span className="metric-lbl">Power Gap</span>
                                <span className="metric-val text-purple">{analysis.powerIndex.gap.toFixed(1)}%</span>
                            </div>
                        </div>

                        <div className="metric-soft-card">
                            <div className="metric-icon-orb text-amber">
                                <Layers size={18} />
                            </div>
                            <div className="metric-body">
                                <span className="metric-lbl">Entropy Index</span>
                                <span className="metric-val text-amber">{analysis.entropy.toFixed(3)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Signals Layout Grid (Super / Pro / Standard) */}
                <div className="signals-sections-grid">
                    {/* Super Signals */}
                    <div className="signals-col-section">
                        <div className="section-header-banner">
                            <div className="banner-title-box">
                                <Sparkles size={18} className="text-purple" />
                                <h3>Super Signals</h3>
                            </div>
                            <span className="pill-badge pill-badge--super">HIGH CONFIDENCE</span>
                        </div>

                        <div className="cards-stack">
                            {filteredSuper.length > 0 ? (
                                filteredSuper.map((signal, idx) => (
                                    <SignalCard key={`super-${idx}`} signal={signal} isSuper />
                                ))
                            ) : (
                                <div className="signals-empty-card">
                                    <span>No Super Signals available for this filter.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pro Strategies */}
                    <div className="signals-col-section">
                        <div className="section-header-banner">
                            <div className="banner-title-box">
                                <Zap size={18} className="text-cyan" />
                                <h3>Pro Strategies</h3>
                            </div>
                            <span className="pill-badge pill-badge--pro">ADVANCED</span>
                        </div>

                        <div className="cards-stack">
                            {filteredPro.length > 0 ? (
                                filteredPro.map((signal, idx) => (
                                    <SignalCard key={`pro-${idx}`} signal={signal} />
                                ))
                            ) : (
                                <div className="signals-empty-card">
                                    <span>No Pro Strategies available for this filter.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Standard Signals */}
                    <div className="signals-col-section">
                        <div className="section-header-banner">
                            <div className="banner-title-box">
                                <Activity size={18} className="text-green" />
                                <h3>Standard Signals</h3>
                            </div>
                            <span className="pill-badge pill-badge--std">ACTIVE</span>
                        </div>

                        <div className="cards-stack">
                            {filteredStandard.length > 0 ? (
                                filteredStandard.map((signal, idx) => (
                                    <SignalCard key={`std-${idx}`} signal={signal} />
                                ))
                            ) : (
                                <div className="signals-empty-card">
                                    <span>No Standard Signals available for this filter.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Signals;
