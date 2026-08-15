import { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { LabelList, Line, LineChart, ResponsiveContainer } from 'recharts';
import { useStore } from '@/hooks/useStore';
import DigitCircles from './components/digit-circles';
import TradingEngine from './components/trading-engine';
import './circles-analysis.scss';

const CirclesAnalysis = observer(() => {
    const { analysis, common, smart_auto } = useStore();
    const [view_strategy, setViewStrategy] = useState<'even_odd' | 'over_under' | 'differs' | 'matches' | 'rise_fall'>(
        'even_odd'
    );
    const [selected_digit, setSelectedDigit] = useState<number>(0);

    const { is_socket_opened, latency } = common;
    const {
        symbol,
        digit_stats,
        ticks,
        current_price,
        last_digit,
        setSymbol,
        percentages,
        markets,
        total_ticks,
        setTotalTicks,
    } = analysis;

    // --- LOGIC: Frequency Ranks ---
    const sortedStats = useMemo(() => [...digit_stats].sort((a, b) => b.count - a.count), [digit_stats]);
    const statsMap = useMemo(() => {
        const most = sortedStats[0]?.digit ?? 0;
        const second = sortedStats[1]?.digit ?? 1;
        const least = [...sortedStats].reverse().find(s => s.count > 0)?.digit ?? sortedStats[9]?.digit ?? 9;
        return { most, second, least };
    }, [sortedStats]);

    // --- LOGIC: Highest Digits by Segment ---
    const highestEven = useMemo(
        () => [...digit_stats].filter(s => s.digit % 2 === 0).sort((a, b) => b.count - a.count)[0]?.digit ?? 0,
        [digit_stats]
    );
    const highestOdd = useMemo(
        () => [...digit_stats].filter(s => s.digit % 2 !== 0).sort((a, b) => b.count - a.count)[0]?.digit ?? 1,
        [digit_stats]
    );
    const highestOver = useMemo(
        () => [...digit_stats].filter(s => s.digit >= 5).sort((a, b) => b.count - a.count)[0]?.digit ?? 7,
        [digit_stats]
    );
    const highestUnder = useMemo(
        () => [...digit_stats].filter(s => s.digit < 5).sort((a, b) => b.count - a.count)[0]?.digit ?? 2,
        [digit_stats]
    );

    // --- LOGIC: Signals & Predictions ---
    const signalData = useMemo(() => {
        let prediction = '';
        let confidence = 0;
        let status = 'SCANNING';
        let reason = 'Analyzing real-time frequency distribution...';

        if (view_strategy === 'even_odd') {
            const even = percentages.even;
            const odd = percentages.odd;
            prediction = even > odd ? 'EVEN' : 'ODD';
            confidence = Math.abs(even - odd) + 50;
            if (confidence > 62) status = 'STRONG SIGNAL';
            else status = 'WAITING';
            reason = `Even/Odd distribution deviating from 50/50 mean (${Math.max(even, odd).toFixed(1)}%).`;
        } else if (view_strategy === 'over_under') {
            const over = percentages.over;
            const under = percentages.under;
            prediction = over > under ? 'OVER' : 'UNDER';
            confidence = Math.abs(over - under) + 50;
            status = confidence > 62 ? 'STRONG SIGNAL' : 'WAITING';
            reason = `Market depth leaning towards ${prediction} zone. Ratio: ${Math.max(over, under).toFixed(0)}%.`;
        } else if (view_strategy === 'differs') {
            prediction = `Digit ${statsMap.least}`;
            confidence = 100 - (digit_stats[statsMap.least]?.percentage || 0);
            status = 'SAFE ENTRY';
            reason = `Digit ${statsMap.least} has lowest historical frequency (${(digit_stats[statsMap.least]?.percentage || 0).toFixed(1)}%).`;
        } else if (view_strategy === 'matches') {
            prediction = `Digit ${statsMap.most}`;
            confidence = (digit_stats[statsMap.most]?.percentage || 0) * 5;
            status = 'SCANNING MATCH';
            reason = `Targeting peak frequency Digit ${statsMap.most} for repetition cluster.`;
        } else if (view_strategy === 'rise_fall') {
            const rise = percentages.rise;
            const fall = percentages.fall;
            prediction = rise > fall ? 'RISE' : 'FALL';
            confidence = Math.abs(rise - fall) + 50;
            status = confidence > 60 ? 'MOMENTUM UP' : 'WAITING';
            reason = `Tick velocity favoring ${prediction} trajectory.`;
        }

        return { prediction, confidence: Math.min(confidence, 99), status, reason };
    }, [percentages, digit_stats, statsMap, view_strategy]);

    // --- LOGIC: Chart Data & History ---
    const chartData = useMemo(() => ticks.slice(-15).map((val, idx) => ({ id: idx, value: val })), [ticks]);
    const last60History = useMemo(() => {
        const lastTicks = ticks.slice(-60);
        if (view_strategy === 'even_odd') return lastTicks.map(d => (d % 2 === 0 ? 'E' : 'O'));
        if (view_strategy === 'over_under') return lastTicks.map(d => (d >= 5 ? 'O' : 'U'));
        return lastTicks.map(d => String(d));
    }, [ticks, view_strategy]);

    const currentStreak = useMemo(() => {
        if (ticks.length === 0) return { count: 0, val: '' };
        let count = 0;
        let lastVal = '';
        if (view_strategy === 'even_odd') {
            lastVal = ticks[ticks.length - 1] % 2 === 0 ? 'EVEN' : 'ODD';
            for (let i = ticks.length - 1; i >= 0; i--) {
                if ((ticks[i] % 2 === 0 ? 'EVEN' : 'ODD') === lastVal) count++;
                else break;
            }
        } else if (view_strategy === 'over_under') {
            lastVal = ticks[ticks.length - 1] >= 5 ? 'OVER' : 'UNDER';
            for (let i = ticks.length - 1; i >= 0; i--) {
                if ((ticks[i] >= 5 ? 'OVER' : 'UNDER') === lastVal) count++;
                else break;
            }
        }
        return { count, val: lastVal };
    }, [ticks, view_strategy]);

    const handleSelectDigit = (digit: number) => {
        setSelectedDigit(digit);
        const configKey = `${view_strategy}_config` as keyof typeof smart_auto;
        if (smart_auto[configKey]) {
            smart_auto.updateConfig(view_strategy, 'prediction' as any, digit);
            smart_auto.updateConfig(view_strategy, 'manual_prediction' as any, digit);
        }
    };

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
                        <label>TICKS DEPTH</label>
                        <input
                            type='number'
                            value={total_ticks}
                            onChange={e => setTotalTicks(parseInt(e.target.value) || 1000)}
                            className='depth-input num'
                        />
                    </div>
                    <div className='metric-card'>
                        <label>SPOT PRICE</label>
                        <div className='price-val num'>{current_price || '0.000'}</div>
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

            {/* 3. 10-DIGIT RADIAL SPECTRAL DECK */}
            <div className='radial-spectrum-container'>
                <DigitCircles onSelectDigit={handleSelectDigit} selectedDigit={selected_digit} />
            </div>

            {/* 4. MAIN WORKSPACE GRID */}
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

                    {/* Trajectory & 60-Tick Pattern Strip */}
                    <div className='trajectory-panel-row'>
                        <div className='glass-card velocity-chart-card'>
                            <div className='card-header'>
                                <h4>Tick Velocity (Last 15)</h4>
                            </div>
                            <div className='chart-wrapper'>
                                <ResponsiveContainer width='100%' height={130}>
                                    <LineChart data={chartData}>
                                        <Line
                                            type='monotone'
                                            dataKey='value'
                                            stroke='#38bdf8'
                                            strokeWidth={3}
                                            dot={{ r: 3, fill: '#38bdf8', stroke: '#fff' }}
                                            animationDuration={300}
                                        >
                                            <LabelList
                                                dataKey='value'
                                                position='top'
                                                offset={8}
                                                className='num'
                                                style={{ fill: '#e2e8f0', fontSize: '10px', fontWeight: 700 }}
                                            />
                                        </Line>
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

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
                    </div>
                </div>

                {/* RIGHT: TRADING ENGINE CONSOLE */}
                <div className='engine-side'>
                    <TradingEngine />
                </div>
            </div>
        </div>
    );
});

export default CirclesAnalysis;
