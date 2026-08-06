import React, { useState } from 'react';
import { CompoundingSummary, calculateCompoundingPlan } from '../utils/compounding-calculator';
import { exportChallengeToCSV } from '../utils/excel-export';

interface ChallengeGeneratorTabProps {
    summary: CompoundingSummary;
    onUpdateSummary: (s: CompoundingSummary) => void;
}

export const ChallengeGeneratorTab: React.FC<ChallengeGeneratorTabProps> = ({
    summary,
    onUpdateSummary,
}) => {
    const [startBal, setStartBal] = useState<number>(summary.initialBalance);
    const [targetBal, setTargetBal] = useState<number>(summary.targetBalance);
    const [days, setDays] = useState<number>(summary.days);

    const handleApplyPreset = (s: number, t: number, d: number) => {
        setStartBal(s);
        setTargetBal(t);
        setDays(d);
        const plan = calculateCompoundingPlan(s, t, d);
        onUpdateSummary(plan);
    };

    const handleRecalculate = () => {
        const plan = calculateCompoundingPlan(startBal, targetBal, days);
        onUpdateSummary(plan);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Presets Bar */}
            <div className="ace-card">
                <div className="ace-card-title">Quick Challenge Presets</div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    <button className="ace-btn btn-secondary" onClick={() => handleApplyPreset(20, 4000, 150)}>
                        🚀 $20 → $4,000 (150 Days)
                    </button>
                    <button className="ace-btn btn-secondary" onClick={() => handleApplyPreset(50, 4000, 150)}>
                        🔥 $50 → $4,000 (150 Days)
                    </button>
                    <button className="ace-btn btn-secondary" onClick={() => handleApplyPreset(100, 4000, 150)}>
                        ⚡ $100 → $4,000 (150 Days)
                    </button>
                    <button className="ace-btn btn-primary" onClick={() => handleApplyPreset(400, 4000, 150)}>
                        ⭐ $400 → $4,000 (150 Days)
                    </button>
                </div>
            </div>

            {/* Config & Metrics Inputs */}
            <div className="ace-card">
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Custom Challenge Parameters</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Start Balance ($)</label>
                        <input
                            type="number"
                            className="ace-input"
                            value={startBal}
                            onChange={(e) => setStartBal(parseFloat(e.target.value) || 0)}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Target Balance ($)</label>
                        <input
                            type="number"
                            className="ace-input"
                            value={targetBal}
                            onChange={(e) => setTargetBal(parseFloat(e.target.value) || 0)}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Duration (Days)</label>
                        <input
                            type="number"
                            className="ace-input"
                            value={days}
                            onChange={(e) => setDays(parseInt(e.target.value, 10) || 1)}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem' }}>
                    <button className="ace-btn btn-primary" onClick={handleRecalculate}>
                        🧮 Generate Compounding Plan
                    </button>
                    <button className="ace-btn btn-accent" onClick={() => exportChallengeToCSV(summary)}>
                        📥 Export to Excel / CSV
                    </button>
                </div>
            </div>

            {/* Calculated Plan Statistics Cards */}
            <div className="ace-grid">
                <div className="ace-card">
                    <div className="ace-card-title">Daily Growth %</div>
                    <div className="ace-card-value positive">+{summary.dailyGrowthPct}%</div>
                </div>
                <div className="ace-card">
                    <div className="ace-card-title">Day 1 Target Profit</div>
                    <div className="ace-card-value positive">+${summary.targetDailyProfit.toFixed(2)}</div>
                </div>
                <div className="ace-card">
                    <div className="ace-card-title">Day 1 Target Balance</div>
                    <div className="ace-card-value accent">${summary.dailyTargetBalance.toFixed(2)}</div>
                </div>
                <div className="ace-card">
                    <div className="ace-card-title">Projected Monthly Growth</div>
                    <div className="ace-card-value positive">+{summary.projectedMonthlyGrowthPct}%</div>
                </div>
                <div className="ace-card">
                    <div className="ace-card-title">Required Win Rate</div>
                    <div className="ace-card-value">{summary.requiredWinRatePct}%</div>
                </div>
                <div className="ace-card">
                    <div className="ace-card-title">Initial Stake</div>
                    <div className="ace-card-value">${summary.projectedStake.toFixed(2)}</div>
                </div>
            </div>

            {/* Full Compounding Plan Schedule Table */}
            <div className="ace-card">
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Compounding Schedule ({summary.days} Days)</h3>
                <div className="ace-table-wrapper" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Day</th>
                                <th>Start Balance ($)</th>
                                <th>Target Profit ($)</th>
                                <th>Target End Balance ($)</th>
                                <th>Progress (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.daysPlan.map((d) => (
                                <tr key={d.day}>
                                    <td><strong>Day {d.day}</strong></td>
                                    <td>${d.startBalance.toFixed(2)}</td>
                                    <td style={{ color: '#10b981', fontWeight: 600 }}>+${d.targetProfit.toFixed(2)}</td>
                                    <td style={{ color: '#3b82f6', fontWeight: 700 }}>${d.targetBalance.toFixed(2)}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div className="ace-progress-bar" style={{ width: '80px', margin: 0 }}>
                                                <div className="ace-progress-fill green" style={{ width: `${Math.min(d.progressPct, 100)}%` }} />
                                            </div>
                                            <span>{d.progressPct.toFixed(1)}%</span>
                                        </div>
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
