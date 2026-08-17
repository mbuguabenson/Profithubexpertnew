import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { IStrategyPerformance } from '../services/journal-types';
import { getStrategyPerformance } from '../services/journal-storage';
import { useDisplayCurrency } from '@/utils/currency-converter';

const StrategyPerformanceTab = observer(() => {
    const { convert } = useDisplayCurrency();
    const [performance, setPerformance] = useState<IStrategyPerformance[]>([]);

    useEffect(() => {
        setPerformance(getStrategyPerformance());
    }, []);

    const formatMoney = (amount: number, curr = 'USD') => {
        const { formatted } = convert(amount, curr);
        return `${amount > 0 ? '+' : ''}${formatted}`;
    };

    return (
        <div className="pj-strategy-performance-tab">
            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc' }}>Strategy Analytics</h3>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                    Historical journal performance — not a prediction of future performance. Automatically computed from your Paper Trade Journal entries.
                </p>
            </div>

            {performance.length === 0 ? (
                <div className="pj-card" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    No strategy data available. Log some trades in the Trade Journal with a Strategy Name.
                </div>
            ) : (
                <div className="pj-table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Strategy Name</th>
                                <th>Trades</th>
                                <th>Win Rate</th>
                                <th>Total P/L</th>
                                <th>Avg P/L</th>
                                <th>Best Result</th>
                                <th>Worst Result</th>
                                <th>Longest Streak (W/L)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {performance.map(p => (
                                <tr key={p.strategy_name}>
                                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>{p.strategy_name}</td>
                                    <td>{p.total_trades}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>{p.win_rate}%</span>
                                            <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                                                <div style={{ width: `${p.win_rate}%`, height: '100%', background: p.win_rate >= 50 ? '#10b981' : '#ef4444', borderRadius: '2px' }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ color: p.total_pl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{formatMoney(p.total_pl)}</td>
                                    <td style={{ color: p.average_pl >= 0 ? '#10b981' : '#ef4444' }}>{formatMoney(p.average_pl)}</td>
                                    <td style={{ color: '#10b981' }}>+{p.best_result.toFixed(2)}</td>
                                    <td style={{ color: '#ef4444' }}>{p.worst_result.toFixed(2)}</td>
                                    <td>
                                        <span style={{ color: '#10b981' }}>{p.longest_win_streak}W</span>
                                        <span style={{ color: '#64748b', margin: '0 4px' }}>/</span>
                                        <span style={{ color: '#ef4444' }}>{p.longest_loss_streak}L</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
});

export default StrategyPerformanceTab;
