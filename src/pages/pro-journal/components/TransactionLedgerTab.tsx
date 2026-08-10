import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ILedgerEntry, LedgerEntryType } from '../services/journal-types';
import { getLedger, rebuildLedger } from '../services/journal-storage';

const TransactionLedgerTab = observer(() => {
    const [ledger, setLedger] = useState<ILedgerEntry[]>([]);
    
    const loadData = () => {
        // Ensure ledger is up to date with trades/deposits before showing
        const data = rebuildLedger();
        // Ledger is stored oldest first to build running balance, so we reverse it for display
        setLedger([...data].reverse());
    };

    useEffect(() => {
        loadData();
    }, []);

    const formatMoney = (amount: number) => {
        if (amount === 0) return '-';
        return amount.toFixed(2);
    };

    return (
        <div className="pj-ledger-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc' }}>Transaction Ledger</h3>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                        Unified chronological record of all balance-changing events. Auto-generated.
                    </p>
                </div>
                <button className="pj-btn pj-btn--secondary" onClick={loadData}>↻ Refresh Ledger</button>
            </div>

            <div className="pj-table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Reference</th>
                            <th>Description</th>
                            <th style={{ textAlign: 'right' }}>Credit (In)</th>
                            <th style={{ textAlign: 'right' }}>Debit (Out)</th>
                            <th style={{ textAlign: 'right', background: 'rgba(0,0,0,0.3)' }}>Running Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ledger.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No ledger entries found.</td></tr>
                        ) : (
                            ledger.map(entry => {
                                const isCredit = entry.credit > 0;
                                const isDebit = entry.debit > 0;
                                
                                let typeColor = '#cbd5e1';
                                let typeBg = 'transparent';
                                switch(entry.type) {
                                    case LedgerEntryType.STARTING_CAPITAL: typeColor = '#8b5cf6'; typeBg = 'rgba(139, 92, 246, 0.15)'; break;
                                    case LedgerEntryType.DEPOSIT: typeColor = '#3b82f6'; typeBg = 'rgba(59, 130, 246, 0.15)'; break;
                                    case LedgerEntryType.WITHDRAWAL: typeColor = '#f59e0b'; typeBg = 'rgba(245, 158, 11, 0.15)'; break;
                                    case LedgerEntryType.JOURNAL_PROFIT: typeColor = '#10b981'; typeBg = 'rgba(16, 185, 129, 0.15)'; break;
                                    case LedgerEntryType.JOURNAL_LOSS: typeColor = '#ef4444'; typeBg = 'rgba(239, 68, 68, 0.15)'; break;
                                }

                                return (
                                    <tr key={entry.id}>
                                        <td style={{ fontSize: '0.85rem' }}>{entry.date.replace('T', ' ')}</td>
                                        <td>
                                            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', color: typeColor, background: typeBg, border: `1px solid ${typeColor}40` }}>
                                                {entry.type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.85rem', color: '#64748b' }}>{entry.reference}</td>
                                        <td style={{ fontSize: '0.9rem' }}>{entry.description}</td>
                                        <td style={{ textAlign: 'right', color: isCredit ? '#10b981' : '#cbd5e1', fontWeight: isCredit ? 600 : 400 }}>
                                            {isCredit ? '+' : ''}{formatMoney(entry.credit)}
                                        </td>
                                        <td style={{ textAlign: 'right', color: isDebit ? '#ef4444' : '#cbd5e1', fontWeight: isDebit ? 600 : 400 }}>
                                            {isDebit ? '-' : ''}{formatMoney(entry.debit)}
                                        </td>
                                        <td style={{ textAlign: 'right', background: 'rgba(0,0,0,0.1)', fontWeight: 700, color: '#f8fafc' }}>
                                            {entry.balance.toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default TransactionLedgerTab;
