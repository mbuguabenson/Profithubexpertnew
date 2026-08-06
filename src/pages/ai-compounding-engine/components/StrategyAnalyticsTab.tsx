import React, { useState } from 'react';
import { SymbolMarketData } from '../hooks/useCompoundingWS';

interface StrategyAnalyticsTabProps {
    activeMarketData?: SymbolMarketData;
}

export const StrategyAnalyticsTab: React.FC<StrategyAnalyticsTabProps> = ({
    activeMarketData,
}) => {
    const [tickWindow, setTickWindow] = useState<number>(500);

    const ticks = activeMarketData?.ticks || [4, 7, 2, 9, 0, 5, 8, 3, 1, 6, 8, 2, 7, 4, 9, 5, 0, 3, 8, 2];
    const recent7 = ticks.slice(-7);

    // Compute digit frequencies (0-9)
    const counts = Array(10).fill(0);
    ticks.forEach((d) => counts[d]++);
    const total = Math.max(ticks.length, 1);

    let maxCount = -1;
    let minCount = 999999;
    let hottestDigit = 0;
    let coldestDigit = 0;

    counts.forEach((c, idx) => {
        if (c > maxCount) {
            maxCount = c;
            hottestDigit = idx;
        }
        if (c < minCount) {
            minCount = c;
            coldestDigit = idx;
        }
    });

    // Over / Under math (0-4 vs 5-9)
    const underCount = counts.slice(0, 5).reduce((a, b) => a + b, 0);
    const overCount = counts.slice(5, 10).reduce((a, b) => a + b, 0);
    const underPct = parseFloat(((underCount / total) * 100).toFixed(1));
    const overPct = parseFloat(((overCount / total) * 100).toFixed(1));

    // Even / Odd math
    const evenCount = counts.filter((_, idx) => idx % 2 === 0).reduce((a, b) => a + b, 0);
    const oddCount = total - evenCount;
    const evenPct = parseFloat(((evenCount / total) * 100).toFixed(1));
    const oddPct = parseFloat(((oddCount / total) * 100).toFixed(1));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Timeframe Selector & Active Symbol Bar */}
            <div className="ace-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.1rem' }}>
                        Statistical Digit & Strategy Analytics — {activeMarketData?.displayName || 'Volatility 100 (1s)'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                        Real-time Statistical Frequency & Distribution Engine
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[60, 120, 200, 500, 1000].map((w) => (
                        <button
                            key={w}
                            className={`ace-btn ${tickWindow === w ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setTickWindow(w)}
                        >
                            {w} Ticks
                        </button>
                    ))}
                </div>
            </div>

            {/* Recent 7 Digits Cards */}
            <div className="ace-card">
                <div className="ace-card-title">Recent 7 Ticks Sequence</div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {recent7.map((d, i) => (
                        <div
                            key={i}
                            style={{
                                flex: 1,
                                textAlign: 'center',
                                padding: '0.75rem',
                                borderRadius: '12px',
                                background: d >= 5 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                border: d >= 5 ? '1px solid #10b981' : '1px solid #3b82f6',
                                fontWeight: 800,
                                fontSize: '1.4rem',
                                color: d >= 5 ? '#10b981' : '#3b82f6',
                            }}
                        >
                            {d}
                        </div>
                    ))}
                </div>
            </div>

            {/* Digit Frequency Grid (0–9) */}
            <div className="ace-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>Digit Distribution (0 – 9)</h4>
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        Hottest: <strong style={{ color: '#10b981' }}>{hottestDigit}</strong> | Coldest: <strong style={{ color: '#ef4444' }}>{coldestDigit}</strong>
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '0.5rem' }}>
                    {counts.map((cnt, d) => {
                        const pct = parseFloat(((cnt / total) * 100).toFixed(1));
                        const isHot = d === hottestDigit;
                        const isCold = d === coldestDigit;

                        return (
                            <div
                                key={d}
                                className={`digit-card ${isHot ? 'hot' : isCold ? 'cold' : ''}`}
                            >
                                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>DIGIT</div>
                                <div style={{ fontSize: '1.5rem', margin: '0.2rem 0' }}>{d}</div>
                                <div style={{ fontSize: '0.85rem' }}>{pct}%</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Over / Under Engine Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="ace-card">
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#10b981' }}>Under Dominance (Digits 0–4)</h4>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>{underPct}%</div>
                    <div className="ace-progress-bar">
                        <div
                            className={`ace-progress-fill ${underPct >= 60 ? 'gold' : underPct >= 55 ? 'green' : 'red'}`}
                            style={{ width: `${underPct}%` }}
                        />
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                        Suggested Entry: <strong>UNDER 7</strong> | Skip Count: <strong>1 Tick</strong>
                    </div>
                </div>

                <div className="ace-card">
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#3b82f6' }}>Over Dominance (Digits 5–9)</h4>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6' }}>{overPct}%</div>
                    <div className="ace-progress-bar">
                        <div
                            className={`ace-progress-fill ${overPct >= 60 ? 'gold' : overPct >= 55 ? 'green' : 'red'}`}
                            style={{ width: `${overPct}%` }}
                        />
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                        Suggested Entry: <strong>OVER 2</strong> | Skip Count: <strong>0 Ticks</strong>
                    </div>
                </div>
            </div>

            {/* Even / Odd Deviation Panel */}
            <div className="ace-card">
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Even / Odd Parity Analysis</h4>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                            <span>EVEN ({evenPct}%)</span>
                            <span>ODD ({oddPct}%)</span>
                        </div>
                        <div className="ace-progress-bar">
                            <div className="ace-progress-fill blue" style={{ width: `${evenPct}%` }} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: Math.abs(evenPct - oddPct) >= 7 ? '#10b981' : '#94a3b8' }}>
                        Deviation: {Math.abs(evenPct - oddPct).toFixed(1)}% {Math.abs(evenPct - oddPct) >= 7 ? '⚡ SIGNAL VALID' : '⌛ WAITING'}
                    </div>
                </div>
            </div>
        </div>
    );
};
