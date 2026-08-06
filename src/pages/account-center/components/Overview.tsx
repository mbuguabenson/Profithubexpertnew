import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useApiBase } from '@/hooks/useApiBase';
import { Localize } from '@deriv-com/translations';
import { api_base } from '@/external/bot-skeleton';

const Overview = observer(() => {
    const { client } = useStore();
    const { activeLoginid } = useApiBase();
    const [portfolio, setPortfolio] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchPortfolio = async () => {
            if (!activeLoginid) return;
            try {
                const response = await api_base.api.send({ portfolio: 1 });
                if (response?.portfolio?.contracts) {
                    setPortfolio(response.portfolio.contracts);
                }
            } catch (err) {
                console.error("Failed to fetch portfolio:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPortfolio();
    }, [activeLoginid]);

    return (
        <div className='account-overview'>
            <div className='account-overview__kpi-grid' style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}><Localize i18n_default_text='Available Balance' /></h4>
                    <h2 style={{ margin: '0', fontSize: '2rem', color: 'var(--text-prominent)' }}>
                        {client?.balance || '0.00'} <span style={{ fontSize: '1rem', color: 'var(--text-less-prominent)' }}>{client?.currency || 'USD'}</span>
                    </h2>
                </div>
                
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}><Localize i18n_default_text='Account Nickname' /></h4>
                    <h2 style={{ margin: '0', fontSize: '1.5rem', color: 'var(--text-general)' }}>
                        {client?.is_virtual ? 'Demo Account' : 'Deriv Real Account'}
                    </h2>
                </div>

                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}><Localize i18n_default_text='Open Contracts' /></h4>
                    <h2 style={{ margin: '0', fontSize: '2rem', color: 'var(--text-prominent)' }}>
                        {isLoading ? '...' : portfolio.length}
                    </h2>
                </div>
            </div>

            <h3 style={{ marginBottom: '15px', color: 'var(--text-prominent)' }}><Localize i18n_default_text='Portfolio (Open Positions)' /></h3>
            {isLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-less-prominent)' }}>Loading portfolio...</div>
            ) : portfolio.length === 0 ? (
                <div style={{ background: 'var(--general-section-1)', padding: '40px', borderRadius: '12px', border: '1px solid var(--border-normal)', textAlign: 'center', color: 'var(--text-less-prominent)' }}>
                    No open contracts found.
                </div>
            ) : (
                <div className='portfolio-table-wrapper' style={{ overflowX: 'auto', background: 'var(--general-section-1)', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-normal)', background: 'rgba(0,0,0,0.1)' }}>
                                <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Reference</th>
                                <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Contract Type</th>
                                <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Buy Price</th>
                                <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Payout</th>
                            </tr>
                        </thead>
                        <tbody>
                            {portfolio.map((contract, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-normal)' }}>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{contract.contract_id}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{contract.contract_type}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{contract.buy_price} {contract.currency}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{contract.payout} {contract.currency}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
});

export default Overview;
