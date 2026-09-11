import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { generateOAuthURL, DERIV_CONFIG } from '@/components/shared/utils/config/config';
import {
    getLegacyDTraderToken,
    isLegacyToken,
    getActiveLoginId,
    purgeInvalidToken,
} from '@/utils/token-bridge';
import './dtrader-iframe-container.scss';

const DTRADER_BASE_URL = 'https://deriv-dtrader.vercel.app';
const TARGET_ORIGIN = 'https://deriv-dtrader.vercel.app';

interface DTraderIframeContainerProps {
    className?: string;
}

/**
 * DTraderIframeContainer
 *
 * Implements Strategy 1 (Dual-Token Architecture) for the DTrader terminal:
 * - Hosted DTrader build runs on Deriv Legacy API (wss://ws.derivws.com/websockets/v3).
 * - Strictly isolates Legacy API tokens ('legacy_dtrader_token', 'token1', accountsList)
 *   from New Deriv API tokens ('bot_new_api_token', 'auth_info' OAuth 2.0 PKCE).
 * - NEVER sends OAuth 2.0 Bearer JWTs (which start with 'ey') to DTrader, preventing
 *   the immediate "Invalid Login" and "Session Expired" loop.
 * - Injects the designated Legacy App ID (e.g. 121856) and legacy token parameters.
 */
export const DTraderIframeContainer: React.FC<DTraderIframeContainerProps> = observer(({ className = '' }) => {
    const { client } = useStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasTokenMismatch, setHasTokenMismatch] = useState(false);
    const [guestPreview, setGuestPreview] = useState(false);
    const [authSuccess, setAuthSuccess] = useState(false);
    const authGuardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Listen for global dtrader_session_expired events
    useEffect(() => {
        const handleSessionExpired = () => {
            setHasTokenMismatch(true);
            setGuestPreview(false);
        };
        window.addEventListener('dtrader_session_expired', handleSessionExpired);
        return () => window.removeEventListener('dtrader_session_expired', handleSessionExpired);
    }, []);

    // DTrader's WebSocket v3 still requires a legacy app_id for its own API calls.
    // We don't use this for auth any more — auth goes through the standard PKCE flow.
    const activeAppId = DERIV_CONFIG.LEGACY_DTRADER_APP_ID || '121856';


    const activeLoginId = client?.loginid || getActiveLoginId();
    const currency = client?.currency || localStorage.getItem('client.currency') || 'USD';

    // Strictly resolve a Legacy Deriv token for DTrader
    const legacyToken = getLegacyDTraderToken(activeLoginId) || '';
    const hasValidLegacyToken = isLegacyToken(legacyToken);

    // Detect if user has a bot/New API session but no legacy token connected
    const botToken = localStorage.getItem('bot_new_api_token') || localStorage.getItem('auth_info');
    const isBotLoggedInOnly = Boolean(botToken && !hasValidLegacyToken);

    const handleConnectLegacyAuth = useCallback(async () => {
        try {
            const url = await generateOAuthURL();
            if (url) {
                window.location.replace(url);
            }
        } catch (e) {
            console.error('[DTrader] OAuth redirect failed:', e);
        }
    }, []);

    // Build iframe src URL.
    // DTrader's bridge-client.ts checks event.origin against a whitelist — only Deriv production
    // origins are trusted. Our domain is not in that whitelist, so postMessage handshakes are
    // silently ignored. The only reliable cross-origin auth delivery mechanism DTrader supports
    // is acct1/token1 in the iframe src URL query string, which DTrader reads once on load,
    // passes to the WebSocket authorize call, then discards. Tokens are NOT visible in the
    // parent window's address bar (they are inside the iframe src attribute value only).
    const iframeSrc = useMemo(() => {
        const params = new URLSearchParams();

        params.set('app_id', activeAppId);
        params.set('theme', 'dark');
        params.set('lang', 'EN');
        params.set('embed', 'true');
        params.set('is_embedded', 'true');
        params.set('standalone', 'true');
        params.set('hide_header', 'true');
        params.set('hideHeader', 'true');
        params.set('has_top_bar', 'false');

        if (hasValidLegacyToken && legacyToken && activeLoginId) {
            // Authenticated: inject credentials so DTrader can authorize via WebSocket v3.
            // acct1/token1 are the canonical URL-based auth params DTrader expects.
            params.set('acct1', activeLoginId);
            params.set('token1', legacyToken);
            params.set('cur1', currency);
            params.set('loginid', activeLoginId);
            params.set('hide_login', 'true');
            params.set('hide_signup', 'true');
        } else {
            // Unauthenticated / guest preview: let DTrader show its own login UI
            // instead of silently timing out with Bridge auth timeout.
            params.set('hide_login', 'false');
            params.set('hide_signup', 'false');
        }

        return `${DTRADER_BASE_URL}/?${params.toString()}`;
    }, [activeAppId, activeLoginId, currency, hasValidLegacyToken, legacyToken]);


    /**
     * Dispatch session synchronization strictly with legacy token schema
     */
    const syncSessionToIframe = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow || !hasValidLegacyToken || !legacyToken) return;

        const effectiveLoginId = activeLoginId || 'DOT100000';

        const payloadInner = {
            status: 'success',
            tokenPresent: true,
            token: legacyToken,
            token1: legacyToken,
            loginid: effectiveLoginId,
            loginId: effectiveLoginId,
            acct1: effectiveLoginId,
            account_id: effectiveLoginId,
            currency: currency || 'USD',
            cur1: currency || 'USD',
            accountType: 'ZOOM',
            account_type: 'ZOOM',
            appId: Number(activeAppId) || 121856,
            app_id: activeAppId,
            server: 'green',
            timestamp: Date.now(),
            authMode: 'token',
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

        const postToIframe = (msg: any) => {
            try {
                iframe.contentWindow?.postMessage(msg, TARGET_ORIGIN);
            } catch {
                // cross-origin protection
            }
        };

        // 1. Dispatch the expected NewdtraderBridge Auth Handshake
        postToIframe({
            type: 'NEWDTRADER_BRIDGE_AUTH',
            msg_type: 'authorization',
            accountName: effectiveLoginId,
            payload: payloadInner,
            ...payloadInner,
        });

        // 2. Dispatch legacy fallback payload
        postToIframe({
            action: 'authorize',
            token: legacyToken,
            loginid: effectiveLoginId,
        });

        // 3. Dispatch compatibility messages
        postToIframe({ action: 'NEWDTRADER_BRIDGE_AUTH', msg_type: 'authorization', ...payloadInner, payload: payloadInner });
        postToIframe({ type: 'SESSION_DATA', ...payloadInner });
        postToIframe({ type: 'DERIV_AUTH', ...payloadInner });
        postToIframe({ type: 'AUTH_TOKEN', ...payloadInner });
        postToIframe({ action: 'setToken', ...payloadInner });
        postToIframe({ action: 'login', ...payloadInner });
    }, [activeAppId, activeLoginId, currency, hasValidLegacyToken, legacyToken]);

    const intervalRef = useRef<any>(null);
    const safetyTimeoutRef = useRef<any>(null);

    const stopHandshakeLoop = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current);
            safetyTimeoutRef.current = null;
        }
    }, []);

    const startAuthBridgeHandshake = useCallback(() => {
        // Since DTrader's bridge-client.ts whitelist excludes our origin, postMessage
        // handshakes are dropped. Auth is delivered via iframe URL token1 param instead.
        // We still send postMessages as a best-effort fallback for future bridge versions.
        if (!hasValidLegacyToken) return; // skip in guest mode — no token to send

        stopHandshakeLoop();

        // Best-effort postMessage (may be ignored by bridge-client origin check)
        syncSessionToIframe();

        intervalRef.current = setInterval(() => {
            syncSessionToIframe();
        }, 500);

        // Stop polling after 4 seconds
        safetyTimeoutRef.current = setTimeout(() => {
            stopHandshakeLoop();
        }, 4000);
    }, [stopHandshakeLoop, syncSessionToIframe, hasValidLegacyToken]);

    // Handle postMessage events from the DTrader iframe
    useEffect(() => {
        const handleIframeMessage = (event: MessageEvent) => {
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

            // Stop handshake interval upon successful handshake or failure response
            if (
                type === 'NEWDTRADER_BRIDGE_AUTH_SUCCESS' ||
                type === 'NEWDTRADER_BRIDGE_AUTH_FAILED' ||
                data?.msg_type === 'authorize' ||
                data?.msg_type === 'authorization'
            ) {
                console.log('[ParentBridge] Handshake acknowledged by DTrader V2RootGate.');
                stopHandshakeLoop();

                if (type === 'NEWDTRADER_BRIDGE_AUTH_SUCCESS' || data?.msg_type === 'authorize') {
                    setHasTokenMismatch(false);
                    setAuthSuccess(true);
                    setIsLoading(false);
                    // Cancel auth guard — DTrader confirmed session
                    if (authGuardTimeoutRef.current) {
                        clearTimeout(authGuardTimeoutRef.current);
                        authGuardTimeoutRef.current = null;
                    }
                } else if (type === 'NEWDTRADER_BRIDGE_AUTH_FAILED') {
                    console.error('[ParentBridge] Bridge rejected credentials:', data?.error);
                    if (legacyToken) purgeInvalidToken(legacyToken);
                    setHasTokenMismatch(true);
                    setAuthSuccess(false);
                }
                return;
            }

            if (
                type === 'IFRAME_READY' ||
                type === 'BRIDGE_READY' ||
                type === 'REQUEST_AUTH' ||
                type === 'REQUEST_SESSION' ||
                type === 'PING' ||
                type === 'NEWDTRADER_BRIDGE_INIT'
            ) {
                startAuthBridgeHandshake();
                return;
            }

            if (type === 'REQUEST_TOKEN' && hasValidLegacyToken) {
                if (event.source && typeof (event.source as Window).postMessage === 'function') {
                    (event.source as Window).postMessage(
                        { type: 'AUTH_TOKEN', token: legacyToken },
                        TARGET_ORIGIN
                    );
                }
            }

            // Handle explicit login / auth requests from DTrader iframe
            if (
                type === 'LOGIN' ||
                type === 'LOG_IN' ||
                type === 'LOG_IN_AGAIN' ||
                type === 'REQUEST_LOGIN' ||
                type === 'OAUTH_REDIRECT' ||
                data?.action === 'login' ||
                data?.msg_type === 'login'
            ) {
                console.log('[ParentBridge] Received login request from DTrader iframe, redirecting to Legacy OAuth...');
                handleConnectLegacyAuth();
                return;
            }

            // Handle session expired, token rejection, or bridge timeout
            if (
                type === 'SESSION_EXPIRED' ||
                type === 'INVALID_TOKEN' ||
                type === 'NEWDTRADER_BRIDGE_AUTH_FAILED' ||
                type === 'BRIDGE_AUTH_TIMEOUT'
            ) {
                console.warn('[ParentBridge] DTrader session expired or invalid token reported.');
                if (legacyToken) {
                    purgeInvalidToken(legacyToken);
                }
                setHasTokenMismatch(true);
                setGuestPreview(false);
                return;
            }
        };

        window.addEventListener('message', handleIframeMessage);
        return () => {
            window.removeEventListener('message', handleIframeMessage);
            stopHandshakeLoop();
        };
    }, [handleConnectLegacyAuth, hasValidLegacyToken, legacyToken, startAuthBridgeHandshake, stopHandshakeLoop]);

    const handleIframeLoad = () => {
        setIsLoading(false);
        startAuthBridgeHandshake();

        // Parent-side auth watchdog: DTrader's bridge-client checks event.origin and
        // silently drops messages from non-Deriv origins. Auth is delivered via URL
        // token1 param. If DTrader's own authorize flow fails (expired/invalid token)
        // it will post SESSION_EXPIRED or INVALID_TOKEN back — but as a safety net,
        // if we haven't confirmed success after 10 seconds, purge and show re-auth.
        if (hasValidLegacyToken && !authSuccess) {
            if (authGuardTimeoutRef.current) clearTimeout(authGuardTimeoutRef.current);
            authGuardTimeoutRef.current = setTimeout(() => {
                // Only trigger if we still haven't gotten a success confirmation
                setAuthSuccess(prev => {
                    if (!prev) {
                        console.warn(
                            '[ParentBridge] Auth guard fired: no confirmation from DTrader after 10s. ' +
                            'Token may be expired. Purging and showing re-auth gateway.'
                        );
                        if (legacyToken) purgeInvalidToken(legacyToken);
                        setHasTokenMismatch(true);
                    }
                    return prev;
                });
            }, 10000);
        }
    };

    // Cleanup auth guard on unmount
    useEffect(() => {
        return () => {
            if (authGuardTimeoutRef.current) clearTimeout(authGuardTimeoutRef.current);
        };
    }, []);

    if (!hasValidLegacyToken && !guestPreview) {
        return (
            <div className={`dtrader-container ${className}`}>
                {isBotLoggedInOnly && (
                    <div className='dtrader-container__notice-banner'>
                        <span>
                            💡 Your Bot is authenticated via New Deriv API. To activate DTrader Terminal, connect your Legacy Deriv session.
                        </span>
                        <button
                            type='button'
                            className='dtrader-container__action-btn'
                            onClick={handleConnectLegacyAuth}
                        >
                            Connect DTrader
                        </button>
                    </div>
                )}

                <div className='dtrader-container__gateway'>
                    <div className='dtrader-gateway__card'>
                        <div className='dtrader-gateway__badge'>
                            <span className='dtrader-gateway__badge-dot' />
                            INSTITUTIONAL SUITE • OPTIONS TERMINAL
                        </div>
                        <h2 className='dtrader-gateway__title'>
                            {hasTokenMismatch ? 'Session Expired' : 'Deriv DTrader Terminal'}
                        </h2>
                        <p className='dtrader-gateway__desc'>
                            {hasTokenMismatch
                                ? 'Your DTrader trading session has expired or was revoked. Please log in again to restore live multi-barrier options, ticks, and account balance.'
                                : 'Deriv DTrader requires an authenticated Deriv session to execute contracts, stream real-time ticks, and manage your account.'}
                        </p>

                        <div className='dtrader-gateway__actions'>
                            <button
                                type='button'
                                className='dtrader-gateway__btn dtrader-gateway__btn--primary'
                                onClick={handleConnectLegacyAuth}
                            >
                                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                                    <rect x='3' y='11' width='18' height='11' rx='2' ry='2' />
                                    <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                                </svg>
                                {hasTokenMismatch ? 'Log In Again' : 'Log In with Deriv'}
                            </button>
                            {!hasTokenMismatch && (
                                <button
                                    type='button'
                                    className='dtrader-gateway__btn dtrader-gateway__btn--secondary'
                                    onClick={() => setGuestPreview(true)}
                                >
                                    Launch Guest Demo Preview
                                </button>
                            )}
                        </div>

                        <div className='dtrader-gateway__footer'>
                            <span className='dtrader-gateway__feature'>⚡ Low Latency Execution</span>
                            <span className='dtrader-gateway__feature'>🛡️ Isolated Legacy Options API</span>
                            <span className='dtrader-gateway__feature'>🔒 Ephemeral Token Injection</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`dtrader-container ${className}`}>
            {isBotLoggedInOnly && !hasValidLegacyToken && (
                <div className='dtrader-container__notice-banner'>
                    <span>
                        💡 Your Bot is authenticated via New Deriv API. To activate DTrader Terminal, connect your Legacy Deriv session.
                    </span>
                    <button
                        type='button'
                        className='dtrader-container__action-btn'
                        onClick={handleConnectLegacyAuth}
                    >
                        Connect DTrader
                    </button>
                </div>
            )}

            {hasTokenMismatch && (
                <div className='dtrader-container__expired-banner'>
                    <span>DTrader trading session expired or invalid. Please re-authenticate your Legacy session.</span>
                    <button
                        type='button'
                        className='dtrader-container__action-btn dtrader-container__action-btn--danger'
                        onClick={handleConnectLegacyAuth}
                    >
                        Log In Again
                    </button>
                </div>
            )}

            <div className='dtrader-container__frame-wrapper'>
                {isLoading && (
                    <div className='dtrader-container__loader'>
                        <div
                            style={{
                                width: '32px',
                                height: '32px',
                                border: '3px solid rgba(0, 229, 255, 0.2)',
                                borderTopColor: '#00e5ff',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }}
                        />
                        <span className='loader-sub'>Loading DTrader Terminal...</span>
                    </div>
                )}

                <iframe
                    ref={iframeRef}
                    key={iframeSrc}
                    src={iframeSrc}
                    title='Deriv DTrader'
                    className='dtrader-container__iframe'
                    sandbox='allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads allow-top-navigation-by-user-activation'
                    allow='autoplay; clipboard-write; camera; microphone; geolocation'
                    onLoad={handleIframeLoad}
                />
            </div>
        </div>
    );
});

export default DTraderIframeContainer;
