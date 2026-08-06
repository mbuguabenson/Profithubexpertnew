import React from 'react';
import { exportTransactionsToCSV } from '../utils/excel-export';

interface TransactionHistoryTabProps {
    tradeLogs: any[];
}

export const TransactionHistoryTab: React.FC<TransactionHistoryTabProps> = ({
    tradeLogs,
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="ace-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.1rem' }}>Transaction History & Execution Logs</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                        Real-time audit trail of trades executed by ACE on your Deriv account.
                    </p>
                </div>

                <button
                    className="ace-btn btn-accent"
                    onClick={() => exportTransactionsToCSV(tradeLogs)}
                    disabled={tradeLogs.length === 0}
                >
                    📥 Export CSV / Excel ({tradeLogs.length})
                </button>
            </div>

            <div className="ace-card">
                {tradeLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📜</div>
                        <h4 style={{ color: '#f8fafc', margin: '0 0 0.4rem 0' }}>No Trades Executed Yet</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>
                            Start automated compounding or execute manual trades in the Trading Console to populate live logs.
                        </p>
                    </div>
                ) : (
                    <div className="ace-table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Trade ID</th>
                                    <th>Date & Time</th>
                                    <th>Market</th>
                                    <th>Strategy</th>
                                    <th>Contract</th>
                                    <th>Stake ($)</th>
                                    <th>P/L ($)</th>
                                    <th>Balance ($)</th>
                                    <th>Result</th>
                                    <th>Signal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tradeLogs.map((log, idx) => (
                                    <tr key={log.id || idx}>
                                        <td><code className="ace-mono" style={{ color: '#3b82f6' }}>{log.id}</code></td>
                                        <td style={{ fontSize: '0.8rem', opacity: 0.85 }}>{new Date(log.timestamp).toLocaleString()}</td>
                                        <td><strong>{log.symbol}</strong></td>
                                        <td>{log.strategy}</td>
                                        <td><span className="ace-mono">{log.contractType}</span></td>
                                        <td>${(log.stake || 0).toFixed(2)}</td>
                                        <td style={{ color: log.pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                            {log.pnl >= 0 ? `+$${log.pnl.toFixed(2)}` : `-$${Math.abs(log.pnl).toFixed(2)}`}
                                        </td>
                                        <td style={{ fontWeight: 700 }}>${(log.runningBalance || 0).toFixed(2)}</td>
                                        <td>
                                            <span
                                                style={{
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '8px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 800,
                                                    background: log.result === 'WIN' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                                    color: log.result === 'WIN' ? '#10b981' : '#ef4444',
                                                }}
                                            >
                                                {log.result}
                                            </span>
                                        </td>
                                        <td style={{ color: '#f59e0b', fontWeight: 700 }}>{log.signalStrength || 85}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
