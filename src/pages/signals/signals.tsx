import React, { useEffect, useState, useMemo, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { tickSubscriber, SignalWithSymbol, EngineState } from './engine/TickSubscriber';
import { SignalCard } from './components/SignalCard';
import { AnalysisResult } from './engine/SignalEngine';
import { Sparkles, Globe, SlidersHorizontal, Activity, Zap } from 'lucide-react';
import './signals.scss';

import { api_base } from '@/external/bot-skeleton/services/api/api-base';

import { ALL_DERIV_MARKETS } from '@/constants/markets';

// Fallback markets when api_base.active_symbols hasn't loaded yet
const FALLBACK_MARKETS: { value: string; label: string }[] = [
    { value: 'ALL', label: 'All Markets (Multi-Scan)' },
    ...ALL_DERIV_MARKETS.map(m => ({ value: m.value, label: m.label })),
];

const Signals = observer(() => {
    const [market, setMarket] = useState('ALL');
    const [strategyFilter, setStrategyFilter] = useState('ALL');
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [standard, setStandard] = useState<SignalWithSymbol[]>([]);
    const [pro, setPro] = useState<SignalWithSymbol[]>([]);
    const [superSignals, setSuperSignals] = useState<SignalWithSymbol[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [availableMarkets, setAvailableMarkets] = useState<{ value: string; label: string }[]>(FALLBACK_MARKETS);
    const marketsLoadedRef = useRef(false);

    // Populate markets from api_base when active_symbols become available
    useEffect(() => {
        const tryLoadMarkets = () => {
            if (api_base.active_symbols && api_base.active_symbols.length > 0) {
                const symbols = api_base.active_symbols
                    .filter((s: any) => {
                        if (!s.symbol && !s.underlying_symbol) return false;
                        const sym = (s.symbol || s.underlying_symbol).toUpperCase();
                        if (sym.includes('BOOM') || sym.includes('CRASH')) return false;
                        return (
                            sym.includes('1HZ') || sym.startsWith('R_') || sym.includes('JD') || sym.includes('JUMP')
                        );
                    })
                    .map((s: any) => ({
                        value: s.symbol || s.underlying_symbol,
                        label: s.display_name || s.symbol || s.underlying_symbol,
                    }));

                if (symbols.length > 0) {
                    setAvailableMarkets([{ value: 'ALL', label: 'All Markets (Multi-Scan)' }, ...symbols]);
                    marketsLoadedRef.current = true;
                    return true;
                }
            }
            return false;
        };

        // Try immediately
        if (tryLoadMarkets()) return;

        // Retry every 2s for up to 20s if active_symbols aren't available yet
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (tryLoadMarkets() || attempts >= 10) {
                clearInterval(interval);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleState = (state: EngineState) => {
            setAnalysis(state.analysis);
            setStandard(state.standard.filter(s => s.status !== 'NEUTRAL').slice(0, 50));
            setPro(state.pro.filter(s => s.status !== 'NEUTRAL').slice(0, 50));
            setSuperSignals(state.super.slice(0, 50));

            // Mark as connected once we receive any data
            if (!isConnected && (state.analysis || state.standard.length > 0)) {
                setIsConnected(true);
            }
        };

        setIsConnected(false);
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
        <div className='signals-tab-wrapper'>
            <div className='signals-main-container'>
                {/* Top Control Bar Header */}
                <div className='signals-header-card'>
                    <div className='header-filters-row'>
                        {/* Market Selector */}
                        <div className='soft-select-box'>
                            <label className='select-lbl'>
                                <Globe size={13} className='lbl-icon' /> Market Target
                            </label>
                            <div className='select-input-wrap'>
                                <select value={market} onChange={handleMarketChange} className='soft-select'>
                                    {availableMarkets.map(m => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Strategy Filter Selector */}
                        <div className='soft-select-box'>
                            <label className='select-lbl'>
                                <SlidersHorizontal size={13} className='lbl-icon' /> Strategy Type
                            </label>
                            <div className='select-input-wrap'>
                                <select
                                    value={strategyFilter}
                                    onChange={e => setStrategyFilter(e.target.value)}
                                    className='soft-select'
                                >
                                    <option value='ALL'>All Strategies</option>
                                    <option value='even_odd'>Even / Odd</option>
                                    <option value='over_under'>Over / Under</option>
                                    <option value='matches'>Matches</option>
                                    <option value='differs'>Differs</option>
                                    <option value='rise_fall'>Rise / Fall</option>
                                    <option value='pro_even_odd'>Pro Even / Odd</option>
                                    <option value='pro_over_under'>Pro Over / Under</option>
                                    <option value='pro_differs'>Pro Differs</option>
                                    <option value='under_7'>Under 7</option>
                                    <option value='over_2'>Over 2</option>
                                </select>
                            </div>
                        </div>

                        <div className='signals-status-indicator'>
                            <span className={`pulse-dot${!isConnected ? ' connecting' : ''}`} />
                            <span className='status-text'>{isConnected ? 'LIVE FEED' : 'CONNECTING...'}</span>
                        </div>
                    </div>

                    {/* Single-Line Analysis Metrics Bar */}
                    <div className='signals-metrics-single-line'>
                        <div className='sig-metric-item'>
                            <span className='metric-label'>Total Ticks</span>
                            <span className='metric-value text-cyan'>{analysis?.totalTicks ?? 100}</span>
                        </div>
                        <div className='sig-metric-divider' />
                        <div className='sig-metric-item'>
                            <span className='metric-label'>Strongest Digit</span>
                            <span className='metric-value text-green'>{analysis?.powerIndex?.strongest ?? 3}</span>
                        </div>
                        <div className='sig-metric-divider' />
                        <div className='sig-metric-item'>
                            <span className='metric-label'>Weakest Digit</span>
                            <span className='metric-value text-red'>{analysis?.powerIndex?.weakest ?? 0}</span>
                        </div>
                        <div className='sig-metric-divider' />
                        <div className='sig-metric-item'>
                            <span className='metric-label'>Power Gap</span>
                            <span className='metric-value text-purple'>
                                {analysis?.powerIndex?.gap !== undefined
                                    ? `${analysis.powerIndex.gap.toFixed(1)}%`
                                    : '15.0%'}
                            </span>
                        </div>
                        <div className='sig-metric-divider' />
                        <div className='sig-metric-item'>
                            <span className='metric-label'>Entropy Index</span>
                            <span className='metric-value text-amber'>
                                {analysis?.entropy !== undefined ? analysis.entropy.toFixed(3) : '3.112'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Signals Layout Grid (Super / Pro / Standard) */}
                <div className='signals-sections-grid'>
                    {/* Super Signals */}
                    <div className='signals-col-section'>
                        <div className='section-header-banner'>
                            <div className='banner-title-box'>
                                <Sparkles size={16} className='text-purple' />
                                <h3>Super Signals</h3>
                            </div>
                            <span className='pill-badge pill-badge--super'>HIGH CONFIDENCE</span>
                        </div>

                        <div className='cards-grid-stack'>
                            {filteredSuper.length > 0 ? (
                                filteredSuper.map((signal, idx) => (
                                    <SignalCard key={`super-${idx}`} signal={signal} isSuper />
                                ))
                            ) : (
                                <div className='signals-empty-card'>
                                    <span>No Super Signals available.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pro Signals */}
                    <div className='signals-col-section'>
                        <div className='section-header-banner'>
                            <div className='banner-title-box'>
                                <Zap size={16} className='text-cyan' />
                                <h3>Pro Signals</h3>
                            </div>
                            <span className='pill-badge pill-badge--pro'>PRO ENGINE</span>
                        </div>

                        <div className='cards-grid-stack'>
                            {filteredPro.length > 0 ? (
                                filteredPro.map((signal, idx) => <SignalCard key={`pro-${idx}`} signal={signal} />)
                            ) : (
                                <div className='signals-empty-card'>
                                    <span>No Pro Signals available.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Standard Signals */}
                    <div className='signals-col-section'>
                        <div className='section-header-banner'>
                            <div className='banner-title-box'>
                                <Activity size={16} className='text-green' />
                                <h3>Standard Signals</h3>
                            </div>
                            <span className='pill-badge pill-badge--std'>ALGO DETECTED</span>
                        </div>

                        <div className='cards-grid-stack'>
                            {filteredStandard.length > 0 ? (
                                filteredStandard.map((signal, idx) => <SignalCard key={`std-${idx}`} signal={signal} />)
                            ) : (
                                <div className='signals-empty-card'>
                                    <span>No Standard Signals available.</span>
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
