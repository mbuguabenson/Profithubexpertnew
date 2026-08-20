import { useMemo, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import TradingEngine from './components/trading-engine';
import DigitDistribution from './components/DigitDistribution';
import LastDigitsLineChart from './components/LastDigitsLineChart';
import Last20DigitsGrid from './components/Last20DigitsGrid';
import Hub360LoadingScreen from '@/components/loading/Hub360LoadingScreen';
import './circles-analysis.scss';

const CirclesAnalysis = observer(() => {
    const { analysis, common } = useStore();
    const [view_strategy, setViewStrategy] = useState<'even_odd' | 'over_under' | 'differs' | 'matches' | 'rise_fall'>(
        'even_odd'
    );

    const { is_socket_opened, latency } = common;
    const {
        symbol,
        digit_stats,
        ticks,
        current_price,
        last_digit,
        setSymbol,
        percentages,
        even_odd_history,
        over_under_history,
        markets,
    } = analysis;

    // Safely retrieve extended history if available
    const differs_history = (analysis as any).differs_history || [];
    const matches_history = (analysis as any).matches_history || [];
    const rise_fall_history = (analysis as any).rise_fall_history || [];

    // Highest probability calculations
    const highestEven = useMemo(() => {
        const evens = digit_stats.filter(s => s.digit % 2 === 0);
        return evens.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), evens[0])?.digit ?? 0;
    }, [digit_stats]);

    const highestOdd = useMemo(() => {
        const odds = digit_stats.filter(s => s.digit % 2 !== 0);
        return odds.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), odds[0])?.digit ?? 1;
    }, [digit_stats]);

    const highestOver = useMemo(() => {
        const overs = digit_stats.filter(s => s.digit > 4);
        return overs.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), overs[0])?.digit ?? 9;
    }, [digit_stats]);

    const highestUnder = useMemo(() => {
        const unders = digit_stats.filter(s => s.digit <= 4);
        return unders.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), unders[0])?.digit ?? 0;
    }, [digit_stats]);

    // Live Signal Intelligence
    const signalData = useMemo(() => {
        const { even, odd, over, under } = percentages;
        let prediction = 'EVEN';
        let confidence = 50;
        let status = 'SEARCHING';
        let reason = 'Analyzing real-time frequency distribution...';

        if (view_strategy === 'even_odd') {
            if (even > 58) {
                prediction = 'EVEN';
                confidence = Math.min(even + 12, 94);
                status = 'STRONG TRADE';
                reason = `Even bias dominates at ${even.toFixed(1)}%. High statistical probability for Even.`;
            } else if (odd > 58) {
                prediction = 'ODD';
                confidence = Math.min(odd + 12, 94);
                status = 'STRONG TRADE';
                reason = `Odd bias dominates at ${odd.toFixed(1)}%. High statistical probability for Odd.`;
            } else {
                prediction = even > odd ? 'EVEN' : 'ODD';
                confidence = Math.max(even, odd);
                status = 'WEAK BIAS';
                reason = `Even/Odd distribution balanced (${Math.max(even, odd).toFixed(1)}%). Proceed with caution.`;
            }
        } else if (view_strategy === 'over_under') {
            if (over > 58) {
                prediction = 'OVER 4';
                confidence = Math.min(over + 10, 92);
                status = 'STRONG TRADE';
                reason = `Over threshold density at ${over.toFixed(1)}%. Upper digits trending heavily.`;
            } else if (under > 58) {
                prediction = 'UNDER 5';
                confidence = Math.min(under + 10, 92);
                status = 'STRONG TRADE';
                reason = `Under threshold density at ${under.toFixed(1)}%. Lower digits trending heavily.`;
            } else {
                prediction = over > under ? 'OVER 4' : 'UNDER 5';
                confidence = Math.max(over, under);
                status = 'WEAK BIAS';
                reason = `Over/Under spectrum near equilibrium. Monitor trajectory.`;
            }
        } else if (view_strategy === 'differs') {
            const coldDigit = digit_stats.reduce((prev, curr) => (curr.count < prev.count ? curr : prev), digit_stats[0]);
            prediction = `DIFFERS ${coldDigit?.digit ?? 0}`;
            confidence = Math.min(100 - (coldDigit?.percentage ?? 10) + 15, 96);
            status = 'HIGH CONFIDENCE';
            reason = `Digit ${coldDigit?.digit} has lowest occurrence (${coldDigit?.percentage.toFixed(1)}%). Ideal Differs target.`;
        } else if (view_strategy === 'matches') {
            const hotDigit = digit_stats.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), digit_stats[0]);
            prediction = `MATCHES ${hotDigit?.digit ?? 0}`;
            confidence = Math.min((hotDigit?.percentage ?? 10) * 3.2, 88);
            status = 'SPECULATIVE';
            reason = `Digit ${hotDigit?.digit} is highest frequency (${hotDigit?.percentage.toFixed(1)}%). Repetition potential.`;
        } else {
            const last2 = ticks.slice(-2);
            if (last2.length === 2) {
                const q1 = (last2[1] as any)?.quote ?? (last2[1] as any) ?? 0;
                const q0 = (last2[0] as any)?.quote ?? (last2[0] as any) ?? 0;
                const diff = q1 - q0;
                prediction = diff >= 0 ? 'RISE' : 'FALL';
                confidence = 70;
                status = 'MOMENTUM';
                reason = `Recent tick delta is ${diff > 0 ? '+' : ''}${diff.toFixed(4)}. Follow short-term momentum.`;
            }
        }

        return { prediction, confidence, status, reason };
    }, [percentages, view_strategy, digit_stats, ticks]);

    // 60-Tick Pattern Strip Data
    const last60History = useMemo(() => {
        let historySource = even_odd_history;
        if (view_strategy === 'over_under') historySource = over_under_history;
        else if (view_strategy === 'differs') historySource = differs_history;
        else if (view_strategy === 'matches') historySource = matches_history;
        else if (view_strategy === 'rise_fall') historySource = rise_fall_history;

        return (historySource || []).slice(-60).map((item: any) => item?.type ?? item);
    }, [
        even_odd_history,
        over_under_history,
        differs_history,
        matches_history,
        rise_fall_history,
        view_strategy,
    ]);

    // Current Streak Tracker
    const currentStreak = useMemo(() => {
        if (last60History.length === 0) return { val: '-', count: 0 };
        const lastVal = last60History[last60History.length - 1];
        let count = 0;
        for (let i = last60History.length - 1; i >= 0; i--) {
            if (last60History[i] === lastVal) count++;
            else break;
        }
        return { val: lastVal, count };
    }, [last60History]);

    if (!is_socket_opened && ticks.length === 0) {
        return (
            <div className='circles-analysis-hud'>
                <Hub360LoadingScreen
                    title="Circles Analysis 360"
                    subtitle="Connecting to Deriv WebSocket live tick stream..."
                />
            </div>
        );
    }

    return (
        <div className='circles-analysis-hud'>
            {/* 1. TOP COMMAND HEADER */}
            <div className='cyber-hud-header'>
                <div className='header-left'>
                    <div className='brand-badge'>
                        <div className='pulse-radar' />
                        <span className='brand-text'>CIRCLES RADIAL ENGINE</span>
                    </div>
                    <div className='market-control'>
                        <label>ACTIVE MARKET</label>
                        <select value={symbol} onChange={e => setSymbol(e.target.value)} className='market-select'>
                            {markets.map(g => (
                                <optgroup key={g.group} label={g.group}>
                                    {g.items.map(item => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                </div>

                <div className='header-metrics'>
                    <div className='metric-card'>
                        <label>SPOT PRICE</label>
                        <span className='price-val num'>{current_price || '0.0000'}</span>
                    </div>
                    <div className='metric-card live-digit-card'>
                        <label>LIVE DIGIT</label>
                        <div
                            className={classNames('digit-beacon num', {
                                even: last_digit !== null && last_digit % 2 === 0,
                                odd: last_digit !== null && last_digit % 2 !== 0,
                            })}
                        >
                            {last_digit ?? '-'}
                        </div>
                    </div>
                    <div className='metric-card socket-status'>
                        <label>NETWORK</label>
                        <div className={classNames('status-indicator', { online: is_socket_opened })}>
                            <span className='dot' />
                            <span>{is_socket_opened ? 'ONLINE' : 'CONNECTING'}</span>
                            <span className='latency num'>{latency}ms</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. STRATEGY NAVIGATION TABS */}
            <div className='strategy-switcher-bar'>
                {[
                    { id: 'even_odd', label: '⚖️ EVEN / ODD', desc: '50/50 Deviation' },
                    { id: 'over_under', label: '📊 OVER / UNDER', desc: 'Threshold Drift' },
                    { id: 'differs', label: '🎯 DIFFERS', desc: 'Least Frequent' },
                    { id: 'matches', label: '🎲 MATCHES', desc: 'Repetition Cluster' },
                    { id: 'rise_fall', label: '📈 RISE / FALL', desc: 'Tick Momentum' },
                ].map(strat => (
                    <button
                        key={strat.id}
                        className={classNames('strat-tab-btn', { active: view_strategy === strat.id })}
                        onClick={() => setViewStrategy(strat.id as any)}
                    >
                        <span className='label'>{strat.label}</span>
                        <span className='desc'>{strat.desc}</span>
                    </button>
                ))}
            </div>

            {/* 3. MAIN WORKSPACE GRID */}
            <div className='workspace-dual-grid'>
                {/* LEFT: ANALYTICS & INSIGHTS */}
                <div className='analytics-side'>
                    {/* Signal Intelligence Radar */}
                    <div className='glass-card signal-radar-card'>
                        <div className='card-header'>
                            <h4>Algorithmic Signal Radar</h4>
                            <span className={classNames('status-pill', signalData.status.toLowerCase().replace(' ', '-'))}>
                                {signalData.status}
                            </span>
                        </div>
                        <div className='signal-body'>
                            <div className='prediction-display'>
                                <span className='sub-label'>TARGET PREDICTION</span>
                                <span className='main-prediction num'>{signalData.prediction}</span>
                            </div>
                            <div className='confidence-gauge'>
                                <div className='gauge-label-row'>
                                    <span>AI CONFIDENCE</span>
                                    <span className='pct num'>{signalData.confidence.toFixed(1)}%</span>
                                </div>
                                <div className='gauge-track'>
                                    <div
                                        className='gauge-fill'
                                        style={{
                                            width: `${signalData.confidence}%`,
                                            background:
                                                signalData.confidence > 65
                                                    ? 'linear-gradient(90deg, #10b981, #06b6d4)'
                                                    : 'linear-gradient(90deg, #f59e0b, #6366f1)',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className='signal-rationale'>
                            <span className='lbl'>Logic Rationale:</span> {signalData.reason}
                        </div>
                    </div>

                    {/* Dual Distribution Split */}
                    <div className='analytics-deck-grid'>
                        <div className='glass-card mini-intel'>
                            <label>EVEN / ODD SPECTRUM</label>
                            <div className='split-bar'>
                                <div className='segment even' style={{ width: `${percentages.even}%` }}>
                                    <span>E {percentages.even.toFixed(0)}%</span>
                                </div>
                                <div className='segment odd' style={{ width: `${percentages.odd}%` }}>
                                    <span>O {percentages.odd.toFixed(0)}%</span>
                                </div>
                            </div>
                            <div className='hot-tags'>
                                <span>HOT EVEN: <strong className='ev num'>{highestEven}</strong></span>
                                <span>HOT ODD: <strong className='od num'>{highestOdd}</strong></span>
                            </div>
                        </div>

                        <div className='glass-card mini-intel'>
                            <label>OVER / UNDER DEPTH</label>
                            <div className='split-bar'>
                                <div className='segment over' style={{ width: `${percentages.over}%` }}>
                                    <span>OV {percentages.over.toFixed(0)}%</span>
                                </div>
                                <div className='segment under' style={{ width: `${percentages.under}%` }}>
                                    <span>UN {percentages.under.toFixed(0)}%</span>
                                </div>
                            </div>
                            <div className='hot-tags'>
                                <span>HOT OVER: <strong className='ov num'>{highestOver}</strong></span>
                                <span>HOT UNDER: <strong className='un num'>{highestUnder}</strong></span>
                            </div>
                        </div>
                    </div>

                    {/* 60-Tick Pattern Strip */}
                    <div className='glass-card pattern-strip-card'>
                        <div className='card-header'>
                            <h4>60-Tick Pattern Strip</h4>
                            {currentStreak.count > 0 && (
                                <span className='streak-badge num'>
                                    {currentStreak.count}x {currentStreak.val}
                                </span>
                            )}
                        </div>
                        <div className='strip-history-flow'>
                            {last60History.map((code, i) => (
                                <div
                                    key={i}
                                    className={classNames('flow-pill num', {
                                        'is-even': code === 'E',
                                        'is-odd': code === 'O',
                                        'is-over': code === 'O',
                                        'is-under': code === 'U',
                                        'is-latest': i === last60History.length - 1,
                                    })}
                                >
                                    {code}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* TRADING ENGINE CONSOLE */}
                    <div className="engine-card-wrapper">
                        <TradingEngine />
                    </div>
                </div>

                {/* RIGHT: DYNAMIC VISUALIZATIONS */}
                <div className='visualizations-side'>
                    <DigitDistribution digit_stats={digit_stats} last_digit={last_digit} />
                    <LastDigitsLineChart ticks={ticks} />
                    <Last20DigitsGrid ticks={ticks} />
                </div>
            </div>
        </div>
    );
});

export default CirclesAnalysis;
