import React, { useEffect, useState } from 'react';
import { getAccountsList, getActiveLoginId, resolveValidDerivWSToken } from '@/utils/token-bridge';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

const mask = (s?: string | null) => (s ? `${String(s).slice(0, 8)}…` : '—');

const TokenDebugPanel: React.FC = () => {
    const [resolvedTokenPrefix, setResolvedTokenPrefix] = useState<string>('');
    const [accountsListKeys, setAccountsListKeys] = useState<string[]>([]);
    const [storedDerivAccountsCount, setStoredDerivAccountsCount] = useState<number | null>(null);
    const [authInfoPresent, setAuthInfoPresent] = useState<boolean | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const accounts = getAccountsList();
                setAccountsListKeys(Object.keys(accounts));

                const stored = DerivWSAccountsService.getStoredAccounts();
                setStoredDerivAccountsCount(stored ? stored.length : 0);

                const authInfo = OAuthTokenExchangeService.getAuthInfo?.() || null;
                setAuthInfoPresent(!!authInfo?.access_token);

                const activeId = getActiveLoginId();
                const token = await resolveValidDerivWSToken(activeId);
                setResolvedTokenPrefix(token ? mask(token) : '');
            } catch (e) {
                // ignore
            }
        })();
    }, []);

    return (
        <div style={{
            position: 'absolute',
            right: '1rem',
            top: '1rem',
            zIndex: 2000,
            background: 'rgba(0,0,0,0.75)',
            color: 'white',
            padding: '0.6rem 0.8rem',
            borderRadius: '6px',
            fontSize: '12px',
            lineHeight: '1.2',
            maxWidth: '360px',
        }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>DEBUG: Token / Accounts</div>
            <div>active_loginid: {mask(getActiveLoginId() || '')}</div>
            <div>accountsList keys: {accountsListKeys.length ? accountsListKeys.join(', ') : 'none'}</div>
            <div>deriv_accounts (session): {storedDerivAccountsCount ?? 'unknown'}</div>
            <div>auth_info present: {authInfoPresent === null ? 'loading' : authInfoPresent ? 'yes' : 'no'}</div>
            <div>resolved token prefix: {resolvedTokenPrefix || 'none'}</div>
            <div style={{ marginTop: 6, opacity: 0.9, fontSize: 11 }}>Temporary debug panel — remove after diagnosing</div>
        </div>
    );
};

export default TokenDebugPanel;
