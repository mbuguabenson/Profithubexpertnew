import React, { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { ParentBridgeClient } from './parent-bridge';
import { BridgeEvent, createMessage } from './protocol';
import { resolveValidDerivWSToken } from '@/utils/token-bridge';
import { makeBridgeLogger, generateInstanceId } from './bridge-diagnostics';
import { V2GetActiveClientId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId } from '@/components/shared/utils/config/config';
import { Loader2 } from 'lucide-react';

interface DTraderIframeContainerProps {
    standaloneUrl?: string;
    className?: string;
    onLoad?: () => void;
    hideHeader?: boolean;
}

export const DTraderIframeContainer: React.FC<DTraderIframeContainerProps> = observer(({
    standaloneUrl,
    className = '',
    onLoad,
    hideHeader = true,
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tokenData, setTokenData] = useState<{ token: string; loginid: string }>({ token: '', loginid: '' });
    const { client } = useStore();
    const instanceIdRef = useRef<string | null>(null);
    if (!instanceIdRef.current) instanceIdRef.current = generateInstanceId();
    const logger = makeBridgeLogger(instanceIdRef.current);
    const initializationCount = useRef<number>(0);

    const rawUrl = standaloneUrl || process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app';

    // Resolve active account and OAuth token
    useEffect(() => {
        let isMounted = true;
        const fetchAuth = async () => {
            const loginid = V2GetActiveClientId() || client?.loginid || localStorage.getItem('active_loginid') || '';
            const validToken = await resolveValidDerivWSToken(loginid);
            if (isMounted) {
                setTokenData({ token: validToken, loginid });
            }
        };
        fetchAuth();
        return () => { isMounted = false; };
    }, [client?.loginid]);

    const syncSession = useCallback(async (includeToken = false) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;

        const activeLoginId = tokenData.loginid || V2GetActiveClientId() || client?.loginid || localStorage.getItem('active_loginid') || '';
        const token = tokenData.token || await resolveValidDerivWSToken(activeLoginId);
        const appId = getAppId() || '121856';
        const currency = client?.currency || 'USD';
        const maskedToken = token ? `${token.slice(0, 4)}...${token.slice(-4)}` : 'none';

        logger.debug('SYNC_SESSION_PREPARE', { loginid: activeLoginId, tokenMasked: maskedToken });

        if (!activeLoginId) return;

        initializationCount.current += 0; // no-op here, keep count changes explicit elsewhere

        // Minimal session payload to allow iframe to signal readiness.
        const sessionPayload: any = {
            loginid: activeLoginId,
            loginId: activeLoginId,
            acct1: activeLoginId,
            currency,
            cur1: currency,
            isDemo: activeLoginId.startsWith('VR'),
            appId,
            app_id: appId,
            theme: 'dark',
            standalone: true,
            hideHeader,
            authMode: 'derivws_otp',
            bt_secret: 'binarytool',
        };

        // Only include token fields when explicitly requested by the iframe
        if (includeToken && token) {
            sessionPayload.token = token;
        }

        const sessionMsg = createMessage(
            BridgeEvent.SESSION_DATA,
            appId,
            'parent',
            sessionPayload
        );

        try {
            // Compute explicit target origin to avoid wildcard '*'
            const targetOrigin = (() => {
                try { return new URL(iframe.src).origin; } catch { return '*'; }
            })();

            // Debug: log masked token/loginid when posting session to iframe
            try { logger.debug('SYNC_SESSION', { loginid: activeLoginId, tokenPresent: !!sessionPayload.token, targetOrigin }); } catch (e) {}

            // Outgoing message diagnostics in requested safe format
            try { console.debug('[NewdtraderBridge] message sent', { targetOrigin, type: sessionMsg?.type, action: (sessionMsg as any)?.action }); } catch (e) {}

            iframe.contentWindow.postMessage(sessionMsg, targetOrigin);
            // Send minimal session notices; token-bearing messages only if requested
            iframe.contentWindow.postMessage({ type: 'SESSION_DATA', ...sessionPayload }, targetOrigin);
            iframe.contentWindow.postMessage({ type: 'DERIV_AUTH', ...sessionPayload }, targetOrigin);
            logger.messageSent(targetOrigin, 'SESSION_DATA/DERIV_AUTH');
            if (includeToken && sessionPayload.token) {
                logger.messageSent(targetOrigin, 'AUTH_TOKEN');
                iframe.contentWindow.postMessage({ type: 'AUTH_TOKEN', ...sessionPayload }, targetOrigin);
                iframe.contentWindow.postMessage({ action: 'setToken', ...sessionPayload }, targetOrigin);
                iframe.contentWindow.postMessage({ action: 'login', ...sessionPayload }, targetOrigin);
                iframe.contentWindow.postMessage({ action: 'SYNC_SESSION', ...sessionPayload }, targetOrigin);
                iframe.contentWindow.postMessage(JSON.stringify({ type: 'SESSION_DATA', ...sessionPayload }), targetOrigin);
            }
        } catch (e) {
            console.warn('[DTraderIframe] Error sending auth postMessage:', e);
            try { console.error('[DTraderIframe] syncSession failed to post to iframe', e); } catch (err) {}
        }
    }, [tokenData, client?.currency, hideHeader]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        initializationCount.current += 1;
        logger.debug('INITIALIZATION_COUNT', { count: initializationCount.current });

        const timer = setTimeout(() => setIsLoading(false), 2500);

        const bridge = new ParentBridgeClient();
        // Determine explicit iframe origin to avoid using '*'
        let computedIframeOrigin = '*';
        try {
            computedIframeOrigin = new URL(iframeSrc).origin;
        } catch (e) {
            computedIframeOrigin = '*';
        }
        logger.debug('IFRAME_CREATE', { iframeSrc, iframeOrigin: computedIframeOrigin });
        bridge.attach(iframe, computedIframeOrigin);

        const handleLoad = () => {
            setIsLoading(false);
            logger.debug('IFRAME_LOAD', { iframeSrc });
            logger.debug('IFRAME_CONTENT_WINDOW', { contentWindowExists: !!iframe.contentWindow });
            // Send a minimal handshake first; iframe should request token if needed
            syncSession(false);
            const retryDelays = [100, 300, 600, 1200, 2500, 5000];
            retryDelays.forEach(ms => setTimeout(() => syncSession(false), ms));
            if (onLoad) onLoad();
        };

        const handleMessage = (event: MessageEvent) => {
            if (event.data && typeof event.data === 'object') {
                const type = event.data.type || event.data.action;
                const action = event.data.action;
                try { logger.messageReceived(event.origin, type, action); } catch (e) {}

                // Additional explicit diagnostic line matching requested format (no credentials)
                try {
                    console.debug('[NewdtraderBridge] message received', {
                        origin: event.origin,
                        type,
                        action,
                        sourceIsIframe: event.source === iframe.contentWindow,
                    });
                } catch (e) {}

                // If iframe explicitly requests auth/session, include token
                if (type === 'REQUEST_AUTH' || type === 'GET_SESSION' || type === 'CHECK_AUTH' || type === 'REQUEST_SESSION') {
                    syncSession(true);
                } else if (type === 'PING') {
                    // keep-alive / readiness check - respond minimally
                    syncSession(false);
                }
            }
        };

            // Register window message listener before sending any messages
            window.addEventListener('message', handleMessage);
            iframe.addEventListener('load', handleLoad);
            // Initial sync without token; syncSession will compute target origin from iframe.src
            syncSession();

        return () => {
            clearTimeout(timer);
            iframe.removeEventListener('load', handleLoad);
            window.removeEventListener('message', handleMessage);
            bridge.detach();
        };
    }, [syncSession, onLoad]);

    // Construct full DTrader route URL with all accounts & tokens as query parameters
    const appId = getAppId() || '121856';
    const currency = client?.currency || 'USD';

    let targetBase = rawUrl.trim();
    if (!targetBase.includes('/dtrader') && !targetBase.includes('localhost')) {
        targetBase = `${targetBase.replace(/\/$/, '')}/dtrader`;
    }

    const queryParams = new URLSearchParams();
    queryParams.set('embed', 'true');
    queryParams.set('theme', 'dark');
    queryParams.set('hideHeader', String(hideHeader));
    queryParams.set('lang', 'EN');
    queryParams.set('bt_secret', 'binarytool');
    queryParams.set('app_id', appId);
    queryParams.set('cur1', currency);

    // Do NOT include legacy account tokens in iframe URL query parameters.
    // Authentication will be performed via postMessage using the "derivws_otp" authMode.

    const iframeSrc = `${targetBase}?${queryParams.toString()}`;

    return (
        <div className={`dtrader-standalone-container ${className}`} style={{ width: '100%', height: '100%', position: 'relative' }}>
            {isLoading && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#090d16',
                    color: '#94a3b8',
                    gap: 12,
                    zIndex: 10
                }}>
                    <Loader2 className="animate-spin" size={32} style={{ color: '#2563eb' }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Loading DTrader Terminal...</span>
                </div>
            )}
            <iframe
                ref={iframeRef}
                src={iframeSrc}
                title="DTrader Standalone Terminal"
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    background: '#0b0e14',
                    display: 'block'
                }}
                allow="autoplay; clipboard-write; camera; microphone; geolocation"
            />
        </div>
    );
});

export default DTraderIframeContainer;
