import { observer } from 'mobx-react-lite';
import { IAccountProfile } from '../services/journal-types';

interface IAccountInfoTabProps {
    accountProfile: IAccountProfile;
}

const AccountInfoTab = observer(({ accountProfile }: IAccountInfoTabProps) => {

    const handleRefresh = () => {
        // Will trigger re-render due to activeLoginId dependency in parent
        window.dispatchEvent(new Event('resize')); // hacky way to force some updates if needed, or better, just toast
        alert("Account sync requested."); 
    };

    const handleExport = () => {
        // We'll implement export in the Audit or settings, but can trigger it here
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(accountProfile, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `account_${accountProfile.account_id}_info.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    return (
        <div className="pj-account-info-tab">
            <div className="pj-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
                    <h3 style={{ margin: 0, color: '#f8fafc' }}>Account Information</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="pj-btn pj-btn--secondary" onClick={handleRefresh}>Sync Data</button>
                        <button className="pj-btn pj-btn--secondary" onClick={handleExport}>Export</button>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                    <InfoRow label="Account ID" value={accountProfile.account_id} />
                    <InfoRow label="Currency" value={accountProfile.currency} />
                    
                    <InfoRow label="Account Type" value={
                        <span style={{
                            padding: '4px 10px',
                            background: accountProfile.is_virtual ? '#6366f1' : '#10b981',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#fff',
                            textTransform: 'uppercase'
                        }}>
                            {accountProfile.account_type}
                        </span>
                    } />
                    
                    <InfoRow label="Status" value={accountProfile.account_status} />
                    <InfoRow label="Country/Region" value={accountProfile.country} />
                    <InfoRow label="Registration Date" value={accountProfile.created_date} />
                    
                    <InfoRow label="Connection Status" value={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                background: accountProfile.connection_status === 'connected' ? '#10b981' : '#ef4444' 
                            }} />
                            <span style={{ textTransform: 'capitalize' }}>{accountProfile.connection_status}</span>
                        </div>
                    } />
                    <InfoRow label="Data Source" value={accountProfile.data_source} />
                    
                    <div style={{ gridColumn: 'span 2' }}>
                        <InfoRow label="Last Synchronization" value={new Date(accountProfile.last_sync).toLocaleString()} />
                    </div>
                </div>

                <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem' }}>
                    <strong>Security Notice:</strong> This dashboard intentionally masks or omits sensitive API tokens and passwords. Do not share your screen if full account IDs are visible.
                </div>
            </div>
        </div>
    );
});

const InfoRow = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        <span style={{ fontSize: '1rem', color: '#f1f5f9', fontWeight: 500 }}>{value}</span>
    </div>
);

export default AccountInfoTab;
