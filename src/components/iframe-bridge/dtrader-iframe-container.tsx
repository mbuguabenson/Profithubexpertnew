import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { getLegacyAppId, generateLegacyOAuthURL } from '@/components/shared/utils/config/config';
import {
    getLegacyDTraderToken,
    isLegacyToken,
    getAccountsList,
    getActiveLoginId,
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

    const activeAppId = useMemo(() => {
        const appId = getLegacyAppId();
        return appId && /^\d+$/.test(appId) ? appId : '121856';
    }, []);

    const activeLoginId = client?.loginid || getActiveLoginId();
    const currency = client?.currency || localStorage.getItem('client.currency') || 'USD';

    // Strictly resolve a Legacy Deriv token for DTrader
    const legacyToken = getLegacyDTraderToken(activeLoginId) || '';
    const hasValidLegacyToken = isLegacyToken(legacyToken);

    // Detect if user has a bot/New API session but no legacy token connected
    const botToken = localStorage.getItem('bot_new_api_token') || localStorage.getItem('auth_info');
    const isBotLoggedInOnly = Boolean(botToken && !hasValidLegacyToken);

    const handleConnectLegacyAuth = useCallback(() => {
        const url = generateLegacyOAuthURL(activeAppId);
        if (url) {
            window.location.assign(url);
        }
    }, [activeAppId]);

    // Build iframe src URL with isolated legacy parameters
    const iframeSrc = useMemo(() => {
        const params = new URLSearchParams();

        if (hasValidLegacyToken && legacyToken) {
            params.set('token', legacyToken);
            params.set('token1', legacyToken);
            if (activeLoginId) {
                params.set('loginid', activeLoginId);
                params.set('account', activeLoginId);
                params.set('acct1', activeLoginId);
            }
            params.set('cur1', currency);

            // Secondary legacy accounts
            try {
                const accounts = getAccountsList();
                let index = 1;
                for (const accId in accounts) {
                    const accToken = accounts[accId];
                    if (accToken && accId !== activeLoginId && isLegacyToken(accToken)) {
                        index++;
                        params.set(`acct${index}`, accId);
                        params.set(`token${index}`, accToken);
                        params.set(`cur${index}`, currency || 'USD');
                    }
                }
            } catch (e) {
                void e;
            }
        }

        params.set('app_id', activeAppId);
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
    }, [activeAppId, activeLoginId, currency, hasValidLegacyToken, legacyToken]);

    /**
     * Dispatch session synchronization strictly with legacy token schema
     */
    const syncSessionToIframe = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow || !hasValidLegacyToken || !legacyToken) return;

        const effectiveLoginId = activeLoginId || 'DOT100000';
        const accountsList = getAccountsList();
        const isDemo = Boolean(
            effectiveLoginId.startsWith('VR') ||
            effectiveLoginId.startsWith('VRT') ||
            effectiveLoginId.startsWith('DOT') ||
            effectiveLoginId.startsWith('DEM')
        );

        const accounts =
            Object.keys(accountsList).length > 0
                ? Object.entries(accountsList)
                      .filter(([, tok]) => isLegacyToken(tok))
                      .map(([id, tok]) => ({
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
                          token: tok,
                      }))
                : [
                      {
                          account_id: effectiveLoginId,
                          account_type: isDemo ? ('demo' as const) : ('real' as const),
                          currency: currency || 'USD',
                          balance: '10000.00',
                          status: 'active',
                          token: legacyToken,
                      },
                  ];

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
            token: legacyToken,
            accountName: effectiveLoginId,
            appId: String(activeAppId || '121856'),
            currency: currency || 'USD',
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
        stopHandshakeLoop();

        // 1. Send immediate message
        syncSessionToIframe();

        // 2. Poll every 300ms until DTrader's bridge-client acknowledges receiving it
        intervalRef.current = setInterval(() => {
            syncSessionToIframe();
        }, 300);

        // Safety fallback: stop polling after 6 seconds
        safetyTimeoutRef.current = setTimeout(() => {
            stopHandshakeLoop();
        }, 6000);
    }, [stopHandshakeLoop, syncSessionToIframe]);

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
                    setIsLoading(false);
                } else if (type === 'NEWDTRADER_BRIDGE_AUTH_FAILED') {
                    console.error('[ParentBridge] Bridge rejected credentials:', data?.error);
                    setHasTokenMismatch(true);
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

            if (type === 'SESSION_EXPIRED' || type === 'INVALID_TOKEN') {
                setHasTokenMismatch(true);
            }
        };

        window.addEventListener('message', handleIframeMessage);
        return () => {
            window.removeEventListener('message', handleIframeMessage);
            stopHandshakeLoop();
        };
    }, [hasValidLegacyToken, legacyToken, startAuthBridgeHandshake, stopHandshakeLoop]);

    const handleIframeLoad = () => {
        setIsLoading(false);
        startAuthBridgeHandshake();
    };

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
                        Re-connect DTrader
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
                    sandbox='allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads'
                    allow='autoplay; clipboard-write; camera; microphone; geolocation'
                    onLoad={handleIframeLoad}
                />
            </div>
        </div>
    );
});

export default DTraderIframeContainer;
