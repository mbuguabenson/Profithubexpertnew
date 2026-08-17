import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ICompoundingChallenge, ChallengeStatus } from '../services/journal-types';
import { getChallenges, addChallenge, updateChallengeDay } from '../services/journal-storage';
import { useDisplayCurrency } from '@/utils/currency-converter';

const CompoundingJournalTab = observer(() => {
    const { convert } = useDisplayCurrency();
    const [challenges, setChallenges] = useState<ICompoundingChallenge[]>([]);
    const [activeChallenge, setActiveChallenge] = useState<ICompoundingChallenge | null>(null);
    const [isCreateMode, setIsCreateMode] = useState(false);

    const [formData, setFormData] = useState({
        name: '30-Day Growth Plan',
        starting_capital: '100',
        target_capital: '1000',
        num_days: '30',
        sessions_per_day: '2',
        target_percent: '8',
        max_risk_percent: '3',
        currency: 'USD'
    });
    const [error, setError] = useState<string | null>(null);

    const loadData = () => {
        const data = getChallenges();
        setChallenges(data);
        if (data.length > 0 && !activeChallenge) {
            setActiveChallenge(data[0]);
        } else if (data.length > 0 && activeChallenge) {
            // Update active challenge ref
            const updated = data.find(c => c.id === activeChallenge.id);
            if(updated) setActiveChallenge(updated);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        const res = addChallenge({
            name: formData.name,
            starting_capital: parseFloat(formData.starting_capital),
            target_capital: parseFloat(formData.target_capital),
            num_days: parseInt(formData.num_days),
            sessions_per_day: parseInt(formData.sessions_per_day),
            target_percent: parseFloat(formData.target_percent),
            max_risk_percent: parseFloat(formData.max_risk_percent),
            currency: formData.currency
        });

        if (!res.is_valid) {
            setError(res.errors.join(' '));
            return;
        }

        setIsCreateMode(false);
        loadData();
    };

    const handleUpdateDay = (dayNum: number, currentVal: number | null) => {
        const val = prompt(`Enter actual balance at the end of Day ${dayNum}:`, currentVal ? currentVal.toString() : '');
        if (val !== null && val !== '') {
            const num = parseFloat(val);
            if (!isNaN(num) && activeChallenge) {
                updateChallengeDay(activeChallenge.id, dayNum, num);
                loadData();
            }
        }
    };

    const formatMoney = (amount: number, curr = 'USD') => {
        const { formatted } = convert(amount, curr);
        return formatted;
    };

    if (isCreateMode || challenges.length === 0) {
        return (
            <div className="pj-compounding-journal">
                <div className="pj-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h3 style={{ margin: 0, color: '#f8fafc' }}>Create Compounding Challenge</h3>
                        {challenges.length > 0 && <button className="pj-btn pj-btn--secondary" onClick={() => setIsCreateMode(false)}>Cancel</button>}
                    </div>

                    {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>}

                    <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Challenge Name</label>
                            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Starting Capital</label>
                                <input type="number" step="0.01" value={formData.starting_capital} onChange={e => setFormData({...formData, starting_capital: e.target.value})} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Target Capital</label>
                                <input type="number" step="0.01" value={formData.target_capital} onChange={e => setFormData({...formData, target_capital: e.target.value})} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Number of Days</label>
                                <input type="number" value={formData.num_days} onChange={e => setFormData({...formData, num_days: e.target.value})} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Daily Target %</label>
                                <input type="number" step="0.1" value={formData.target_percent} onChange={e => setFormData({...formData, target_percent: e.target.value})} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Sessions per Day</label>
                                <input type="number" value={formData.sessions_per_day} onChange={e => setFormData({...formData, sessions_per_day: e.target.value})} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Max Risk % (per trade)</label>
                                <input type="number" step="0.1" value={formData.max_risk_percent} onChange={e => setFormData({...formData, max_risk_percent: e.target.value})} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
                            </div>
                        </div>

                        <button type="submit" className="pj-btn pj-btn--primary" style={{ marginTop: '16px', padding: '12px' }}>Generate Plan</button>
                    </form>
                </div>
            </div>
        );
    }

    if (!activeChallenge) return null;

    return (
        <div className="pj-compounding-journal">
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <select 
                        value={activeChallenge.id} 
                        onChange={e => setActiveChallenge(challenges.find(c => c.id === e.target.value) || challenges[0])}
                        style={{ padding: '8px 12px', background: 'rgba(15, 23, 42, 0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '1rem', fontWeight: 600 }}
                    >
                        {challenges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '12px', background: activeChallenge.status === ChallengeStatus.ACTIVE ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: activeChallenge.status === ChallengeStatus.ACTIVE ? '#10b981' : '#cbd5e1', textTransform: 'uppercase' }}>
                        {activeChallenge.status}
                    </span>
                </div>
                <button className="pj-btn pj-btn--primary" onClick={() => setIsCreateMode(true)}>+ New Challenge</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="pj-card" style={{ padding: '16px', marginBottom: 0 }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Starting Capital</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc' }}>{formatMoney(activeChallenge.starting_capital)}</div>
                </div>
                <div className="pj-card" style={{ padding: '16px', marginBottom: 0 }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Target Capital</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc' }}>{formatMoney(activeChallenge.target_capital)}</div>
                </div>
                <div className="pj-card" style={{ padding: '16px', marginBottom: 0 }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Target / Day</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#38bdf8' }}>{activeChallenge.target_percent}%</div>
                </div>
                <div className="pj-card" style={{ padding: '16px', marginBottom: 0 }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Duration</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc' }}>{activeChallenge.num_days} Days</div>
                </div>
            </div>

            <div className="pj-table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Day</th>
                            <th>Starting Balance</th>
                            <th>Planned Growth</th>
                            <th>Target Balance</th>
                            <th>Actual Balance</th>
                            <th>Difference</th>
                            <th>Progress %</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeChallenge.days.map(day => (
                            <tr key={day.day}>
                                <td style={{ fontWeight: 600 }}>{day.day}</td>
                                <td>{formatMoney(day.starting_balance)}</td>
                                <td style={{ color: '#38bdf8' }}>+{formatMoney(day.planned_growth)}</td>
                                <td>{formatMoney(day.target_balance)}</td>
                                <td>
                                    <div 
                                        style={{ 
                                            padding: '4px 8px', 
                                            background: day.actual_balance !== null ? 'rgba(255,255,255,0.05)' : 'rgba(59, 130, 246, 0.1)', 
                                            border: '1px dashed rgba(255,255,255,0.2)', 
                                            borderRadius: '4px', 
                                            cursor: 'pointer',
                                            display: 'inline-block',
                                            minWidth: '80px',
                                            textAlign: 'center'
                                        }}
                                        onClick={() => handleUpdateDay(day.day, day.actual_balance)}
                                        title="Click to enter actual balance"
                                    >
                                        {day.actual_balance !== null ? formatMoney(day.actual_balance) : 'Enter...'}
                                    </div>
                                </td>
                                <td style={{ color: day.difference !== null ? (day.difference >= 0 ? '#10b981' : '#ef4444') : '#64748b' }}>
                                    {day.difference !== null ? (day.difference > 0 ? '+' : '') + formatMoney(day.difference) : '-'}
                                </td>
                                <td>
                                    {day.progress_percent !== null ? `${day.progress_percent}%` : '-'}
                                </td>
                                <td>
                                    <span style={{ 
                                        fontSize: '0.75rem', 
                                        padding: '2px 8px', 
                                        borderRadius: '12px', 
                                        background: day.status === 'pending' ? 'rgba(255,255,255,0.1)' : day.status === 'missed' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)', 
                                        color: day.status === 'pending' ? '#cbd5e1' : day.status === 'missed' ? '#ef4444' : '#10b981',
                                        textTransform: 'capitalize'
                                    }}>
                                        {day.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#94a3b8' }}>
                * Click on the "Actual Balance" cells to record your daily progress. The table clearly distinguishes planned theoretical values from your actual recorded journal results.
            </div>

        </div>
    );
});

export default CompoundingJournalTab;
