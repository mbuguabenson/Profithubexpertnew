import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { IJournalTrade, TradeDirection } from '../services/journal-types';
import { getTrades, addTrade, deleteTrade } from '../services/journal-storage';

const TradeJournalTab = observer(() => {
    const [trades, setTrades] = useState<IJournalTrade[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
        market: 'Volatility 100 Index',
        strategy_name: 'Trend Follow',
        direction: 'call' as TradeDirection,
        entry_value: '',
        exit_value: '',
        stake: '10',
        result: 'win' as 'win' | 'loss' | 'tie',
        profit_loss: '8.5',
        reason_entry: '',
        reason_exit: '',
        notes: '',
        emotional_notes: '',
        currency: 'USD'
    });
    const [error, setError] = useState<string | null>(null);

    const loadData = () => setTrades(getTrades());

    useEffect(() => {
        loadData();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        const payload = {
            date: formData.date,
            market: formData.market,
            strategy_name: formData.strategy_name,
            direction: formData.direction,
            entry_value: parseFloat(formData.entry_value) || 0,
            exit_value: parseFloat(formData.exit_value) || 0,
            stake: parseFloat(formData.stake),
            result: formData.result,
            profit_loss: parseFloat(formData.profit_loss),
            reason_entry: formData.reason_entry,
            reason_exit: formData.reason_exit,
            notes: formData.notes,
            emotional_notes: formData.emotional_notes,
            currency: formData.currency,
        };

        const res = addTrade(payload);
        
        if (!res.is_valid) {
            setError(res.errors.join(' '));
            return;
        }

        setIsModalOpen(false);
        // Reset form slightly
        setFormData({ ...formData, entry_value: '', exit_value: '', result: 'win', profit_loss: '', reason_entry: '', reason_exit: '', notes: '', emotional_notes: '' });
        loadData();
    };

    const handleDelete = (id: string) => {
        if(confirm('Are you sure you want to delete this trade? (Soft delete for audit)')) {
            deleteTrade(id);
            loadData();
        }
    };

    const formatMoney = (amount: number, curr: string) => `${amount < 0 ? '-' : ''}${Math.abs(amount).toFixed(2)} ${curr}`;

    return (
        <div className="pj-trade-journal-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#f8fafc' }}>Paper Trade Journal</h3>
                <button className="pj-btn pj-btn--primary" onClick={() => setIsModalOpen(true)}>+ Add Trade</button>
            </div>

            <div className="pj-table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Date/Time</th>
                            <th>Market</th>
                            <th>Strategy</th>
                            <th>Direction</th>
                            <th>Stake</th>
                            <th>Result</th>
                            <th>P/L</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trades.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No trades recorded. Start journaling!</td></tr>
                        ) : (
                            trades.map(t => (
                                <tr key={t.id}>
                                    <td style={{ fontSize: '0.85rem' }}>{t.date.replace('T', ' ')}</td>
                                    <td>{t.market}</td>
                                    <td>{t.strategy_name}</td>
                                    <td>
                                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', textTransform: 'uppercase', background: ['buy', 'call', 'over', 'rise'].includes(t.direction) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: ['buy', 'call', 'over', 'rise'].includes(t.direction) ? '#10b981' : '#ef4444' }}>
                                            {t.direction}
                                        </span>
                                    </td>
                                    <td>{t.stake} {t.currency}</td>
                                    <td>
                                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', textTransform: 'uppercase', background: t.result === 'win' ? 'rgba(16, 185, 129, 0.2)' : t.result === 'loss' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.1)', color: t.result === 'win' ? '#10b981' : t.result === 'loss' ? '#ef4444' : '#cbd5e1' }}>
                                            {t.result}
                                        </span>
                                    </td>
                                    <td style={{ color: t.profit_loss > 0 ? '#10b981' : t.profit_loss < 0 ? '#ef4444' : '#cbd5e1', fontWeight: 600 }}>
                                        {t.profit_loss > 0 ? '+' : ''}{t.profit_loss} {t.currency}
                                    </td>
                                    <td>
                                        <button className="pj-btn pj-btn--danger" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleDelete(t.id)}>Del</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyItems: 'center', overflowY: 'auto', padding: '20px' }}>
                    <div className="pj-card" style={{ width: '600px', maxWidth: '100%', margin: 'auto' }}>
                        <h3 style={{ margin: '0 0 20px 0', color: '#f8fafc' }}>Add Paper Trade</h3>
                        
                        {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Date & Time</label>
                                    <input type="datetime-local" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Market</label>
                                    <input type="text" value={formData.market} onChange={e => setFormData({...formData, market: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Strategy Name</label>
                                    <input type="text" value={formData.strategy_name} onChange={e => setFormData({...formData, strategy_name: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Direction / Type</label>
                                    <select value={formData.direction} onChange={e => setFormData({...formData, direction: e.target.value as TradeDirection})} style={{ width: '100%', padding: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}>
                                        <option value="call">Call / Higher / Rise</option>
                                        <option value="put">Put / Lower / Fall</option>
                                        <option value="over">Over</option>
                                        <option value="under">Under</option>
                                        <option value="buy">Buy</option>
                                        <option value="sell">Sell</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Stake</label>
                                    <input type="number" step="0.01" value={formData.stake} onChange={e => setFormData({...formData, stake: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Result & P/L</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <select value={formData.result} onChange={e => setFormData({...formData, result: e.target.value as 'win'|'loss'|'tie'})} style={{ width: '40%', padding: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}>
                                            <option value="win">Win</option>
                                            <option value="loss">Loss</option>
                                            <option value="tie">Tie</option>
                                        </select>
                                        <input type="number" step="0.01" value={formData.profit_loss} onChange={e => setFormData({...formData, profit_loss: e.target.value})} placeholder="0.00" style={{ width: '60%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Reason for Entry (Technical/Fundamental)</label>
                                <input type="text" value={formData.reason_entry} onChange={e => setFormData({...formData, reason_entry: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>General Notes</label>
                                    <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', resize: 'vertical' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Emotional / Discipline Notes</label>
                                    <textarea value={formData.emotional_notes} onChange={e => setFormData({...formData, emotional_notes: e.target.value})} rows={2} placeholder="Did you follow the plan? Felt FOMO?" style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', resize: 'vertical' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                                <button type="button" className="pj-btn pj-btn--secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="pj-btn pj-btn--primary">Save Trade</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
});

export default TradeJournalTab;
