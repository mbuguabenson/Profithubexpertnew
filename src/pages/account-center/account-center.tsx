import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import { generateOAuthURL } from '@/components/shared';
import Button from '@/components/shared_ui/button';
import './account-center.scss';

// Import components (to be built)
import Overview from './components/Overview.tsx';
import StatementAnalytics from './components/StatementAnalytics.tsx';
import PerformanceJourney from './components/PerformanceJourney.tsx';
import MarkupStatistics from './components/MarkupStatistics.tsx';

const AccountCenter = observer(() => {
    const { activeLoginid, setIsAuthorizing } = useApiBase();
    const { client } = useStore();
    const [activeSubTab, setActiveSubTab] = useState<'overview' | 'statement' | 'performance' | 'markup'>('overview');

    const handleLogin = async () => {
        try {
            setIsAuthorizing(true);
            const oauthUrl = await generateOAuthURL();
            if (oauthUrl) {
                window.location.replace(oauthUrl);
            }
        } catch (error) {
            setIsAuthorizing(false);
        }
    };

    if (!activeLoginid) {
        return (
            <div className='account-center account-center--unauthenticated'>
                <div className='account-center__login-card'>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="account-center__login-icon">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <h2><Localize i18n_default_text='Authentication Required' /></h2>
                    <p><Localize i18n_default_text='Log in with your Deriv account to view your Account Dashboard, Statement Analytics, and Performance Journey.' /></p>
                    <Button primary large onClick={handleLogin}>
                        <Localize i18n_default_text='Log in securely via Deriv' />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className='account-center account-center--authenticated'>
            <div className='account-center__sidebar'>
                <div className='account-center__sidebar-header'>
                    <h3><Localize i18n_default_text='Account Center' /></h3>
                </div>
                <ul className='account-center__nav'>
                    <li className={activeSubTab === 'overview' ? 'active' : ''} onClick={() => setActiveSubTab('overview')}>
                        <Localize i18n_default_text='Overview & Balances' />
                    </li>
                    <li className={activeSubTab === 'statement' ? 'active' : ''} onClick={() => setActiveSubTab('statement')}>
                        <Localize i18n_default_text='Statement & Transactions' />
                    </li>
                    <li className={activeSubTab === 'performance' ? 'active' : ''} onClick={() => setActiveSubTab('performance')}>
                        <Localize i18n_default_text='Performance Analytics' />
                    </li>
                    <li className={activeSubTab === 'markup' ? 'active markup-admin-tab' : 'markup-admin-tab'} onClick={() => setActiveSubTab('markup')}>
                        <Localize i18n_default_text='Markup Statistics' />
                    </li>
                </ul>
            </div>
            
            <div className='account-center__content'>
                <div className='account-center__header-strip'>
                    <div className='account-center__user-badge'>
                        <span className='badge-type'>{client?.is_virtual ? 'Demo' : 'Real'} Account</span>
                        <span className='badge-id'>{activeLoginid}</span>
                    </div>
                </div>

                <div className='account-center__main-area'>
                    {activeSubTab === 'overview' && <Overview />}
                    {activeSubTab === 'statement' && <StatementAnalytics />}
                    {activeSubTab === 'performance' && <PerformanceJourney />}
                    {activeSubTab === 'markup' && <MarkupStatistics />}
                </div>
            </div>
        </div>
    );
});

export default AccountCenter;
