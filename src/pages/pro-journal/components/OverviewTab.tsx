import { observer } from 'mobx-react-lite';
import { IAccountProfile } from '../services/journal-types';
import { getJournalOverview } from '../services/journal-storage';
import { useDisplayCurrency } from '@/utils/currency-converter';

interface IOverviewTabProps {
    accountProfile: IAccountProfile;
}

const OverviewTab = observer(({ accountProfile }: IOverviewTabProps) => {
    const { convert } = useDisplayCurrency();
    const overview = getJournalOverview(
        accountProfile.account_id,
        accountProfile.currency,
        accountProfile.balance
    );

    const formatMoney = (amount: number) => {
        const { formatted } = convert(amount, overview.currency || 'USD');
        return formatted;
    };

    const isProfit = overview.total_journal_pl >= 0;

    return (
        <div className="pj-overview-tab">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                
                {/* Balance Card */}
                <div className="pj-card" style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)', borderTop: '3px solid #3b82f6' }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Recorded Journal Balance
                    </h4>
                    <h2 style={{ margin: '0', fontSize: '2.5rem', color: '#f8fafc', fontWeight: 800 }}>
                        {formatMoney(overview.current_balance)}
                    </h2>
                    <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Current Equity (API):</span>
                        <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{formatMoney(overview.current_equity)}</span>
                    </div>
                </div>

                {/* Return Card */}
                <div className="pj-card" style={{ borderTop: `3px solid ${isProfit ? '#10b981' : '#ef4444'}` }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Total Journal P/L
                    </h4>
                    <h2 style={{ margin: '0', fontSize: '2rem', color: isProfit ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {overview.total_journal_pl > 0 ? '+' : ''}{formatMoney(overview.total_journal_pl)}
                    </h2>
                    <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Return:</span>
                        <span style={{ color: isProfit ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            {overview.total_return_percent > 0 ? '+' : ''}{overview.total_return_percent}%
                        </span>
                    </div>
                </div>

                {/* Challenge Progress Card */}
                <div className="pj-card" style={{ borderTop: '3px solid #8b5cf6' }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Compounding Challenge
                    </h4>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#f1f5f9' }}>
                        {overview.current_compounding_cycle}
                    </h3>
                    
                    {overview.challenge_status !== 'none' && (
                        <div style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                                <span>Progress</span>
                                <span>{overview.target_progress_percent}%</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ 
                                    width: `${overview.target_progress_percent}%`, 
                                    height: '100%', 
                                    background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
                                    borderRadius: '4px'
                                }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '6px', color: '#cbd5e1' }}>
                                <span>{formatMoney(overview.starting_capital)}</span>
                                <span>{formatMoney(overview.challenge_target)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <h3 style={{ marginTop: '32px', marginBottom: '16px', color: '#f1f5f9' }}>Cash Flow Breakdown</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <div className="pj-card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Starting Capital</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#f8fafc' }}>{formatMoney(overview.starting_capital)}</div>
                </div>
                <div className="pj-card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Total Deposits</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#10b981' }}>{formatMoney(overview.total_deposits)}</div>
                </div>
                <div className="pj-card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Total Withdrawals</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ef4444' }}>{formatMoney(overview.total_withdrawals)}</div>
                </div>
                <div className="pj-card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Net Deposits</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: overview.net_deposits >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatMoney(overview.net_deposits)}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', color: '#93c5fd', fontSize: '0.9rem', display: 'flex', gap: '12px' }}>
                <span style={{ fontSize: '1.2rem' }}>💡</span>
                <div>
                    <strong>Formula used:</strong> Journal Balance = Starting Capital + Net Deposits + Realized Journal P/L<br/>
                    <em>Note: The Journal Balance is manually tracked via your paper trades and deposits/withdrawals, and may differ from your actual API Current Equity.</em>
                </div>
            </div>
        </div>
    );
});

export default OverviewTab;
