import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { getTrades, getActiveChallenge } from '../services/journal-storage';

// A simple CSS-based bar chart component since we don't have a charting library
const BarChart = ({ data, color }: { data: { label: string, value: number }[], color: string }) => {
    const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 1);
    
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: '8px', marginTop: '20px', paddingBottom: '30px', position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {data.map((d, i) => {
                const heightPct = (Math.abs(d.value) / maxVal) * 100;
                const isNegative = d.value < 0;
                return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                        <div 
                            title={`${d.label}: ${d.value}`}
                            style={{ 
                                width: '100%', 
                                maxWidth: '40px',
                                height: `${heightPct}%`, 
                                background: isNegative ? '#ef4444' : color, 
                                borderRadius: '4px 4px 0 0',
                                opacity: 0.8,
                                transition: 'height 0.3s'
                            }} 
                        />
                        <div style={{ position: 'absolute', bottom: '-25px', fontSize: '0.7rem', color: '#94a3b8', whiteSpace: 'nowrap', transform: 'rotate(-45deg)', transformOrigin: 'top left' }}>
                            {d.label}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const ChartsTab = observer(() => {
    const [range, setRange] = useState<'7d'|'30d'>('7d');
    const [plData, setPlData] = useState<{label: string, value: number}[]>([]);
    
    useEffect(() => {
        const trades = getTrades();
        const days = range === '7d' ? 7 : 30;
        
        // Group P/L by date
        const grouped: Record<string, number> = {};
        
        // Initialize last N days with 0
        for(let i=days-1; i>=0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            grouped[d.toISOString().split('T')[0]] = 0;
        }

        trades.forEach(t => {
            const date = t.date.split('T')[0];
            if (grouped[date] !== undefined) {
                grouped[date] += t.profit_loss;
            }
        });

        const formatted = Object.entries(grouped).map(([k, v]) => ({
            label: k.slice(5), // MM-DD
            value: v
        }));
        
        setPlData(formatted);
    }, [range]);

    return (
        <div className="pj-charts-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, color: '#f8fafc' }}>Progress Charts</h3>
                <select value={range} onChange={e => setRange(e.target.value as any)} style={{ padding: '6px 12px', background: 'rgba(15, 23, 42, 0.8)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                </select>
            </div>

            <div className="pj-card">
                <h4 style={{ margin: '0 0 10px 0', color: '#f1f5f9' }}>Daily Profit / Loss</h4>
                <p style={{ margin: '0', fontSize: '0.85rem', color: '#94a3b8' }}>Realized P/L based on Paper Trade Journal entries.</p>
                <BarChart data={plData} color="#10b981" />
            </div>

            <div className="pj-card" style={{ marginTop: '40px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#f1f5f9' }}>Challenge Progress Visualization</h4>
                <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem', color: '#94a3b8' }}>Visual representation of your current compounding cycle.</p>
                
                {(() => {
                    const c = getActiveChallenge();
                    if (!c) return <div style={{ color: '#94a3b8' }}>No active challenge.</div>;
                    
                    const actuals = c.days.filter(d => d.actual_balance !== null);
                    if (actuals.length === 0) return <div style={{ color: '#94a3b8' }}>No actual balances recorded in challenge yet.</div>;
                    
                    const lastActual = actuals[actuals.length-1].actual_balance || 0;
                    const progress = Math.min(100, Math.max(0, ((lastActual - c.starting_capital) / (c.target_capital - c.starting_capital)) * 100));

                    return (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: '#cbd5e1' }}>
                                <span>{c.starting_capital.toFixed(2)}</span>
                                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{lastActual.toFixed(2)}</span>
                                <span>{c.target_capital.toFixed(2)}</span>
                            </div>
                            <div style={{ width: '100%', height: '24px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress}%`, background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)', transition: 'width 0.5s ease-out' }} />
                            </div>
                            <div style={{ textAlign: 'center', marginTop: '12px', color: '#94a3b8', fontSize: '0.85rem' }}>
                                {progress.toFixed(1)}% of Target Achieved
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
});

export default ChartsTab;
