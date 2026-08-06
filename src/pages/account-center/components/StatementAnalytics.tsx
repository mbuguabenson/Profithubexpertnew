import { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { Localize } from '@deriv-com/translations';
import { api_base } from '@/external/bot-skeleton';
import dayjs from 'dayjs';

type TFilter = 'today' | '7days' | '30days' | '3months' | '1year' | 'all';

const StatementAnalytics = observer(() => {
    const { activeLoginid } = useApiBase();
    const [statement, setStatement] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<TFilter>('30days');

    useEffect(() => {
        const fetchStatement = async () => {
            if (!activeLoginid) return;
            setIsLoading(true);
            try {
                // Fetch recent statement
                const response = await api_base.api.send({ statement: 1, description: 1, limit: 1000 });
                if (response?.statement?.transactions) {
                    setStatement(response.statement.transactions);
                }
            } catch (err) {
                console.error("Failed to fetch statement:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStatement();
    }, [activeLoginid]);

    const filteredTransactions = useMemo(() => {
        const now = dayjs();
        return statement.filter(tx => {
            const txDate = dayjs.unix(tx.transaction_time);
            switch (filter) {
                case 'today': return txDate.isSame(now, 'day');
                case '7days': return txDate.isAfter(now.subtract(7, 'day'));
                case '30days': return txDate.isAfter(now.subtract(30, 'day'));
                case '3months': return txDate.isAfter(now.subtract(3, 'month'));
                case '1year': return txDate.isAfter(now.subtract(1, 'year'));
                default: return true;
            }
        });
    }, [statement, filter]);

    const analytics = useMemo(() => {
        let deposits = 0;
        let withdrawals = 0;
        let pnl = 0;
        let transfers = 0;

        filteredTransactions.forEach(tx => {
            const amt = Number(tx.amount);
            if (tx.action_type === 'deposit') deposits += amt;
            else if (tx.action_type === 'withdrawal') withdrawals += Math.abs(amt);
            else if (tx.action_type === 'transfer') transfers += Math.abs(amt);
            else if (['buy', 'sell'].includes(tx.action_type)) {
                pnl += amt; // Buy is negative, Sell is positive. Sum is net PnL.
            }
        });

        return { deposits, withdrawals, pnl, transfers };
    }, [filteredTransactions]);

    return (
        <div className='statement-analytics'>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-prominent)' }}><Localize i18n_default_text='Statement Analytics' /></h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['today', '7days', '30days', '3months', '1year', 'all'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f as TFilter)}
                            style={{
                                padding: '6px 12px',
                                background: filter === f ? 'var(--brand-red-coral)' : 'var(--general-section-1)',
                                color: filter === f ? '#fff' : 'var(--text-general)',
                                border: '1px solid var(--border-normal)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            {f.replace('days', ' Days').replace('months', ' Months').replace('year', ' Year').replace('today', 'Today').replace('all', 'All Time')}
                        </button>
                    ))}
                </div>
            </div>

            <div className='account-overview__kpi-grid' style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}>TOTAL DEPOSITS</h4>
                    <h2 style={{ margin: '0', fontSize: '1.5rem', color: '#10b981' }}>{analytics.deposits.toFixed(2)}</h2>
                </div>
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}>TOTAL WITHDRAWALS</h4>
                    <h2 style={{ margin: '0', fontSize: '1.5rem', color: '#f43f5e' }}>{analytics.withdrawals.toFixed(2)}</h2>
                </div>
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}>NET REVENUE (P&L)</h4>
                    <h2 style={{ margin: '0', fontSize: '1.5rem', color: analytics.pnl >= 0 ? '#10b981' : '#f43f5e' }}>
                        {analytics.pnl >= 0 ? '+' : ''}{analytics.pnl.toFixed(2)}
                    </h2>
                </div>
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}>TOTAL TRANSFERS</h4>
                    <h2 style={{ margin: '0', fontSize: '1.5rem', color: '#3b82f6' }}>{analytics.transfers.toFixed(2)}</h2>
                </div>
            </div>

            <div className='portfolio-table-wrapper' style={{ overflowX: 'auto', background: 'var(--general-section-1)', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-normal)', background: 'rgba(0,0,0,0.1)' }}>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Date</th>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Ref. ID</th>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Action</th>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Amount</th>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Balance After</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center' }}>Loading...</td></tr>
                        ) : filteredTransactions.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center' }}>No transactions found for this period.</td></tr>
                        ) : (
                            filteredTransactions.map((tx, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-normal)' }}>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{dayjs.unix(tx.transaction_time).format('YYYY-MM-DD HH:mm')}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{tx.reference_id || tx.transaction_id}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem', textTransform: 'capitalize' }}>{tx.action_type}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem', color: Number(tx.amount) >= 0 ? '#10b981' : '#f43f5e', fontWeight: 600 }}>
                                        {Number(tx.amount) > 0 ? '+' : ''}{Number(tx.amount).toFixed(2)}
                                    </td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{Number(tx.balance_after).toFixed(2)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default StatementAnalytics;
