import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import ChunkLoader from '@/components/loader/chunk-loader';
import { useStore } from '@/hooks/useStore';
import { getAppId, generateOAuthURL } from '@/components/shared/utils/config/config';
import { resolveValidDerivWSToken, getAccountsList, getActiveLoginId } from '@/utils/token-bridge';
import './dtrader.scss';

const getInitialLoginId = (): string => {
    try {
        const stored = localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
        if (stored) return stored;
        const list = getAccountsList();
        const keys = Object.keys(list);
        return keys.length > 0 ? keys[0] : '';
    } catch {
        return '';
    }
};

const getInitialToken = (loginid: string): string => {
    try {
        const list = getAccountsList();
        if (loginid && list[loginid] && !list[loginid].startsWith('ory_at_')) {
            return list[loginid];
        }
        for (const k in list) {
            if (list[k] && !list[k].startsWith('ory_at_')) return list[k];
        }
        const direct =
            localStorage.getItem('token') ||
            localStorage.getItem('active_token') ||
            localStorage.getItem('authToken') ||
            localStorage.getItem('token1') ||
            localStorage.getItem('deriv_api_token');
        if (direct && !direct.startsWith('ory_at_')) return direct;
    } catch {}
    return '';
};

/**
 * DTraderPage — embeds the Vercel-hosted DTrader build.
 * Synchronously initializes auth params before rendering iframe to prevent
 * unauthenticated initial loads and avoid regional guest restrictions in Kenya.
 */
const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const initialLoginId = getInitialLoginId() || (client as any)?.loginid || '';
    const [activeLoginId, setActiveLoginId] = useState<string>(initialLoginId);
    const [authToken, setAuthToken] = useState<string>(() => getInitialToken(initialLoginId));
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

    useEffect(() => {
        let mounted = true;

        const loadAuthParams = async () => {
            const storedLoginId =
                localStorage.getItem('active_loginid') ||
                (client as any)?.loginid ||
                activeLoginId ||
                getActiveLoginId();

            const accountsList = getAccountsList();
            let loginId = storedLoginId;
            let token = storedLoginId ? await resolveValidDerivWSToken(storedLoginId) : '';

            if ((!loginId || !token) && Object.keys(accountsList).length > 0) {
                const primaryKey =
                    Object.keys(accountsList).find(id => !id.startsWith('VR')) ||
                    Object.keys(accountsList)[0];
                if (primaryKey) {
                    loginId = loginId || primaryKey;
                    token = token || accountsList[primaryKey] || '';
                }
            }

            if (token && token.startsWith('ory_at_')) {
                token = '';
            }

            if (mounted) {
                if (loginId) setActiveLoginId(loginId);
                if (token) setAuthToken(token);
                setIsAuthReady(true);
            }
        };

        loadAuthParams();
        return () => { mounted = false; };
    }, [client?.loginid]);

    const handleLoginRedirect = useCallback(async () => {
        try {
            const oauthUrl = await generateOAuthURL();
            if (oauthUrl) {
                window.location.href = oauthUrl;
            }
        } catch (e) {
            console.error('Failed to generate login URL:', e);
        }
    }, []);

    const appId = getAppId() || '121856';
    const baseUrl = process.env.DTRADER_URL || 'https://dtraderphub.vercel.app';
    const embedBase = baseUrl.includes('/dtrader')
        ? baseUrl
        : `${baseUrl.replace(/\/$/, '')}/dtrader`;

    const loginId = activeLoginId || (client as any)?.loginid || localStorage.getItem('active_loginid') || '';
    const currency = client?.currency || localStorage.getItem('client.currency') || 'USD';

    const queryParams = new URLSearchParams({
        api_version: 'v2',
        chart_type: 'area',
        interval: '1t',
        symbol: '1HZ100V',
        trade_type: 'accumulator',
        app_id: appId,
        lang: 'EN',
    });

    if (loginId) {
        queryParams.set('acct1', loginId);
        queryParams.set('cur1', currency);
    }

    if (authToken && authToken !== 'a1-guest' && authToken !== 'dummy_token') {
        queryParams.set('token1', authToken);
    }

    // Populate all accounts from accountsList so iframe has full multi-account token map
    try {
        const accountsList = getAccountsList();
        let index = 1;
        for (const accId in accountsList) {
            const accToken = accountsList[accId];
            if (accToken && !accToken.startsWith('ory_at_')) {
                if (accId !== loginId) {
                    index++;
                    queryParams.set(`acct${index}`, accId);
                    queryParams.set(`token${index}`, accToken);
                    queryParams.set(`cur${index}`, currency);
                }
            }
        }
    } catch {}

    const embedUrl = `${embedBase}?${queryParams.toString()}`;

    if (!isAuthReady) {
        return <ChunkLoader message="Loading DTrader Terminal..." />;
    }

    // If user has no active token at all, prompt them to log in to bypass Deriv's Kenya guest restriction
    if (!authToken && !loginId) {
        return (
            <div className='dtrader-page-container' style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '20px' }}>
                <div style={{
                    maxWidth: '480px',
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.65)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '16px',
                    padding: '32px 24px',
                    textAlign: 'center',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px'
                }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(99, 102, 241, 0.2))',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px'
                    }}>
                        🔐
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
                            Deriv Authentication Required
                        </h3>
                        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                            Deriv requires an active logged-in session to access the DTrader terminal in Kenya and avoid regional guest restrictions.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleLoginRedirect}
                        style={{
                            width: '100%',
                            padding: '12px 20px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            color: '#ffffff',
                            fontSize: '14px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <span>⚡ Log In with Deriv</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className='dtrader-page-container'>
            <div className='dtrader-iframe-wrapper'>
                <IframeWrapper src={embedUrl} title='DTrader Terminal' />
            </div>
        </div>
    );
});

export default DTraderPage;
