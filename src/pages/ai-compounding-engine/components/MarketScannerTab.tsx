import React, { useState } from 'react';
import { SymbolMarketData } from '../hooks/useCompoundingWS';

interface MarketScannerTabProps {
    marketsData: Record<string, SymbolMarketData>;
    activeSymbol: string;
    onSelectSymbol: (s: string) => void;
}

export const MarketScannerTab: React.FC<MarketScannerTabProps> = ({
    marketsData,
    activeSymbol,
    onSelectSymbol,
}) => {
    const [analyzeAll, setAnalyzeAll] = useState(true);

    const sortedMarkets = Object.values(marketsData).sort(
        (a, b) => b.probabilityScore - a.probabilityScore
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header Control Card */}
            <div className="ace-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.1rem' }}>AI Multi-Market Live Scanner</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                        Scanning Volatility, Jump, and Synthetic Index Streams
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>Analyze All Markets</span>
                    <button
                        className={`ace-btn ${analyzeAll ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setAnalyzeAll(!analyzeAll)}
                    >
                        {analyzeAll ? 'ON 🟢' : 'OFF 🔴'}
                    </button>
                </div>
            </div>

            {/* Markets Ranking Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
                {sortedMarkets.map((m, rank) => {
                    const isSelected = m.symbol === activeSymbol;
                    return (
                        <div
                            key={m.symbol}
                            className="ace-card"
                            style={{
                                border: isSelected ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                                boxShadow: isSelected ? '0 0 20px rgba(16, 185, 129, 0.2)' : 'none',
                                cursor: 'pointer',
                            }}
                            onClick={() => onSelectSymbol(m.symbol)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: rank === 0 ? '#f59e0b' : '#94a3b8' }}>
                                    RANK #{rank + 1} {rank === 0 && '⭐ TOP MATCH'}
                                </span>
                                <span
                                    style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        padding: '0.2rem 0.6rem',
                                        borderRadius: '10px',
                                        background: m.riskScore === 'SAFE' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                        color: m.riskScore === 'SAFE' ? '#10b981' : '#f59e0b',
                                    }}
                                >
                                    {m.riskScore}
                                </span>
                            </div>

                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#f8fafc' }}>{m.displayName}</h4>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', margin: '0.75rem 0' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Health Score</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>{m.healthScore}%</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Probability Score</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#3b82f6' }}>{m.probabilityScore}%</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Signal Strength</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>{m.signalStrength}%</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Expected Win %</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#8b5cf6' }}>{m.expectedWinRate}%</div>
                                </div>
                            </div>

                            <button
                                className={`ace-btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ width: '100%', marginTop: '0.5rem' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectSymbol(m.symbol);
                                }}
                            >
                                {isSelected ? '⚡ Active Trading Market' : 'Select Market'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
