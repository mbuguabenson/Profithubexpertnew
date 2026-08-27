import React, { useState, useEffect, useCallback } from 'react';
import { localize } from '@deriv-com/translations';
import { DerivAccountWalletService } from '@/services/deriv-account-wallet.service';
import { AccountSwitcherService } from '@/services/account-switcher.service';
import { useStore } from '@/hooks/useStore';
import { formatMoney, addComma } from '@/components/shared';
import { getAccountsList } from '@/utils/token-bridge';
import './account-management.scss';

interface AccountManagementProps {
    currency: string;
    activeLoginid: string;
}

export const AccountManagement: React.FC<AccountManagementProps> = ({ currency, activeLoginid }) => {
    const { client } = useStore() ?? {};
    const [currentLoginId, setCurrentLoginId] = useState<string>(activeLoginid || localStorage.getItem('active_loginid') || '');
    const [nickname, setNickname] = useState<string>('');
    const [settings, setSettings] = useState<any>(null);
    const [status, setStatus] = useState<any>(null);
    const [markupStats, setMarkupStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [activeSection, setActiveSection] = useState<'profile' | 'linked' | 'markup' | 'security'>('profile');

    const accountsMap = getAccountsList();
    const isVirtual = currentLoginId.startsWith('VRTC') || currentLoginId.startsWith('VRT');

    const loadAccountData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [nick, sett, stat, markup] = await Promise.all([
                DerivAccountWalletService.getAccountNickname(),
                DerivAccountWalletService.getAccountSettings(),
                DerivAccountWalletService.getAccountStatus(),
                DerivAccountWalletService.getMarkupStatistics(),
            ]);
            setNickname(nick || currentLoginId);
            setSettings(sett);
            setStatus(stat);
            setMarkupStats(markup);
        } catch (err) {
            console.error('[AccountManagement] error loading data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [currentLoginId]);

    useEffect(() => {
        const nextId = activeLoginid || localStorage.getItem('active_loginid') || '';
        setCurrentLoginId(nextId);
    }, [activeLoginid]);

    useEffect(() => {
        loadAccountData();
    }, [loadAccountData]);

    useEffect(() => {
        const handleAccountSwitch = (e: any) => {
            const newId = e?.detail?.loginid || localStorage.getItem('active_loginid') || '';
            setCurrentLoginId(newId);
            loadAccountData();
        };
        window.addEventListener('account_switched', handleAccountSwitch);
        return () => window.removeEventListener('account_switched', handleAccountSwitch);
    }, [loadAccountData]);

    const linkedAccounts = Object.keys(accountsMap).map(id => ({
        id,
        isDemo: id.startsWith('VR'),
        isActive: id === currentLoginId,
    }));

    return (
        <div className="account-management">
            {/* ── Top Header ── */}
            <div className="am-header">
                <div>
                    <h2 className="am-header__title">{localize('Account Settings & Security')}</h2>
                    <p className="am-header__subtitle">
                        {localize('Review your Deriv account details, verification status, linked wallets and permissions')}
                    </p>
                </div>
                <div className="am-header__actions">
                    <button
                        className={`am-btn am-btn--secondary ${isLoading ? 'am-btn--loading' : ''}`}
                        onClick={loadAccountData}
                        disabled={isLoading}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        <span>{isLoading ? localize('Syncing...') : localize('Refresh')}</span>
                    </button>
                </div>
            </div>

            {/* ── Sub Navigation Pills ── */}
            <div className="am-nav-pills">
                <button
                    className={`am-nav-pill ${activeSection === 'profile' ? 'am-nav-pill--active' : ''}`}
                    onClick={() => setActiveSection('profile')}
                >
                    {localize('Profile & Identity')}
                </button>
                <button
                    className={`am-nav-pill ${activeSection === 'linked' ? 'am-nav-pill--active' : ''}`}
                    onClick={() => setActiveSection('linked')}
                >
                    {localize('Linked Accounts')} ({linkedAccounts.length})
                </button>
                <button
                    className={`am-nav-pill ${activeSection === 'markup' ? 'am-nav-pill--active' : ''}`}
                    onClick={() => setActiveSection('markup')}
                >
                    {localize('Markup Statistics')}
                </button>
                <button
                    className={`am-nav-pill ${activeSection === 'security' ? 'am-nav-pill--active' : ''}`}
                    onClick={() => setActiveSection('security')}
                >
                    {localize('API Scopes')}
                </button>
            </div>

            {/* ── 1. Profile & KYC Verification ── */}
            {activeSection === 'profile' && (
                <div className="am-profile-grid">
                    {/* User Identity Card */}
                    <div className="am-card">
                        <div className="am-card__header">
                            <h3>{localize('Account Profile')}</h3>
                            <span className="pa-tag pa-tag--muted">
                                {isVirtual ? localize('Demo Account') : localize('Real Account')}
                            </span>
                        </div>

                        <div className="am-profile-hero">
                            <div className="am-profile-hero__avatar">
                                {(nickname || activeLoginid || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="am-profile-hero__details">
                                <span className="am-profile-hero__name">{nickname || 'Deriv Trader'}</span>
                                <span className="am-profile-hero__id">{activeLoginid}</span>
                            </div>
                        </div>

                        <div className="am-info-list">
                            <div className="am-info-row">
                                <span className="am-info-row__label">{localize('Email Address')}</span>
                                <span className="am-info-row__val">{settings?.email || '—'}</span>
                            </div>
                            <div className="am-info-row">
                                <span className="am-info-row__label">{localize('Country of Residence')}</span>
                                <span className="am-info-row__val">{settings?.country || settings?.country_code || '—'}</span>
                            </div>
                            <div className="am-info-row">
                                <span className="am-info-row__label">{localize('Account Currency')}</span>
                                <span className="am-info-row__val">{currency}</span>
                            </div>
                        </div>
                    </div>

                    {/* KYC Verification Card */}
                    <div className="am-card">
                        <div className="am-card__header">
                            <h3>{localize('Verification & KYC Status')}</h3>
                            <span className={`pa-tag ${status?.status?.includes('authenticated') || isVirtual ? 'pa-tag--success' : 'pa-tag--warning'}`}>
                                {status?.status?.includes('authenticated') || isVirtual ? localize('VERIFIED') : localize('PENDING')}
                            </span>
                        </div>
                        <div className="am-kyc-grid">
                            <div className="am-kyc-tile">
                                <span className="am-kyc-tile__title">{localize('Identity (POI)')}</span>
                                <span className={`am-kyc-tile__status ${status?.authentication?.identity?.status === 'verified' || isVirtual ? 'am-kyc-tile__status--verified' : 'am-kyc-tile__status--pending'}`}>
                                    {status?.authentication?.identity?.status === 'verified' || isVirtual ? '● Verified' : '○ Pending'}
                                </span>
                            </div>
                            <div className="am-kyc-tile">
                                <span className="am-kyc-tile__title">{localize('Address (POA)')}</span>
                                <span className={`am-kyc-tile__status ${status?.authentication?.document?.status === 'verified' || isVirtual ? 'am-kyc-tile__status--verified' : 'am-kyc-tile__status--pending'}`}>
                                    {status?.authentication?.document?.status === 'verified' || isVirtual ? '● Verified' : '○ Pending'}
                                </span>
                            </div>
                            <div className="am-kyc-tile">
                                <span className="am-kyc-tile__title">{localize('Risk Profile')}</span>
                                <span className="am-kyc-tile__status am-kyc-tile__status--verified">
                                    {(status?.risk_classification || 'COMPLETED').toUpperCase()}
                                </span>
                            </div>
                            <div className="am-kyc-tile">
                                <span className="am-kyc-tile__title">{localize('Session Auth')}</span>
                                <span className="am-kyc-tile__status am-kyc-tile__status--verified">
                                    ● OAuth 2.0
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 2. Linked Accounts Hub ── */}
            {activeSection === 'linked' && (
                <div className="am-card">
                    <div className="am-card__header">
                        <h3>{localize('Linked Deriv Accounts')}</h3>
                        <span className="pa-tag pa-tag--muted">{linkedAccounts.length} {localize('Accounts')}</span>
                    </div>
                    <div className="am-linked-list">
                        {linkedAccounts.map(acc => (
                            <div key={acc.id} className={`am-linked-item ${acc.isActive ? 'am-linked-item--active' : ''}`}>
                                <div>
                                    <span className="am-linked-item__id">{acc.id}</span>
                                    <div className="am-linked-item__type">
                                        {acc.isDemo ? localize('Demo Account • Virtual Currency') : localize('Real Account • Fiat Currency')}
                                    </div>
                                </div>
                                <div>
                                    {acc.isActive ? (
                                        <span className="pa-tag pa-tag--success">● {localize('ACTIVE')}</span>
                                    ) : (
                                        <button
                                            className="wm-btn wm-btn--secondary"
                                            onClick={async () => {
                                                await AccountSwitcherService.switchAccount(acc.id, client);
                                                setCurrentLoginId(acc.id);
                                                loadAccountData();
                                            }}
                                        >
                                            {localize('Switch Account')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── 3. Markup Statistics ── */}
            {activeSection === 'markup' && (
                <div className="am-card">
                    <div className="am-card__header">
                        <h3>{localize('App Markup & Commissions')}</h3>
                    </div>

                    {markupStats && (markupStats.total_turnover > 0 || (markupStats.breakdown && markupStats.breakdown.length > 0)) ? (
                        <div className="am-markup-grid">
                            <div className="am-markup-card">
                                <span className="am-markup-card__label">{localize('Total Turnover')}</span>
                                <h3 className="am-markup-card__val">${formatMoney('USD', markupStats?.total_turnover || 0, true)}</h3>
                            </div>
                            <div className="am-markup-card">
                                <span className="am-markup-card__label">{localize('Total Commission')}</span>
                                <h3 className="am-markup-card__val am-markup-card__val--green">${formatMoney('USD', markupStats?.total_markup || 0, true)}</h3>
                            </div>
                            <div className="am-markup-card">
                                <span className="am-markup-card__label">{localize('Transactions')}</span>
                                <h3 className="am-markup-card__val">{addComma(markupStats?.total_transactions || 0)}</h3>
                            </div>
                        </div>
                    ) : (
                        <div className="pa-empty-state">
                            <div className="pa-empty-state__icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <line x1="18" y1="20" x2="18" y2="10" />
                                    <line x1="12" y1="20" x2="12" y2="4" />
                                    <line x1="6" y1="20" x2="6" y2="14" />
                                </svg>
                            </div>
                            <h4 className="pa-empty-state__title">{localize('Standard Trading Account')}</h4>
                            <p className="pa-empty-state__description">
                                {localize('Developer markup commissions will appear here when registered as an official Deriv App partner.')}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ── 4. API Token Scopes ── */}
            {activeSection === 'security' && (
                <div className="am-card">
                    <div className="am-card__header">
                        <h3>{localize('Active API Token Permissions')}</h3>
                    </div>
                    <div className="am-token-badges">
                        {['read', 'trade', 'payments', 'trading_information', 'admin'].map(scope => (
                            <span key={scope} className="am-token-badge">
                                ✓ {scope.toUpperCase()}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountManagement;
