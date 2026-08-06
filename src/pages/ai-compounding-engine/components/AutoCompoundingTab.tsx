import React from 'react';
import { CompoundingSummary } from '../utils/compounding-calculator';

interface AutoCompoundingTabProps {
    summary: CompoundingSummary;
    balance: number;
}

export const AutoCompoundingTab: React.FC<AutoCompoundingTabProps> = ({
    summary,
    balance,
}) => {
    const todayTargetProfit = summary.targetDailyProfit;
    const todayStake = summary.projectedStake;
    const maxStake = parseFloat((todayStake * 3).toFixed(2));
    const profitEarned = 18.40;
    const remainingTargetProfit = Math.max(todayTargetProfit - profitEarned, 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="ace-card">
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>Auto Compounding & Daily Goal Manager</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                    Automatically recalculates compounding stakes and pauses auto trading when daily targets are achieved.
                </p>
            </div>

            <div className="ace-grid">
                <div className="ace-card">
                    <div className="ace-card-title">Today's Target Profit</div>
                    <div className="ace-card-value positive">+${todayTargetProfit.toFixed(2)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.3rem' }}>Growth: +{summary.dailyGrowthPct}%/day</div>
                </div>

                <div className="ace-card">
                    <div className="ace-card-title">Profit Earned Today</div>
                    <div className="ace-card-value positive">+${profitEarned.toFixed(2)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.3rem' }}>Progress: {((profitEarned / todayTargetProfit) * 100).toFixed(1)}%</div>
                </div>

                <div className="ace-card">
                    <div className="ace-card-title">Remaining Profit to Goal</div>
                    <div className="ace-card-value">${remainingTargetProfit.toFixed(2)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.3rem' }}>Goal Balance: ${(balance + remainingTargetProfit).toFixed(2)}</div>
                </div>

                <div className="ace-card">
                    <div className="ace-card-title">Active Compounding Stake</div>
                    <div className="ace-card-value accent">${todayStake.toFixed(2)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.3rem' }}>Max Cap: ${maxStake.toFixed(2)}</div>
                </div>
            </div>

            <div className="ace-card">
                <h4 style={{ margin: '0 0 1rem 0' }}>Automation Safety Rules</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                    <div style={{ padding: '1rem', background: 'rgba(30,41,59,0.5)', borderRadius: '12px' }}>
                        <strong style={{ color: '#10b981', display: 'block', marginBottom: '0.3rem' }}>✅ Target Reached Pause</strong>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                            Automatically halts trading as soon as today's target profit of +${todayTargetProfit.toFixed(2)} is secured.
                        </p>
                    </div>

                    <div style={{ padding: '1rem', background: 'rgba(30,41,59,0.5)', borderRadius: '12px' }}>
                        <strong style={{ color: '#3b82f6', display: 'block', marginBottom: '0.3rem' }}>📈 Dynamic Stake Scaling</strong>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                            Increases trade stake proportionally with account balance progression while keeping risk capped under {summary.dailyGrowthPct}%.
                        </p>
                    </div>

                    <div style={{ padding: '1rem', background: 'rgba(30,41,59,0.5)', borderRadius: '12px' }}>
                        <strong style={{ color: '#f59e0b', display: 'block', marginBottom: '0.3rem' }}>🛡️ Daily Drawdown Limit</strong>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                            Enforces strict stop loss if cumulative daily loss reaches 15% of start balance.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
