import React from 'react';
import { SymbolMarketData } from '../hooks/useCompoundingWS';

interface SmartZonesTabProps {
    marketsData: Record<string, SymbolMarketData>;
}

export const SmartZonesTab: React.FC<SmartZonesTabProps> = ({ marketsData }) => {
    const marketsList = Object.values(marketsData);
    const hotMarkets = marketsList.filter(m => m.healthScore >= 85);
    const coldMarkets = marketsList.filter(m => m.healthScore < 85);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="ace-card">
                <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.1rem' }}>AI Smart Zones & Live Market Heatmap Grid</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                    Visualizing Safe vs. Danger trading zones and live execution queues across streaming Deriv indices.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                {/* Safe Zones Panel */}
                <div className="ace-card" style={{ border: '1px solid #10b981' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#10b981' }}>🟢 Recommended Safe Zones</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {hotMarkets.map(m => (
                            <div key={m.symbol} style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <strong style={{ color: '#f8fafc' }}>{m.displayName}</strong>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Signal Strength: {m.signalStrength}%</div>
                                </div>
                                <span style={{ fontWeight: 800, color: '#10b981' }}>SAFE ({m.healthScore}%)</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Avoid / Danger Zones Panel */}
                <div className="ace-card" style={{ border: '1px solid #ef4444' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#ef4444' }}>🔴 High-Risk / Avoid Zones</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {coldMarkets.length > 0 ? (
                            coldMarkets.map(m => (
                                <div key={m.symbol} style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <strong style={{ color: '#f8fafc' }}>{m.displayName}</strong>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Signal Strength: {m.signalStrength}%</div>
                                    </div>
                                    <span style={{ fontWeight: 800, color: '#ef4444' }}>AVOID ({m.healthScore}%)</span>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.85rem' }}>No high-danger markets detected currently.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Trade Queue */}
            <div className="ace-card">
                <h4 style={{ margin: '0 0 1rem 0' }}>📋 Real-Time AI Trade Execution Queue</h4>
                <div className="ace-table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Queue #</th>
                                <th>Target Symbol</th>
                                <th>Strategy</th>
                                <th>Entry Barrier</th>
                                <th>Probability</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {hotMarkets.map((m, idx) => (
                                <tr key={m.symbol}>
                                    <td>#{idx + 1}</td>
                                    <td>{m.displayName}</td>
                                    <td>{idx % 2 === 0 ? 'Over 2 Pro' : 'Even Parity'}</td>
                                    <td>{idx % 2 === 0 ? 'OVER 2' : 'EVEN'}</td>
                                    <td style={{ color: '#10b981', fontWeight: 700 }}>{m.probabilityScore}%</td>
                                    <td>
                                        <span className={`ace-status-pill status-${idx === 0 ? 'TRADING' : 'WAITING'}`}>
                                            {idx === 0 ? 'READY' : 'QUEUED'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
