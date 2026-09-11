import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { secureSessionService } from '@/services/secure-session.service';
import { getAppId } from '@/components/shared/utils/config/config';
import { Loader2 } from 'lucide-react';
import './dtrader-iframe-container.scss';

const DTRADER_BASE_URL = 'https://deriv-dtrader-ten.vercel.app';

interface DTraderIframeContainerProps {
    className?: string;
}


export const DTraderIframeContainer: React.FC<DTraderIframeContainerProps> = observer(({ className = '' }) => {
    const { client } = useStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Session metadata from server — NO raw token in the browser
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

    const activeLoginId   = client?.loginid || sessionMeta?.loginid || '';
    const currency        = client?.currency || sessionMeta?.currency || 'USD';
    const isAuthenticated = Boolean(sessionMeta?.loggedIn && activeLoginId);

    // Build iframe src — only non-sensitive UI flags; NO token in URL
    const iframeSrc = useMemo(() => {
        const params = new URLSearchParams();

        // Embed + UI flags only — credentials are sent via the secure postMessage OTT flow
        params.set('app_id',      activeAppId);
        params.set('client_id',   activeAppId);
        params.set('theme',       'dark');
        params.set('lang',        'EN');
        params.set('embed',       'true');
        params.set('is_embedded', 'true');
        params.set('standalone',  'true');
        params.set('hide_header', 'true');
        params.set('hideHeader',  'true');
        params.set('hide_login',  'true');
        params.set('hide_signup', 'true');
        params.set('has_top_bar', 'false');

        return `${DTRADER_BASE_URL}/?${params.toString()}`;
    }, [activeAppId]);

    /**
     * Sends AUTH_INIT to the iframe (contains only loginid, expiresAt — NO token).
     * The iframe will reply with REQUEST_TOKEN; the parent then fetches an OTT from
     * /api/session/iframe-token and posts it back.
     */
    const sendAuthInit = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;
        if (!isAuthenticated || !activeLoginId) return;

        const targetOrigin = (() => {
            try { return new URL(DTRADER_BASE_URL).origin; } catch { return DTRADER_BASE_URL; }
        })();

        iframe.contentWindow.postMessage({
            type:      'AUTH_INIT',
            source:    'parent',
            loginid:   activeLoginId,
            currency,
            expiresAt: sessionMeta?.expiresAt || (Date.now() + 3600_000),
        }, targetOrigin);
    }, [activeLoginId, currency, isAuthenticated, sessionMeta?.expiresAt]);

    // Listen for iframe REQUEST_TOKEN and reply with OTT (no raw credentials in transit)
    useEffect(() => {
        const iframeOrigin = (() => {
            try { return new URL(DTRADER_BASE_URL).origin; } catch { return DTRADER_BASE_URL; }
        })();

        const handleIframeMessage = async (event: MessageEvent) => {
            // Strict origin check
            if (event.origin !== iframeOrigin) return;
            if (!event.data) return;

            const data = typeof event.data === 'string'
                ? (() => { try { return JSON.parse(event.data); } catch { return null; } })()
                : event.data;

            const type = data?.type || data?.action || '';

            if (type === 'IFRAME_READY' || type === 'BRIDGE_READY' || type === 'REQUEST_AUTH' ||
                type === 'REQUEST_SESSION' || type === 'AUTH_INIT') {
                sendAuthInit();
                return;
            }

            if (type === 'REQUEST_TOKEN') {
                // Iframe is requesting the credential — issue a 60s OTT from the server
                const ott = await secureSessionService.getOTT();
                if (ott && event.source && typeof (event.source as Window).postMessage === 'function') {
                    (event.source as Window).postMessage({ type: 'OTT', ott }, iframeOrigin);
                }
            }
        };

        window.addEventListener('message', handleIframeMessage);
        return () => window.removeEventListener('message', handleIframeMessage);
    }, [sendAuthInit]);

    const handleIframeLoad = () => {
        setIsLoading(false);
        // Send AUTH_INIT immediately on load — no raw token in transit
        sendAuthInit();
        // Retry a couple of times to handle slow React bootstraps inside the iframe
        const t1 = setTimeout(sendAuthInit, 600);
        const t2 = setTimeout(sendAuthInit, 2000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    };

    return (
        <div className={`dtrader-container ${className}`}>
            {/* Iframe Viewport Container (Edge-to-edge, no texts above) */}
            <div className='dtrader-container__frame-wrapper'>
                {isLoading && (
                    <div className='dtrader-container__loader'>
                        <Loader2 className='animate-spin' size={32} style={{ color: '#ff444f' }} />
                        <span className='loader-sub'>Loading DTrader...</span>
                    </div>
                )}

                {/* Seamlessly mask the iframe's internal top-right auth buttons when unauthenticated */}
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
