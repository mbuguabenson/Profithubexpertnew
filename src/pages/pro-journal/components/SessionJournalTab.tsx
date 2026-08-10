import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { IJournalSession, SessionStatus } from '../services/journal-types';
import { getSessions, addSession, deleteSession } from '../services/journal-storage';

const SessionJournalTab = observer(() => {
    const [sessions, setSessions] = useState<IJournalSession[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        starting_balance: '',
        ending_balance: '',
        deposits: '0',
        withdrawals: '0',
        total_trades: '',
        winning_trades: '',
        losing_trades: '',
        session_pl: '',
        planned_target: '',
        target_achieved: false,
        strategy_used: 'Trend Follow',
        notes: '',
        currency: 'USD',
        status: SessionStatus.NO_ACTIVITY
    });

    const loadData = () => setSessions(getSessions());

    useEffect(() => {
        loadData();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        let status = SessionStatus.NO_ACTIVITY;
        const pl = parseFloat(formData.session_pl) || 0;
        const target = parseFloat(formData.planned_target) || 0;
        
        if (formData.total_trades !== '0' && formData.total_trades !== '') {
            if (pl >= target && target > 0) status = SessionStatus.TARGET_ACHIEVED;
            else if (pl > target) status = SessionStatus.ABOVE_TARGET;
            else status = SessionStatus.BELOW_TARGET;
        }

        addSession({
            date: formData.date,
            starting_balance: parseFloat(formData.starting_balance) || 0,
            ending_balance: parseFloat(formData.ending_balance) || 0,
            deposits: parseFloat(formData.deposits) || 0,
            withdrawals: parseFloat(formData.withdrawals) || 0,
            total_trades: parseInt(formData.total_trades) || 0,
            winning_trades: parseInt(formData.winning_trades) || 0,
            losing_trades: parseInt(formData.losing_trades) || 0,
            session_pl: pl,
            planned_target: target,
            target_achieved: status === SessionStatus.TARGET_ACHIEVED || status === SessionStatus.ABOVE_TARGET,
            strategy_used: formData.strategy_used,
            notes: formData.notes,
            status,
            currency: formData.currency
        });

        setIsModalOpen(false);
        loadData();
    };

    const handleDelete = (id: string) => {
        if(confirm('Delete session?')) {
            deleteSession(id);
            loadData();
        }
    };

    return (
        <div className="pj-session-journal-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#f8fafc' }}>Daily Session Journal</h3>
                <button className="pj-btn pj-btn--primary" onClick={() => setIsModalOpen(true)}>+ Log Session</button>
            </div>

            <div className="pj-table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Starting Bal</th>
                            <th>Ending Bal</th>
                            <th>Trades (W/L)</th>
                            <th>Session P/L</th>
                            <th>Strategy</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No sessions recorded.</td></tr>
                        ) : (
                            sessions.map(s => (
                                <tr key={s.id}>
                                    <td>{s.date}</td>
                                    <td>{s.starting_balance.toFixed(2)}</td>
                                    <td>{s.ending_balance.toFixed(2)}</td>
                                    <td>{s.total_trades} ({s.winning_trades}/{s.losing_trades})</td>
                                    <td style={{ color: s.session_pl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                        {s.session_pl > 0 ? '+' : ''}{s.session_pl.toFixed(2)}
                                    </td>
                                    <td>{s.strategy_used}</td>
                                    <td>
                                        <span style={{ 
                                            fontSize: '0.7rem', padding: '4px 8px', borderRadius: '12px', textTransform: 'uppercase',
                                            background: s.status === SessionStatus.TARGET_ACHIEVED ? 'rgba(16,185,129,0.2)' : s.status === SessionStatus.BELOW_TARGET ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
                                            color: s.status === SessionStatus.TARGET_ACHIEVED ? '#10b981' : s.status === SessionStatus.BELOW_TARGET ? '#ef4444' : '#cbd5e1'
                                        }}>
                                            {s.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="pj-btn pj-btn--danger" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleDelete(s.id)}>Del</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="pj-card" style={{ width: '500px', maxWidth: '90%', margin: 0 }}>
                        <h3 style={{ margin: '0 0 20px 0', color: '#f8fafc' }}>Log Daily Session</h3>
                        
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Date</label>
                                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Strategy Used</label>
                                    <input type="text" value={formData.strategy_used} onChange={e => setFormData({...formData, strategy_used: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Starting Balance</label>
                                    <input type="number" step="0.01" value={formData.starting_balance} onChange={e => setFormData({...formData, starting_balance: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Ending Balance</label>
                                    <input type="number" step="0.01" value={formData.ending_balance} onChange={e => setFormData({...formData, ending_balance: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Session P/L</label>
                                    <input type="number" step="0.01" value={formData.session_pl} onChange={e => setFormData({...formData, session_pl: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Planned Target P/L</label>
                                    <input type="number" step="0.01" value={formData.planned_target} onChange={e => setFormData({...formData, planned_target: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Total Trades</label>
                                    <input type="number" value={formData.total_trades} onChange={e => setFormData({...formData, total_trades: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Wins</label>
                                        <input type="number" value={formData.winning_trades} onChange={e => setFormData({...formData, winning_trades: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Losses</label>
                                        <input type="number" value={formData.losing_trades} onChange={e => setFormData({...formData, losing_trades: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Session Notes</label>
                                <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', resize: 'vertical' }} />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                                <button type="button" className="pj-btn pj-btn--secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="pj-btn pj-btn--primary">Save Session</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
});

export default SessionJournalTab;
