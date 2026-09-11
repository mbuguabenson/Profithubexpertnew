import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { secureSessionService } from '@/services/secure-session.service';
import { getActiveToken } from '@/utils/token-bridge';
import { getAppId } from '@/components/shared/utils/config/config';
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
    const isAuthenticated = Boolean(activeLoginId && (activeToken || sessionMeta?.loggedIn));

    // Build iframe src — non-sensitive UI/embed flags ONLY; NEVER send token in URL
    const iframeSrc = useMemo(() => {
        const params = new URLSearchParams();

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
    }, [activeAppId]);

    /**
     * Controlled postMessage flow:
     * Dispatches authentication payload strictly to TARGET_ORIGIN ('https://deriv-dtrader.vercel.app').
     * Never sends token in URL, and validates sender origin on all received messages.
     */
    const syncSessionToIframe = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;
        if (!isAuthenticated || !activeLoginId) return;

        const isDemo = Boolean(activeLoginId.startsWith('VRTC'));

        const sessionPayload = {
            loginid: activeLoginId,
            loginId: activeLoginId,
            acct1: activeLoginId,
            token: activeToken || '',
            token1: activeToken || '',
            currency,
            cur1: currency,
            isDemo,
            appId: activeAppId,
            app_id: activeAppId,
            theme: 'dark',
            standalone: true,
            embed: true,
            is_embedded: true,
            hideHeader: true,
            hide_login: true,
            hide_signup: true,
        };

        const postToIframe = (msg: Record<string, unknown>) => {
            try {
                iframe.contentWindow?.postMessage(msg, TARGET_ORIGIN);
            } catch (err) {
                console.warn('[DTrader] Failed to postMessage to iframe:', err);
            }
        };

        // Standard Deriv App / DTrader message formats
        postToIframe({ type: 'SESSION_DATA', ...sessionPayload });
        postToIframe({ type: 'DERIV_AUTH', ...sessionPayload });
        postToIframe({ type: 'AUTH_TOKEN', ...sessionPayload });
        postToIframe({ action: 'setToken', ...sessionPayload });
        postToIframe({ action: 'login', ...sessionPayload });
        postToIframe({ action: 'SYNC_SESSION', ...sessionPayload });

        // Also broadcast AUTH_INIT for OTT/token-exchange bridge
        postToIframe({
            type: 'AUTH_INIT',
            source: 'parent',
            loginid: activeLoginId,
            currency,
            expiresAt: sessionMeta?.expiresAt || Date.now() + 3600_000,
        });
    }, [activeAppId, activeLoginId, activeToken, currency, isAuthenticated, sessionMeta?.expiresAt]);

    // Listen for iframe readiness messages with strict sender origin validation
    useEffect(() => {
        const handleIframeMessage = async (event: MessageEvent) => {
            // Strict sender's origin validation
            if (event.origin !== TARGET_ORIGIN) return;
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
                type === 'AUTH_INIT'
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
