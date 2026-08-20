import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getAppId, getClientId } from '@/components/shared/utils/config/config';
import Text from '@/components/shared_ui/text';
import Button from '@/components/shared_ui/button';
import Input from '@/components/shared_ui/input';
import Badge from '@/components/shared_ui/badge';
import ChunkLoader from '@/components/loader/chunk-loader';
import { useStore } from '@/hooks/useStore';
import { SharedActionsBridge } from '@/utils/shared-actions-bridge';
import { Globe, ShieldCheck, Server, RefreshCw, Cpu } from 'lucide-react';
import { getActiveToken, getActiveLoginId, resolveValidDerivWSToken, getAccountsList } from '@/utils/token-bridge';

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
                    <ChunkLoader message={`Connecting to ${title}...`} />
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

export const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();

    const [hubServer, setHubServer] = useState<'primary' | 'local' | 'backup'>('primary');
    const [authToken, setAuthToken] = useState<string>('');
    const [activeLoginId, setActiveLoginId] = useState<string>('');
    const [manualToken, setManualToken] = useState<string>('');
    const [tokenError, setTokenError] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

    useEffect(() => {
        let isMounted = true;
        const savedServer = localStorage.getItem('dtrader_hub_server') as 'primary' | 'local' | 'backup';
        if (savedServer === 'primary' || savedServer === 'local' || savedServer === 'backup') {
            setHubServer(savedServer);
        }

        const syncAuth = async () => {
            const resolvedToken = (typeof client?.getToken === 'function' ? client.getToken() : null) || getActiveToken() || (await resolveValidDerivWSToken());
            const loginId = client?.loginid || getActiveLoginId() || getClientId() || localStorage.getItem('active_loginid') || '';

            if (isMounted) {
                if (resolvedToken) {
                    setAuthToken(resolvedToken);
                }
                if (loginId) {
                    setActiveLoginId(loginId);
                }
                setIsAuthReady(true);
            }
        };

        syncAuth();
        return () => { isMounted = false; };
    }, [client]);

    const handleHubServerChange = (server: 'primary' | 'local' | 'backup') => {
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
    const clientId = getClientId() || appId;

    const primaryHubUrl = 'https://dtraderhub-mu.vercel.app/';
    const localHubUrl = '/dtrader/index.html';
    const backupHubUrl = 'https://deriv-dtrader.vercel.app/dtrader';

    const selectedHubUrl = hubServer === 'local'
        ? localHubUrl
        : (hubServer === 'backup' ? backupHubUrl : primaryHubUrl);

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
    queryParams.set('client_id', clientId);

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

    const embedUrl = `${selectedHubUrl}?${queryParams.toString()}`;

    useEffect(() => {
        const handleIframeAuthSync = () => {
            if (authToken) {
                const accountsList = getAccountsList();
                const payload = {
                    type: 'DERIV_AUTH_PAYLOAD',
                    active_loginid: loginId,
                    token: authToken,
                    app_id: appId,
                    client_id: clientId,
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
    }, [authToken, loginId, appId, clientId]);

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

                    <span className='mode-badge mode-badge--iframe'>
                        <Globe size={13} /> {hubServer === 'primary' ? '🌐 DTrader Hub 360' : (hubServer === 'local' ? '⚡ Local Static App' : '🛰️ Backup Hub')} (App ID: {appId})
                    </span>
                </div>

                <div className='mode-toggle'>
                    <button
                        type='button'
                        className={`toggle-btn ${hubServer === 'primary' ? 'toggle-btn--active' : ''}`}
                        onClick={() => handleHubServerChange('primary')}
                        title='Primary Deployed DTrader Hub (https://dtraderhub-mu.vercel.app/)'
                    >
                        <Globe size={14} /> DTrader Hub 360
                    </button>

                    <button
                        type='button'
                        className={`toggle-btn ${hubServer === 'local' ? 'toggle-btn--active' : ''}`}
                        onClick={() => handleHubServerChange('local')}
                        title='Fast Local Static DTrader App (/dtrader/index.html)'
                    >
                        <Cpu size={14} /> Local Static Engine
                    </button>

                    <button
                        type='button'
                        className={`toggle-btn ${hubServer === 'backup' ? 'toggle-btn--active' : ''}`}
                        onClick={() => handleHubServerChange('backup')}
                        title='Backup Deployed DTrader Web App'
                    >
                        <Server size={14} /> Backup Hub
                    </button>
                </div>
            </div>

            {/* Banner Notice */}
            <div className='dtrader-notice-banner'>
                <span className='notice-left'>
                    <ShieldCheck size={14} className='icon-emerald' />
                    <strong>Active Target:</strong> {selectedHubUrl} (App ID: {appId}) • Live Market Stream
                </span>

                <div className='notice-right-btns'>
                    <button
                        type='button'
                        onClick={() => handleHubServerChange(hubServer === 'primary' ? 'local' : 'primary')}
                        className='banner-btn banner-btn--switch'
                    >
                        <RefreshCw size={12} /> Switch to {hubServer === 'primary' ? 'Local Engine' : 'DTrader Hub 360'}
                    </button>
                </div>
            </div>

            {/* Auth / Iframe View */}
            {!authToken ? (
                <div className='dtrader-auth-wrapper'>
                    <div className='dtrader-auth-card'>
                        <div className='auth-card-head'>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>DTrader Hub</h3>
                            <Badge type='contained' background_color='orange' label='AUTH REQUIRED' />
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
        </div>
    );
});

export default DTraderPage;
