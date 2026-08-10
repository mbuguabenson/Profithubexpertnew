import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { IJournalDeposit, IJournalWithdrawal, TransactionStatus } from '../services/journal-types';
import { getDeposits, getWithdrawals, addDeposit, addWithdrawal, deleteDeposit, deleteWithdrawal } from '../services/journal-storage';

const MoneyJournalTab = observer(() => {
    const [activeTab, setActiveTab] = useState<'deposits' | 'withdrawals'>('deposits');
    const [deposits, setDeposits] = useState<IJournalDeposit[]>([]);
    const [withdrawals, setWithdrawals] = useState<IJournalWithdrawal[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        reference: '',
        amount: '',
        currency: 'USD',
        method: 'Bank Transfer',
        notes: ''
    });
    const [error, setError] = useState<string | null>(null);

    const loadData = () => {
        setDeposits(getDeposits());
        setWithdrawals(getWithdrawals());
    };

    useEffect(() => {
        loadData();
    }, []);

    const totalD = deposits.reduce((s, d) => s + d.amount, 0);
    const totalW = withdrawals.reduce((s, w) => s + w.amount, 0);
    const maxD = Math.max(0, ...deposits.map(d => d.amount));
    const maxW = Math.max(0, ...withdrawals.map(w => w.amount));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        const payload = {
            date: formData.date,
            reference: formData.reference,
            amount: parseFloat(formData.amount),
            currency: formData.currency,
            method: formData.method,
            notes: formData.notes,
            status: TransactionStatus.COMPLETED // Auto complete for simplicity in paper journal
        };

        const res = activeTab === 'deposits' ? addDeposit(payload) : addWithdrawal(payload);
        
        if (!res.is_valid) {
            setError(res.errors.join(' '));
            return;
        }

        setIsModalOpen(false);
        setFormData({ ...formData, reference: '', amount: '', notes: '' });
        loadData();
    };

    const handleDelete = (id: string, type: 'deposit'|'withdrawal') => {
        if(confirm('Are you sure you want to delete this transaction? (Soft delete for audit)')) {
            if (type === 'deposit') deleteDeposit(id);
            else deleteWithdrawal(id);
            loadData();
        }
    };

    const formatMoney = (amount: number) => `$${amount.toFixed(2)}`;

    return (
        <div className="pj-money-journal-tab">
            
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div className="pj-card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Total Deposits</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#10b981' }}>{formatMoney(totalD)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Count: {deposits.length} | Max: {formatMoney(maxD)}</div>
                </div>
                <div className="pj-card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Total Withdrawals</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ef4444' }}>{formatMoney(totalW)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Count: {withdrawals.length} | Max: {formatMoney(maxW)}</div>
                </div>
                <div className="pj-card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Net Deposits</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: (totalD - totalW) >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatMoney(totalD - totalW)}
                    </div>
                </div>
            </div>

            {/* Tabs & Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '8px' }}>
                    <button 
                        className={`pj-btn ${activeTab === 'deposits' ? 'pj-btn--primary' : ''}`}
                        style={{ background: activeTab === 'deposits' ? '#3b82f6' : 'transparent' }}
                        onClick={() => setActiveTab('deposits')}
                    >Deposits</button>
                    <button 
                        className={`pj-btn ${activeTab === 'withdrawals' ? 'pj-btn--primary' : ''}`}
                        style={{ background: activeTab === 'withdrawals' ? '#3b82f6' : 'transparent' }}
                        onClick={() => setActiveTab('withdrawals')}
                    >Withdrawals</button>
                </div>
                <button className="pj-btn pj-btn--primary" onClick={() => setIsModalOpen(true)}>
                    + Add {activeTab === 'deposits' ? 'Deposit' : 'Withdrawal'}
                </button>
            </div>

            {/* Data Table */}
            <div className="pj-table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Reference</th>
                            <th>Method</th>
                            <th>Amount</th>
                            <th>Notes</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeTab === 'deposits' ? (
                            deposits.length === 0 ? (
                                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No deposits recorded.</td></tr>
                            ) : (
                                deposits.map(d => (
                                    <tr key={d.id}>
                                        <td>{d.date}</td>
                                        <td>{d.reference}</td>
                                        <td>{d.method}</td>
                                        <td style={{ color: '#10b981', fontWeight: 600 }}>+{formatMoney(d.amount)}</td>
                                        <td>{d.notes}</td>
                                        <td><span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>{d.status}</span></td>
                                        <td>
                                            <button className="pj-btn pj-btn--danger" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleDelete(d.id, 'deposit')}>Del</button>
                                        </td>
                                    </tr>
                                ))
                            )
                        ) : (
                            withdrawals.length === 0 ? (
                                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No withdrawals recorded.</td></tr>
                            ) : (
                                withdrawals.map(w => (
                                    <tr key={w.id}>
                                        <td>{w.date}</td>
                                        <td>{w.reference}</td>
                                        <td>{w.method}</td>
                                        <td style={{ color: '#ef4444', fontWeight: 600 }}>-{formatMoney(w.amount)}</td>
                                        <td>{w.notes}</td>
                                        <td><span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>{w.status}</span></td>
                                        <td>
                                            <button className="pj-btn pj-btn--danger" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleDelete(w.id, 'withdrawal')}>Del</button>
                                        </td>
                                    </tr>
                                ))
                            )
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="pj-card" style={{ width: '400px', maxWidth: '90%', margin: 0 }}>
                        <h3 style={{ margin: '0 0 20px 0', color: '#f8fafc' }}>Add {activeTab === 'deposits' ? 'Deposit' : 'Withdrawal'}</h3>
                        
                        {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Date</label>
                                <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Reference / ID</label>
                                <input type="text" value={formData.reference} onChange={e => setFormData({...formData, reference: e.target.value})} placeholder="e.g. TR-12345" style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Amount</label>
                                    <input type="number" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0.00" style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} required />
                                </div>
                                <div style={{ width: '100px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Currency</label>
                                    <input type="text" value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value.toUpperCase()})} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Method / Category</label>
                                <input type="text" value={formData.method} onChange={e => setFormData({...formData, method: e.target.value})} placeholder="Bank, Crypto, eWallet" style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Notes</label>
                                <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2} style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', resize: 'vertical' }} />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                                <button type="button" className="pj-btn pj-btn--secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="pj-btn pj-btn--primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
});

export default MoneyJournalTab;
