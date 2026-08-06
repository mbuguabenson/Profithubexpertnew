import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { Localize } from '@deriv-com/translations';
import dayjs from 'dayjs';
import { getAppId } from '@/components/shared'; // Or standard derivation

const MarkupStatistics = observer(() => {
    const { activeLoginid } = useApiBase();
    const [isLoading, setIsLoading] = useState(true);
    const [isForbidden, setIsForbidden] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [statistics, setStatistics] = useState<any>(null);

    useEffect(() => {
        const fetchMarkupStats = async () => {
            if (!activeLoginid) return;
            setIsLoading(true);
            setIsForbidden(false);
            
            try {
                // Find the token for the active account (from localStorage as per deriv standard)
                const accountListRaw = localStorage.getItem('client.accounts');
                let token = '';
                if (accountListRaw) {
                    const accounts = JSON.parse(accountListRaw);
                    token = accounts[activeLoginid]?.token || '';
                }

                if (!token) {
                    throw new Error("No token found");
                }

                const appId = getAppId();
                const dateFrom = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
                const dateTo = dayjs().format('YYYY-MM-DD');
                
                const response = await fetch(`https://api.derivws.com/applications/v1/markup-statistics?date_from=${dateFrom}&date_to=${dateTo}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Deriv-App-ID': appId.toString(),
                        'Content-Type': 'application/json'
                    }
                });

                if (response.status === 403 || response.status === 401) {
                    setIsForbidden(true);
                    return;
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData?.errors?.[0]?.message || 'Failed to fetch markup statistics');
                }

                const data = await response.json();
                setStatistics(data);

            } catch (err: any) {
                console.error("Markup API error:", err);
                setErrorMsg(err.message || 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        };

        fetchMarkupStats();
    }, [activeLoginid]);

    if (isLoading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Markup Statistics...</div>;
    }

    if (isForbidden) {
        return (
            <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid #f43f5e', padding: '30px', borderRadius: '12px', textAlign: 'center', marginTop: '20px' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '15px' }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <h3 style={{ color: '#f43f5e', margin: '0 0 10px 0' }}>Access Denied</h3>
                <p style={{ color: 'var(--text-prominent)', margin: 0 }}>Markup statistics are available only to the owner of this registered application.</p>
            </div>
        );
    }

    if (errorMsg) {
        return (
            <div style={{ padding: '30px', textAlign: 'center', color: '#f59e0b' }}>
                Error: {errorMsg}
            </div>
        );
    }

    return (
        <div className='markup-statistics'>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-prominent)' }}><Localize i18n_default_text='Application Markup Statistics' /></h3>
            <div style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                <p style={{ color: 'var(--text-less-prominent)' }}>Data for the last 30 days is synchronized securely.</p>
                <pre style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', overflowX: 'auto', color: 'var(--brand-secondary)' }}>
                    {JSON.stringify(statistics, null, 2)}
                </pre>
            </div>
        </div>
    );
});

export default MarkupStatistics;
