import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getAppId } from '@/components/shared/utils/config/config';
import Text from '@/components/shared_ui/text';
import Button from '@/components/shared_ui/button';
import Input from '@/components/shared_ui/input';
import Badge from '@/components/shared_ui/badge';
import ChunkLoader from '@/components/loader/chunk-loader';
import { useStore } from '@/hooks/useStore';
import { SharedActionsBridge } from '@/utils/shared-actions-bridge';
import DTraderWorkspace from './dtrader-workspace';
import { Globe, Zap, ShieldCheck, Server, RefreshCw } from 'lucide-react';
import './dtrader.scss';

// Safe token resolution helper
const resolveActiveToken = (): string => {
    return (
        localStorage.getItem('active_token') ||
        localStorage.getItem('token1') ||
        localStorage.getItem('deriv_api_token') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('token') ||
        ''
    );
};

// Safe getAccountsList helper
const getAccountsList = (): Record<string, string> => {
    try {
        const raw = localStorage.getItem('accountsList');
        if (raw) {
            return JSON.parse(raw);
        }
    } catch (e) {
        void e;
    }
    return {};
};

interface IframeWrapperProps {
    src: string;
    title: string;
}

const IframeWrapper: React.FC<IframeWrapperProps> = ({ src, title }) => {
    const [isLoading, setIsLoading] = useState(true);

    return (
        <div className='iframe-container-relative'>
            {isLoading && (
                <div className='iframe-loader-overlay'>
                    <ChunkLoader message='Connecting to DTrader Hub...' />
                </div>
            )}
            <iframe
                src={src}
                title={title}
                className='dtrader-full-iframe'
                onLoad={() => setIsLoading(false)}
                allow='camera; microphone; clipboard-read; clipboard-write; geolocation'
            />
        </div>
    );
};

const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();

    const [viewMode, setViewMode] = useState<'iframe' | 'native'>('iframe');
    const [hubServer, setHubServer] = useState<'primary' | 'backup'>('primary');
    const [authToken, setAuthToken] = useState<string>('');
    const [activeLoginId, setActiveLoginId] = useState<string>('');
    const [manualToken, setManualToken] = useState<string>('');
    const [tokenError, setTokenError] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

    useEffect(() => {
        const savedMode = localStorage.getItem('dtrader_view_mode') as 'iframe' | 'native';
        if (savedMode === 'iframe' || savedMode === 'native') {
            setViewMode(savedMode);
        }

        const savedServer = localStorage.getItem('dtrader_hub_server') as 'primary' | 'backup';
        if (savedServer === 'primary' || savedServer === 'backup') {
            setHubServer(savedServer);
        }

        const token = resolveActiveToken();
        const loginId = client?.loginid || localStorage.getItem('active_loginid') || '';

        setAuthToken(token);
        setActiveLoginId(loginId);
        setIsAuthReady(true);
    }, [client]);

    const handleViewModeChange = (mode: 'iframe' | 'native') => {
        setViewMode(mode);
        localStorage.setItem('dtrader_view_mode', mode);
    };

    const handleHubServerChange = (server: 'primary' | 'backup') => {
        setHubServer(server);
        localStorage.setItem('dtrader_hub_server', server);
    };

    const handleOAuthLogin = () => {
        const appId = getAppId() || '121856';
        const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${appId}&l=EN&brand=deriv`;
        window.location.href = oauthUrl;
    };

    const handleManualTokenSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTokenError('');
        const trimmed = manualToken.trim();

        if (!trimmed) {
            setTokenError('Please enter a valid Deriv API token.');
            return;
        }

        setIsSubmitting(true);

        try {
            const appId = getAppId() || '121856';
            const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);

            const authResult = await new Promise<{ authorize: any }>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Connection timed out. Please verify your token and network.'));
                }, 10000);

                ws.onopen = () => {
                    ws.send(JSON.stringify({ authorize: trimmed }));
                };

                ws.onmessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        if (data.error) {
                            clearTimeout(timeout);
                            ws.close();
                            reject(new Error(data.error.message || 'Invalid API token.'));
                        } else if (data.msg_type === 'authorize') {
                            clearTimeout(timeout);
                            ws.close();
                            resolve(data);
                        }
                    } catch (err) {
                        clearTimeout(timeout);
                        ws.close();
                        reject(err);
                    }
                };

                ws.onerror = () => {
                    clearTimeout(timeout);
                    ws.close();
                    reject(new Error('WebSocket connection failed.'));
                };
            });

            const userAuth = authResult.authorize;
            const newLoginId = userAuth.loginid;

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
    const primaryHubUrl = 'https://dtraderhub-mu.vercel.app/';
    const backupHubUrl = 'https://deriv-dtrader.vercel.app/dtrader';

    const selectedHubUrl = hubServer === 'backup'
        ? backupHubUrl
        : (process.env.DTRADER_URL || primaryHubUrl);

    const baseUrl = selectedHubUrl.replace(/\/+$/, '');
    const embedBase = baseUrl.endsWith('/dtrader') ? baseUrl : baseUrl;

    const loginId = activeLoginId || (client as any)?.loginid || localStorage.getItem('active_loginid') || '';
    const currency = client?.currency || localStorage.getItem('client.currency') || 'USD';
    const isDemo = loginId.startsWith('VR') || loginId.startsWith('VRT') || loginId.startsWith('DOT');

    const getValidAuthToken = (): string => {
        if (authToken && authToken !== 'a1-guest' && authToken.length >= 6) {
            return authToken;
        }
        return resolveActiveToken();
    };

    const queryParams = new URLSearchParams();
    if (loginId) {
        queryParams.set('acct1', loginId);
        queryParams.set('cur1', currency);
    }

    queryParams.set('app_id', appId);

    const validToken = getValidAuthToken();
    if (validToken) {
        queryParams.set('token1', validToken);
    }

    try {
        const accountsList = getAccountsList();
        let index = 1;
        for (const accId in accountsList) {
            const accToken = accountsList[accId];
            if (accToken && accId !== loginId) {
                index++;
                queryParams.set(`acct${index}`, accId);
                queryParams.set(`token${index}`, accToken);
                queryParams.set(`cur${index}`, currency);
            }
        }
    } catch (error) {
        void error;
    }

    queryParams.set('lang', 'EN');
    queryParams.set('theme', 'dark');
    queryParams.set('symbol', '1HZ100V');
    queryParams.set('trade_type', 'accumulator');
    queryParams.set('hide_header_login', 'true');
    queryParams.set('is_mobile_app', 'false');
    queryParams.set('account_type', isDemo ? 'demo' : 'real');
    queryParams.set('server', 'green');

    const embedUrl = `${embedBase}?${queryParams.toString()}`;

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
                iframes.forEach((frame) => {
                    try {
                        frame.contentWindow?.postMessage(payload, '*');
                    } catch (e) {
                        void e;
                    }
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
                            <Globe size={13} /> {hubServer === 'primary' ? '🌐 DTrader Hub 360' : '🛰️ Backup Hub'} (App ID: {appId})
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
                        className={`toggle-btn ${viewMode === 'iframe' && hubServer === 'primary' ? 'toggle-btn--active' : ''}`}
                        onClick={() => {
                            handleViewModeChange('iframe');
                            handleHubServerChange('primary');
                        }}
                        title='Primary Deployed DTrader Hub (https://dtraderhub-mu.vercel.app/)'
                    >
                        <Globe size={14} /> DTrader Hub 360
                    </button>

                    <button
                        type='button'
                        className={`toggle-btn ${viewMode === 'iframe' && hubServer === 'backup' ? 'toggle-btn--active' : ''}`}
                        onClick={() => {
                            handleViewModeChange('iframe');
                            handleHubServerChange('backup');
                        }}
                        title='Backup Deployed DTrader Web App'
                    >
                        <Server size={14} /> Backup Hub
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

            {/* Iframe View */}
            {viewMode === 'iframe' && (
                <React.Fragment>
                    <div className='dtrader-notice-banner'>
                        <span className='notice-left'>
                            <ShieldCheck size={14} className='icon-emerald' />
                            <strong>Active Target:</strong> {selectedHubUrl} (App ID: {appId}) • Kenya Bypass Active
                        </span>

                        <div className='notice-right-btns'>
                            <button
                                type='button'
                                onClick={() => handleHubServerChange(hubServer === 'primary' ? 'backup' : 'primary')}
                                className='banner-btn banner-btn--switch'
                            >
                                <RefreshCw size={12} /> Switch to {hubServer === 'primary' ? 'Backup Hub' : 'Primary Hub 360'}
                            </button>
                            <button
                                type='button'
                                onClick={() => handleViewModeChange('native')}
                                className='banner-btn banner-btn--native'
                            >
                                Switch to Native Workspace ⚡
                            </button>
                        </div>
                    </div>

                    {!authToken ? (
                        <div className='dtrader-auth-wrapper'>
                            <div className='dtrader-auth-card'>
                                <div className='auth-card-head'>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>DTrader Hub 360</h3>
                                    <Badge label='AUTH REQUIRED' />
                                </div>

                                <Text size='xs'>
                                    To open DTrader Hub in Kenya with full market access, connect your Deriv account or provide an API token.
                                </Text>

                                <form onSubmit={handleManualTokenSubmit} className='auth-token-form'>
                                    <Input
                                        placeholder="Enter Deriv API Token (e.g. a1-XYZ...)"
                                        value={manualToken}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualToken(e.target.value)}
                                    />
                                    {tokenError && (
                                        <div className='token-error-msg'>
                                            {tokenError}
                                        </div>
                                    )}
                                    <Button
                                        primary
                                        type='submit'
                                        is_disabled={isSubmitting}
                                    >
                                        Launch DTrader with Token
                                    </Button>
                                </form>

                                <div className='auth-separator'>
                                    <div className='sep-line' />
                                    <Text size='xs'>OR LOG IN WITH DERIV</Text>
                                    <div className='sep-line' />
                                </div>

                                <Button
                                    secondary
                                    onClick={handleOAuthLogin}
                                >
                                    Log In with Deriv
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className='dtrader-iframe-wrapper'>
                            <IframeWrapper src={embedUrl} title='DTrader Terminal Hub' />
                        </div>
                    )}
                </React.Fragment>
            )}

            {/* Native Workspace View */}
            {viewMode === 'native' && (
                <DTraderWorkspace />
            )}
        </div>
    );
});

export default DTraderPage;
