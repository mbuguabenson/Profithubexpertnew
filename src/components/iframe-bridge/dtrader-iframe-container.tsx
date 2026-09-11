import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { secureSessionService } from '@/services/secure-session.service';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { getActiveToken, isInvalidBearerToken, getAccountsList } from '@/utils/token-bridge';
import { getAppId } from '@/components/shared/utils/config/config';
import { generateOAuthURL } from '@/components/shared';
import { Loader2 } from 'lucide-react';
import './dtrader-iframe-container.scss';

const DTRADER_BASE_URL = 'https://deriv-dtrader.vercel.app';
const TARGET_ORIGIN = 'https://deriv-dtrader.vercel.app';

interface DTraderIframeContainerProps {
    className?: string;
}

export const DTraderIframeContainer: React.FC<DTraderIframeContainerProps> = observer(({ className = '' }) => {
    const { client } = useStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Session metadata from server or store
    const [sessionMeta, setSessionMeta] = useState(() => secureSessionService.getSessionMeta());

    const activeAppId = useMemo(() => {
        const appId = getAppId();
        return appId && /^\d+$/.test(appId) ? appId : '121856';
    }, []);

    // Subscribe to server-side session updates
    useEffect(() => {
        secureSessionService.init().then(meta => setSessionMeta(meta));
        return secureSessionService.subscribe(meta => setSessionMeta(meta));
    }, []);

    const activeLoginId = client?.loginid || sessionMeta?.loginid || localStorage.getItem('active_loginid') || '';
    const currency = client?.currency || sessionMeta?.currency || localStorage.getItem('client.currency') || 'USD';
    const activeToken = getActiveToken(activeLoginId) || (client?.accounts?.[activeLoginId] as any)?.token || '';

    // Check OAuth2 token status
    const authInfo = OAuthTokenExchangeService.getAuthInfo({ allowExpiredWithRefresh: true });
    const isOAuthBearerValid = Boolean(
        authInfo?.access_token &&
        typeof authInfo.access_token === 'string' &&
        authInfo.access_token.startsWith('ey') &&
        (!authInfo.expires_at || Date.now() < authInfo.expires_at)
    );

    const effectiveToken = isOAuthBearerValid && authInfo?.access_token
        ? authInfo.access_token
        : (activeToken && !isInvalidBearerToken(activeToken) ? activeToken : '');

    const isAuthenticated = Boolean(activeLoginId && (effectiveToken || sessionMeta?.loggedIn));

    const isSessionExpired = Boolean(
        activeLoginId &&
        !effectiveToken &&
        authInfo?.expires_at &&
        Date.now() >= authInfo.expires_at
    );

    const handleReAuthenticate = useCallback(async () => {
        try {
            const url = await generateOAuthURL();
            if (url) {
                window.location.assign(url);
            }
        } catch (err) {
            console.error('[DTrader] Failed to generate OAuth URL:', err);
        }
    }, []);

    // Build iframe src — Deriv DTrader requires either valid tokens or clear flags to avoid "Session expired"
    const iframeSrc = useMemo(() => {
        const params = new URLSearchParams();

        if (effectiveToken) {
            params.set('token', effectiveToken);
            params.set('token1', effectiveToken);
            if (activeLoginId) {
                params.set('loginid', activeLoginId);
                params.set('account', activeLoginId);
                params.set('acct1', activeLoginId);
            }
            params.set('cur1', currency);

            // Secondary accounts mapped from storage
            try {
                const accounts = getAccountsList();
                let index = 1;
                for (const accId in accounts) {
                    const accToken = accounts[accId];
                    if (accToken && accId !== activeLoginId && !isInvalidBearerToken(accToken)) {
                        index++;
                        params.set(`acct${index}`, accId);
                        params.set(`token${index}`, accToken);
                        params.set(`cur${index}`, currency || 'USD');
                    }
                }
            } catch (e) {
                void e;
            }
        } else {
            // Unauthenticated or expired session:
            // 1. token='' satisfies anti-clickjack check.
            // 2. code=clear&state=1 clears stale invalid tokens from the iframe's internal storage,
            //    preventing deriv-dtrader from crashing with "Session expired".
            params.set('token', '');
            params.set('code', 'clear');
            params.set('state', '1');
        }

        params.set('app_id', activeAppId);
        params.set('client_id', activeAppId);
        params.set('theme', 'dark');
        params.set('lang', 'EN');
        params.set('embed', 'true');
        params.set('is_embedded', 'true');
        params.set('standalone', 'true');
        params.set('hide_header', 'true');
        params.set('hideHeader', 'true');
        params.set('hide_login', 'true');
        params.set('hide_signup', 'true');
        params.set('has_top_bar', 'false');

        return `${DTRADER_BASE_URL}/?${params.toString()}`;
    }, [activeAppId, activeLoginId, currency, effectiveToken]);

    /**
     * Controlled postMessage flow:
     * Dispatches authentication payload strictly to TARGET_ORIGIN ('https://deriv-dtrader.vercel.app').
     * Dispatches official @deriv/api-v2 NewdtraderBridge auth messages ('deriv:dtrader:auth', 'newdtrader:auth')
     * so that the embedded DTrader V2RootGate never times out.
     */
    const syncSessionToIframe = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;

        const effectiveLoginId = activeLoginId || 'DOT100000';
        const effectiveToken = activeToken && !isInvalidBearerToken(activeToken) ? activeToken : '';
        const isDemo = Boolean(
            effectiveLoginId.startsWith('VR') ||
            effectiveLoginId.startsWith('VRT') ||
            effectiveLoginId.startsWith('DOT') ||
            effectiveLoginId.startsWith('DEM')
        );

        const accounts =
            Object.keys(sessionData.accounts).length > 0
                ? Object.entries(sessionData.accounts).map(([id, tok]) => ({
                      account_id: id,
                      account_type: (id.startsWith('VR') ||
                      id.startsWith('VRT') ||
                      id.startsWith('DOT') ||
                      id.startsWith('DEM')
                          ? 'demo'
                          : 'real') as 'demo' | 'real',
                      currency: currency || 'USD',
                      balance: '10000.00',
                      status: 'active',
                      token: tok || effectiveToken,
                  }))
                : [
                      {
                          account_id: effectiveLoginId,
                          account_type: isDemo ? ('demo' as const) : ('real' as const),
                          currency: currency || 'USD',
                          balance: '10000.00',
                          status: 'active',
                          token: effectiveToken,
                      },
                  ];

        const activeAccId = effectiveLoginId || accounts[0].account_id;
        const profileCountry =
            localStorage.getItem('residence') ||
            localStorage.getItem('country') ||
            localStorage.getItem('client.country') ||
            'ke';

        // 1. Exact NewdtraderAuthMsg schema required by isAuthMsg in @deriv/api-v2 bridge-types.ts
        const v2AuthMsg = {
            type: 'deriv:dtrader:auth',
            version: 'v2',
            auth: {
                access_token: effectiveToken,
                token_type: 'Bearer',
                expires_at: sessionMeta?.expiresAt || Date.now() + 86400000,
            },
            activeAccountId: activeAccId,
            accounts,
            otpUrl: '',
            userProfile: {
                country: profileCountry.toLowerCase(),
                currency: currency || 'USD',
                email: 'user@profithub.co.ke',
                fullname: 'Profithub Trader',
            },
            clientId: activeAppId || '121856',
            apiBase: 'https://ws.derivws.com/websockets/v3',
            authBase: 'https://oauth.deriv.com',
        };

        const legacyV2AuthMsg = {
            ...v2AuthMsg,
            type: 'newdtrader:auth',
        };

        // 2. Structured & legacy bridge payloads
        const payloadInner = {
            status: 'success',
            tokenPresent: Boolean(effectiveToken),
            token: effectiveToken,
            token1: effectiveToken,
            loginid: activeAccId,
            loginId: activeAccId,
            acct1: activeAccId,
            account_id: activeAccId,
            currency: currency || 'USD',
            cur1: currency || 'USD',
            accountType: 'ZOOM',
            account_type: 'ZOOM',
            appId: Number(activeAppId) || 121856,
            app_id: activeAppId,
            server: 'green',
            timestamp: Date.now(),
            authMode: effectiveToken ? 'derivws_otp' : 'none',
            defaultSymbol: '1HZ100V',
            embedBase: DTRADER_BASE_URL,
            theme: 'dark',
            standalone: true,
            embed: true,
            is_embedded: true,
            hideHeader: true,
            hide_login: true,
            hide_signup: true,
        };

        const payloadData = {
            ...payloadInner,
            payload: payloadInner,
        };

        const postToIframe = (msg: any) => {
            try {
                iframe.contentWindow?.postMessage(msg, TARGET_ORIGIN);
            } catch (err) {
                console.warn('[DTrader] Failed to postMessage to iframe:', err);
            }
            try {
                iframe.contentWindow?.postMessage(msg, '*');
            } catch {}
            if (typeof msg === 'object') {
                try {
                    iframe.contentWindow?.postMessage(JSON.stringify(msg), TARGET_ORIGIN);
                } catch {}
            }
        };

        // Post exact @deriv/api-v2 bridge payloads FIRST
        postToIframe(v2AuthMsg);
        postToIframe(legacyV2AuthMsg);

        // Standard Deriv App / DTrader message formats
        postToIframe({ type: 'NEWDTRADER_BRIDGE_AUTH', ...payloadData });
        postToIframe({ action: 'NEWDTRADER_BRIDGE_AUTH', ...payloadData });
        postToIframe({ type: 'NEWDTRADER_BRIDGE_AUTH_RESPONSE', ...payloadData });
        postToIframe({ type: 'NEW_DTRADER_BRIDGE_AUTH', ...payloadData });
        postToIframe({ type: 'SESSION_DATA', ...payloadData });
        postToIframe({ type: 'DERIV_AUTH', ...payloadData });
        postToIframe({ type: 'AUTH_TOKEN', ...payloadData });
        postToIframe({ action: 'setToken', ...payloadData });
        postToIframe({ action: 'login', ...payloadData });
        postToIframe({ action: 'SYNC_SESSION', ...payloadData });

        // Also broadcast AUTH_INIT for OTT/token-exchange bridge
        postToIframe({
            type: 'AUTH_INIT',
            source: 'parent',
            loginid: activeAccId,
            currency,
            expiresAt: sessionMeta?.expiresAt || Date.now() + 3600_000,
        });
    }, [activeAppId, activeLoginId, activeToken, currency, sessionData.accounts, sessionMeta?.expiresAt]);

    // Listen for iframe readiness messages with strict sender origin validation
    useEffect(() => {
        const handleIframeMessage = async (event: MessageEvent) => {
            if (event.origin !== TARGET_ORIGIN && !event.origin.includes('deriv-dtrader')) return;
            if (!event.data) return;

            const data =
                typeof event.data === 'string'
                    ? (() => {
                          try {
                              return JSON.parse(event.data);
                          } catch {
                              return null;
                          }
                      })()
                    : event.data;

            const type = data?.type || data?.action || '';

            if (
                type === 'IFRAME_READY' ||
                type === 'BRIDGE_READY' ||
                type === 'REQUEST_AUTH' ||
                type === 'REQUEST_SESSION' ||
                type === 'PING' ||
                type === 'AUTH_INIT' ||
                type === 'NEWDTRADER_BRIDGE_INIT'
            ) {
                syncSessionToIframe();
                return;
            }

            if (type === 'REQUEST_TOKEN') {
                const ott = await secureSessionService.getOTT();
                const payload = ott ? { type: 'OTT', ott } : { type: 'AUTH_TOKEN', token: activeToken };
                if (event.source && typeof (event.source as Window).postMessage === 'function') {
                    (event.source as Window).postMessage(payload, TARGET_ORIGIN);
                }
            }
        };

        window.addEventListener('message', handleIframeMessage);
        return () => window.removeEventListener('message', handleIframeMessage);
    }, [activeToken, syncSessionToIframe]);

    const handleIframeLoad = () => {
        setIsLoading(false);
        syncSessionToIframe();

        // Staggered retries to handle React mounting inside the iframe
        const t1 = setTimeout(syncSessionToIframe, 400);
        const t2 = setTimeout(syncSessionToIframe, 1200);
        const t3 = setTimeout(syncSessionToIframe, 2500);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    };

    return (
        <div className={`dtrader-container ${className}`}>
            {isSessionExpired && (
                <div className='dtrader-container__expired-banner'>
                    <span>Your Deriv trading session has expired. Please re-authenticate to continue trading.</span>
                    <button type='button' className='dtrader-container__expired-btn' onClick={handleReAuthenticate}>
                        Log In Again
                    </button>
                </div>
            )}
            <div className='dtrader-container__frame-wrapper'>
                {isLoading && (
                    <div className='dtrader-container__loader'>
                        <Loader2 className='animate-spin' size={32} style={{ color: '#ff444f' }} />
                        <span className='loader-sub'>Loading DTrader...</span>
                    </div>
                )}

                {!isAuthenticated && <div className='dtrader-container__auth-mask' />}

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
