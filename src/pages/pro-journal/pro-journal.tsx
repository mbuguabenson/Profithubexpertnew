import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import { generateOAuthURL } from '@/components/shared';
import Button from '@/components/shared_ui/button';
import './pro-journal.scss';

// Import components (to be implemented)
import OverviewTab from './components/OverviewTab';
import AccountInfoTab from './components/AccountInfoTab';
import MoneyJournalTab from './components/MoneyJournalTab';
import CompoundingJournalTab from './components/CompoundingJournalTab';
import TradeJournalTab from './components/TradeJournalTab';
import StrategyPerformanceTab from './components/StrategyPerformanceTab';
import SessionJournalTab from './components/SessionJournalTab';
import ChartsTab from './components/ChartsTab';
import TransactionLedgerTab from './components/TransactionLedgerTab';
import AuditLogTab from './components/AuditLogTab';

import { ExternalAccountAdapter } from './services/journal-storage';
import { IAccountProfile } from './services/journal-types';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';

type PJActiveTab = 
    | 'overview' 
    | 'account_info' 
    | 'money_journal' 
    | 'compounding' 
    | 'trade_journal' 
    | 'strategy_performance' 
    | 'session_journal' 
    | 'charts' 
    | 'ledger' 
    | 'audit_log';

const ProJournal = observer(() => {
    const { activeLoginid, setIsAuthorizing, connectionStatus } = useApiBase();
    const { client } = useStore();
    const [activeSubTab, setActiveSubTab] = useState<PJActiveTab>('overview');
    const [accountProfile, setAccountProfile] = useState<IAccountProfile | null>(null);

    useEffect(() => {
        if (activeLoginid) {
            setAccountProfile(
                ExternalAccountAdapter.getAccountProfile(
                    activeLoginid,
                    client?.currency || 'USD',
                    client?.balance || 0,
                    client?.is_virtual || false,
                    connectionStatus === CONNECTION_STATUS.OPENED
                )
            );
        }
    }, [activeLoginid, client?.currency, client?.balance, client?.is_virtual, connectionStatus]);


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
            <div className='pj-container pj-container--unauthenticated'>
                <div className='pj-login-card'>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pj-login-icon">
                        <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <path d="M2 15h10"></path>
                        <path d="m9 18 3-3-3-3"></path>
                    </svg>
                    <h2><Localize i18n_default_text='Authentication Required' /></h2>
                    <p><Localize i18n_default_text='Log in securely to access your Pro Compounding Journal and Paper Trading records.' /></p>
                    <Button primary large onClick={handleLogin}>
                        <Localize i18n_default_text='Log in securely via Deriv' />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className='pj-container pj-container--authenticated'>
            <div className='pj-sidebar'>
                <div className='pj-sidebar-header'>
                    <h3><Localize i18n_default_text='Pro Journal' /></h3>
                </div>
                <ul className='pj-nav'>
                    <li className={activeSubTab === 'overview' ? 'active' : ''} onClick={() => setActiveSubTab('overview')}>
                         📊 <Localize i18n_default_text='Account Overview' />
                    </li>
                    <li className={activeSubTab === 'account_info' ? 'active' : ''} onClick={() => setActiveSubTab('account_info')}>
                         ℹ️ <Localize i18n_default_text='Account Information' />
                    </li>
                    <li className={activeSubTab === 'money_journal' ? 'active' : ''} onClick={() => setActiveSubTab('money_journal')}>
                         💰 <Localize i18n_default_text='Money Journal' />
                    </li>
                    <li className={activeSubTab === 'compounding' ? 'active' : ''} onClick={() => setActiveSubTab('compounding')}>
                         🚀 <Localize i18n_default_text='Compounding Challenge' />
                    </li>
                    <li className={activeSubTab === 'trade_journal' ? 'active' : ''} onClick={() => setActiveSubTab('trade_journal')}>
                         📝 <Localize i18n_default_text='Paper Trade Journal' />
                    </li>
                    <li className={activeSubTab === 'strategy_performance' ? 'active' : ''} onClick={() => setActiveSubTab('strategy_performance')}>
                         📈 <Localize i18n_default_text='Strategy Performance' />
                    </li>
                    <li className={activeSubTab === 'session_journal' ? 'active' : ''} onClick={() => setActiveSubTab('session_journal')}>
                         📅 <Localize i18n_default_text='Session Journal' />
                    </li>
                    <li className={activeSubTab === 'charts' ? 'active' : ''} onClick={() => setActiveSubTab('charts')}>
                         📉 <Localize i18n_default_text='Progress Charts' />
                    </li>
                    <li className={activeSubTab === 'ledger' ? 'active' : ''} onClick={() => setActiveSubTab('ledger')}>
                         🧾 <Localize i18n_default_text='Transaction Ledger' />
                    </li>
                    <li className={activeSubTab === 'audit_log' ? 'active' : ''} onClick={() => setActiveSubTab('audit_log')}>
                         🔒 <Localize i18n_default_text='Audit Log' />
                    </li>
                </ul>
            </div>
            
            <div className='pj-content'>
                <div className='pj-header-strip'>
                    <div className='pj-user-badge'>
                        <span className='badge-type'>{client?.is_virtual ? 'Demo' : 'Real'}</span>
                        <span className='badge-id'>{activeLoginid}</span>
                        <span className={`badge-status ${connectionStatus === CONNECTION_STATUS.OPENED ? 'connected' : 'disconnected'}`}>
                            {connectionStatus === CONNECTION_STATUS.OPENED ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </div>

                <div className='pj-main-area'>
                    {activeSubTab === 'overview' && accountProfile && <OverviewTab accountProfile={accountProfile} />}
                    {activeSubTab === 'account_info' && accountProfile && <AccountInfoTab accountProfile={accountProfile} />}
                    {activeSubTab === 'money_journal' && <MoneyJournalTab />}
                    {activeSubTab === 'compounding' && <CompoundingJournalTab />}
                    {activeSubTab === 'trade_journal' && <TradeJournalTab />}
                    {activeSubTab === 'strategy_performance' && <StrategyPerformanceTab />}
                    {activeSubTab === 'session_journal' && <SessionJournalTab />}
                    {activeSubTab === 'charts' && <ChartsTab />}
                    {activeSubTab === 'ledger' && <TransactionLedgerTab />}
                    {activeSubTab === 'audit_log' && <AuditLogTab />}
                </div>
            </div>
        </div>
    );
});

export default ProJournal;
