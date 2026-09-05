import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { resolveValidDerivWSToken, getAccountsList, getActiveToken } from '@/utils/token-bridge';
import { V2GetActiveClientId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId, getClientId } from '@/components/shared/utils/config/config';
import { generateOAuthURL } from '@/components/shared';
import { Loader2, RefreshCw, Maximize2, Minimize2, LogIn, ExternalLink } from 'lucide-react';
import './dtrader-iframe-container.scss';

const DTRADER_BASE_URL = 'https://deriv-dtrader-ten.vercel.app';

interface DTraderIframeContainerProps {
    className?: string;
}

export const DTraderIframeContainer: React.FC<DTraderIframeContainerProps> = observer(({ className = '' }) => {
    const { client } = useStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const [tokenData, setTokenData] = useState<{ token: string; loginid: string }>(() => {
        const loginid = V2GetActiveClientId() || client?.loginid || localStorage.getItem('active_loginid') || '';
        const token = getActiveToken() || '';
        return { token, loginid };
    });

    const activeAppId = useMemo(() => {
        const appId = getAppId();
        // Deriv WebSocket requires a strictly numeric app_id (e.g. 121856)
        if (appId && /^\d+$/.test(appId)) {
            return appId;
        }
        return '121856';
    }, []);

    // Resolve active account and OAuth token whenever client changes
    useEffect(() => {
        let isMounted = true;
        const fetchAuth = async () => {
            const loginid =
                client?.loginid ||
                V2GetActiveClientId() ||
                localStorage.getItem('active_loginid') ||
                '';
            if (loginid) {
                const validToken = await resolveValidDerivWSToken(loginid);
                if (isMounted) {
                    setTokenData({ token: validToken || getActiveToken() || '', loginid });
                }
            } else {
                const fallbackToken = getActiveToken() || '';
                if (isMounted) {
                    setTokenData({ token: fallbackToken, loginid: '' });
                }
            }
        };
        fetchAuth();
        return () => {
            isMounted = false;
        };
    }, [client?.loginid, client?.token]);

    const activeLoginId = tokenData.loginid || client?.loginid || localStorage.getItem('active_loginid') || '';
    const activeToken = tokenData.token || client?.token || '';
    const currency = client?.currency || 'USD';
    const isDemo = activeLoginId.startsWith('VR') || activeLoginId.toLowerCase().includes('demo');
    const isAuthenticated = Boolean(activeLoginId && activeToken);

    // Build the query URL ensuring token & overridden app_id are passed
    const iframeSrc = useMemo(() => {
        const params = new URLSearchParams();

        // 1. Mandatory token parameter:
        // deriv-dtrader-ten checks: if (new URLSearchParams(window.location.search).has('token'))
        // If 'token' is missing, its anti-clickjack script does top.location = self.location (redirects externally).
        // Passing activeToken if present, or '' if unauthenticated, ensures has('token') is ALWAYS true (preventing top redirect),
        // while avoiding passing a dummy/invalid token that would fail with 401.
        params.set('token', activeToken || '');

        // 2. Overridden App ID and Client ID
        params.set('app_id', activeAppId);
        params.set('client_id', activeAppId);

        // 3. User account details if authenticated
        if (activeLoginId) {
            params.set('loginid', activeLoginId);
            params.set('acct1', activeLoginId);
            params.set('cur1', currency);
            if (activeToken) {
                params.set('token1', activeToken);
            }
        }

        // 4. Secondary accounts mapped from local storage
        try {
            const accountsList = getAccountsList();
            let index = 1;
            for (const accId in accountsList) {
                const accToken = accountsList[accId];
                if (accToken && accId !== activeLoginId) {
                    index++;
                    params.set(`acct${index}`, accId);
                    params.set(`token${index}`, accToken);
                    params.set(`cur${index}`, currency || 'USD');
                }
            }
        } catch {
            // Ignore secondary accounts error
        }

        // 5. Environment & theme flags
        params.set('theme', 'dark');
        params.set('lang', 'EN');
        params.set('embed', 'true');
        params.set('is_embedded', 'true');
        params.set('standalone', 'true');

        return `${DTRADER_BASE_URL}/?${params.toString()}`;
    }, [activeAppId, activeLoginId, activeToken, currency, reloadKey]);

    // Dispatch authentication postMessage directly into iframe on load or account switch
    const syncSessionToIframe = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;

        const sessionPayload = {
            loginid: activeLoginId,
            loginId: activeLoginId,
            acct1: activeLoginId,
            token: activeToken,
            token1: activeToken,
            currency,
            cur1: currency,
            isDemo,
            appId: activeAppId,
            app_id: activeAppId,
            theme: 'dark',
            standalone: true,
            embed: true,
            is_embedded: true,
        };

        const targetOrigin = (() => {
            try {
                return new URL(DTRADER_BASE_URL).origin;
            } catch {
                return '*';
            }
        })();

        const safePost = (msg: any) => {
            try {
                iframe.contentWindow?.postMessage(msg, targetOrigin);
            } catch {
                try {
                    iframe.contentWindow?.postMessage(msg, '*');
                } catch {
                    // Ignore message delivery errors
                }
            }
        };

        safePost({ type: 'SESSION_DATA', ...sessionPayload });
        safePost({ type: 'DERIV_AUTH', ...sessionPayload });
        safePost({ type: 'AUTH_TOKEN', ...sessionPayload });
        safePost({ action: 'setToken', ...sessionPayload });
        safePost({ action: 'login', ...sessionPayload });
        safePost({ action: 'SYNC_SESSION', ...sessionPayload });
    }, [activeLoginId, activeToken, activeAppId, currency, isDemo]);

    const handleIframeLoad = () => {
        setIsLoading(false);
        syncSessionToIframe();
    };

    const handleReload = () => {
        setIsLoading(true);
        setReloadKey(k => k + 1);
    };

    const handleLoginRedirect = async () => {
        try {
            const oauthUrl = await generateOAuthURL();
            if (oauthUrl) {
                window.location.assign(oauthUrl);
            }
        } catch (err) {
            console.error('[DTrader] Failed to generate OAuth login URL:', err);
        }
    };

    const toggleFullscreen = () => {
        setIsFullscreen(prev => !prev);
    };

    return (
        <div
            className={`dtrader-container ${isFullscreen ? 'dtrader-container--fullscreen' : ''} ${className}`}
        >
            {/* Top Toolbar */}
            <div className='dtrader-container__toolbar'>
                <div className='dtrader-container__left-group'>
                    <div className='dtrader-container__brand-badge'>
                        <span className='brand-dot' />
                        <span>Deriv DTrader</span>
                    </div>

                    <div className='dtrader-container__account-pill'>
                        {isAuthenticated ? (
                            <>
                                <span
                                    className={`account-type-tag ${
                                        isDemo ? 'account-type-tag--demo' : 'account-type-tag--real'
                                    }`}
                                >
                                    {isDemo ? 'Demo' : 'Real'}
                                </span>
                                <span>{activeLoginId}</span>
                                <span style={{ opacity: 0.6 }}>({currency})</span>
                            </>
                        ) : (
                            <span className='account-type-tag account-type-tag--guest'>Guest View</span>
                        )}
                    </div>

                    <div className='dtrader-container__appid-pill'>
                        <span className='appid-label'>App ID:</span>
                        <span>#{activeAppId}</span>
                    </div>
                </div>

                <div className='dtrader-container__right-group'>
                    {!isAuthenticated && (
                        <button
                            type='button'
                            className='dtrader-container__btn dtrader-container__btn--login'
                            onClick={handleLoginRedirect}
                            title='Log in to trade with your account'
                        >
                            <LogIn size={13} />
                            <span>Log In with Deriv</span>
                        </button>
                    )}

                    <button
                        type='button'
                        className='dtrader-container__btn dtrader-container__btn--refresh'
                        onClick={handleReload}
                        title='Reload DTrader terminal'
                    >
                        <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                        <span>Sync / Reload</span>
                    </button>

                    <button
                        type='button'
                        className='dtrader-container__btn dtrader-container__btn--fullscreen'
                        onClick={toggleFullscreen}
                        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                    >
                        {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                        <span>{isFullscreen ? 'Exit' : 'Full'}</span>
                    </button>
                </div>
            </div>

            {/* Iframe Viewport Container */}
            <div className='dtrader-container__frame-wrapper'>
                {isLoading && (
                    <div className='dtrader-container__loader'>
                        <Loader2 className='animate-spin' size={36} style={{ color: '#ff444f' }} />
                        <span className='loader-brand'>Deriv DTrader Institutional Suite</span>
                        <span className='loader-sub'>
                            {isAuthenticated
                                ? `Syncing account ${activeLoginId} with App ID #${activeAppId}...`
                                : `Connecting with custom App ID #${activeAppId}...`}
                        </span>
                    </div>
                )}

                {/* 
                  Crucial Security & Containment Settings:
                  1. sandbox WITHOUT allow-top-navigation ensures the iframe cannot navigate top window externally.
                  2. token query param is always passed, satisfying the anti-clickjack check inside deriv-dtrader-ten.
                  3. allow attributes enable responsive interactions, modals, sounds, and chart rendering.
                */}
                <iframe
                    ref={iframeRef}
                    key={iframeSrc}
                    src={iframeSrc}
                    title='Deriv DTrader'
                    className='dtrader-container__iframe'
                    sandbox='allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads'
                    allow='autoplay; clipboard-write; camera; microphone; geolocation'
                    onLoad={handleIframeLoad}
                />
            </div>
        </div>
    );
});

export default DTraderIframeContainer;
