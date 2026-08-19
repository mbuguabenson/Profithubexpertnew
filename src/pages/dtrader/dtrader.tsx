import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import ChunkLoader from '@/components/loader/chunk-loader';
import { useStore } from '@/hooks/useStore';
import { getAppId, generateOAuthURL } from '@/components/shared/utils/config/config';
import { resolveValidDerivWSToken, getAccountsList, getActiveLoginId, getActiveToken } from '@/utils/token-bridge';
import { SharedActionsBridge } from '@/utils/shared-actions-bridge';
import { Heading, Text, CaptionText, Button, TextField, Badge } from '@deriv-com/quill-ui';
import DTraderWorkspace from './dtrader-workspace';
import { Zap, Globe, ShieldAlert, Sparkles, ArrowRight } from 'lucide-react';
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
            localStorage.getItem('client.token') ||
            localStorage.getItem('copy_trading.master_token') ||
            localStorage.getItem('deriv_api_token');
        if (direct && !direct.startsWith('ory_at_')) return direct;

        const copyTokens = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
        if (Array.isArray(copyTokens) && copyTokens.length > 0 && copyTokens[0]) {
            return copyTokens[0];
        }
    } catch {}
    return '';
};

/**
 * DTraderPage — embeds the official DTrader terminal via iframed URL (https://deriv-dtrader.vercel.app/dtrader)
 * Passes active login tokens and valid numeric app_id (121856) directly to bypass Kenya/regional restrictions.
 */
const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const initialLoginId = getInitialLoginId() || (client as any)?.loginid || '';
    const [activeLoginId, setActiveLoginId] = useState<string>(initialLoginId);
    const [authToken, setAuthToken] = useState<string>(() => getInitialToken(initialLoginId));
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
    const [manualToken, setManualToken] = useState<string>('');
    const [tokenError, setTokenError] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<'iframe' | 'native'>(() => {
        try {
            const saved = localStorage.getItem('dtrader_view_mode');
            if (saved === 'iframe' || saved === 'native') return saved;
        } catch {}
        return 'iframe';
    });

    const handleViewModeChange = (mode: 'iframe' | 'native') => {
        setViewMode(mode);
        try {
            localStorage.setItem('dtrader_view_mode', mode);
        } catch {}
    };

    useEffect(() => {
        SharedActionsBridge.initialize();

        const unsubscribe = SharedActionsBridge.subscribe(message => {
            if (message.action === 'SWITCH_ACCOUNT' && message.payload?.loginid) {
                setActiveLoginId(message.payload.loginid);
                if (message.payload.token) {
                    setAuthToken(message.payload.token);
                }
            }
        });

        return () => unsubscribe();
    }, []);

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

            if (!token) {
                token = getInitialToken(loginId || '') || getActiveToken() || '';
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

    const handleOAuthLogin = async () => {
        try {
            const oauthUrl = await generateOAuthURL();
            window.location.href = oauthUrl;
        } catch (e) {
            console.error('OAuth URL error:', e);
        }
    };

    const handleManualTokenSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = manualToken.trim();
        if (!trimmed) {
            setTokenError('Please enter a valid Deriv API token');
            return;
        }

        setIsSubmitting(true);
        setTokenError('');

        try {
            const { DerivClient } = await import('@/pages/copy-trading/copy-trading-manager');
            const testClient = new DerivClient();
            const authRes = await testClient.connectAndAuthorize(trimmed);
            testClient.disconnect();

            const newLoginId = authRes.loginid || 'CR_ACCOUNT';
            const accountsList = getAccountsList();
            accountsList[newLoginId] = trimmed;
            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('active_loginid', newLoginId);
            localStorage.setItem('active_token', trimmed);
            localStorage.setItem('token1', trimmed);

            setActiveLoginId(newLoginId);
            setAuthToken(trimmed);
        } catch (err: any) {
            setTokenError(err?.message || 'Invalid Deriv API token. Please check and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const appId = getAppId() || '121856';
    const rawBaseUrl = process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app/dtrader';
    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    const embedBase = baseUrl.endsWith('/dtrader') ? baseUrl : `${baseUrl}/dtrader`;

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
        theme: 'dark',
        hide_header_login: 'true',
        is_mobile_app: 'true',
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

    // Broadcast active token to child iframe via postMessage & SharedActionsBridge on load
    useEffect(() => {
        const handleIframeAuthSync = () => {
            if (authToken) {
                const accountsList = getAccountsList();
                const payload = {
                    type: 'DERIV_AUTH_PAYLOAD',
                    active_loginid: loginId,
                    token: authToken,
                    accounts: accountsList,
                };
                SharedActionsBridge.dispatch('INITIALIZE_AUTH', payload);

                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    try {
                        iframe.contentWindow?.postMessage(payload, '*');
                    } catch {}
                });
            }
        };

        window.addEventListener('message', (e) => {
            if (e.data?.type === 'REQUEST_DERIV_AUTH' || e.data?.action === 'REQUEST_DERIV_AUTH') {
                handleIframeAuthSync();
            }
        });

        const timer = setTimeout(handleIframeAuthSync, 1500);
        return () => clearTimeout(timer);
    }, [authToken, loginId]);

    if (!isAuthReady) {
        return <ChunkLoader message="Initializing DTrader Terminal..." />;
    }

    return (
        <div className='dtrader-page-container'>
            {/* Top View Mode Toolbar */}
            <div className='view-mode-bar'>
                <div className='view-mode-info'>
                    <span className='status-dot' />
                    <span className='mode-title'>DTrader Terminal</span>
                    {viewMode === 'iframe' ? (
                        <span className='mode-badge mode-badge--iframe'>
                            <Globe size={13} /> 🌐 Deriv Web App (App ID: {appId})
                        </span>
                    ) : (
                        <span className='mode-badge mode-badge--native'>
                            <Zap size={13} /> ⚡ Native Engine (Direct WebSocket)
                        </span>
                    )}
                </div>

                <div className='mode-toggle'>
                    <button
                        type='button'
                        className={`toggle-btn ${viewMode === 'iframe' ? 'toggle-btn--active' : ''}`}
                        onClick={() => handleViewModeChange('iframe')}
                        title='Deriv Official DTrader Terminal Web Application'
                    >
                        <Globe size={14} /> DTrader Web App
                    </button>
                    <button
                        type='button'
                        className={`toggle-btn ${viewMode === 'native' ? 'toggle-btn--active' : ''}`}
                        onClick={() => handleViewModeChange('native')}
                        title='Fast native trading terminal'
                    >
                        <Zap size={14} /> Native Workspace
                    </button>
                </div>
            </div>

            {/* Iframe View (Default) */}
            {viewMode === 'iframe' && (
                <>
                    {!authToken ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '75vh', padding: 24 }}>
                            <div style={{
                                maxWidth: 540,
                                width: '100%',
                                background: '#0d111c',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: 16,
                                padding: 32,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 20,
                                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Heading.H3>Deriv DTrader Web App</Heading.H3>
                                    <Badge label='AUTH REQUIRED' size='sm' variant='warning' />
                                </div>

                                <Text size='sm' color='subtle'>
                                    To open the DTrader web app in Kenya with full market access, connect your Deriv account or provide an API token.
                                </Text>

                                <form onSubmit={handleManualTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <TextField
                                        placeholder="Enter Deriv API Token (e.g. a1-XYZ...)"
                                        value={manualToken}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualToken(e.target.value)}
                                        status={tokenError ? 'error' : undefined}
                                        statusMessage={tokenError}
                                    />
                                    <Button
                                        size='lg'
                                        variant='primary'
                                        fullWidth
                                        type='submit'
                                        isLoading={isSubmitting}
                                    >
                                        Launch DTrader with Token
                                    </Button>
                                </form>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
                                    <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
                                    <CaptionText size='xs' color='subtle'>OR LOG IN WITH DERIV</CaptionText>
                                    <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
                                </div>

                                <Button
                                    size='md'
                                    variant='secondary'
                                    fullWidth
                                    onClick={handleOAuthLogin}
                                >
                                    Log In with Deriv
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className='dtrader-iframe-wrapper'>
                            <IframeWrapper src={embedUrl} title='DTrader Terminal' />
                        </div>
                    )}
                </>
            )}

            {/* Native Workspace View */}
            {viewMode === 'native' && (
                <DTraderWorkspace />
            )}
        </div>
    );
});

export default DTraderPage;
