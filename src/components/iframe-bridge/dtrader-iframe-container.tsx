import React, { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { ParentBridgeClient } from './parent-bridge';
import { BridgeEvent, createMessage } from './protocol';
import { resolveValidDerivWSToken, getAccountsList, getActiveToken } from '@/utils/token-bridge';
import { makeBridgeLogger, generateInstanceId } from './bridge-diagnostics';
import IframeAuthService from './iframe-auth.service';
import { V2GetActiveClientId } from '@/external/bot-skeleton/services/api/appId';
import { getClientId, getAppId } from '@/components/shared/utils/config/config';
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
    const { client } = useStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tokenData, setTokenData] = useState<{ token: string; loginid: string }>(() => {
        const loginid = V2GetActiveClientId() || client?.loginid || localStorage.getItem('active_loginid') || '';
        const token = getActiveToken() || '';
        return { token, loginid };
    });
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
        const clientId = getClientId() || '33Mmq9JHMrJaUKT2KIhKZ';
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
            clientId,
            client_id: clientId,
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
            // Use '*' to prevent DOMException/console error when iframe is still on about:blank
            const targetOrigin = '*';

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

    // Construct full DTrader route URL with settings in query params and tokens in hash
    const appId = getAppId() || '121856';
    const clientId = getClientId() || '33Mmq9JHMrJaUKT2KIhKZ';
    const currency = client?.currency || 'USD';
    const loginId = tokenData.loginid || client?.loginid || localStorage.getItem('active_loginid') || '';

    let targetBase = rawUrl.trim();
    if (!targetBase.includes('/dtrader')) {
        const isOfficialDerivDomain = targetBase.includes('deriv.app') || targetBase.includes('binary.sx') || targetBase.includes('deriv.com');
        if (isOfficialDerivDomain) {
            targetBase = `${targetBase.replace(/\/$/, '')}/dtrader`;
        }
    }

    const queryParams = new URLSearchParams();
    queryParams.set('embed', 'true');
    queryParams.set('theme', 'dark');
    queryParams.set('hideHeader', String(hideHeader));
    queryParams.set('lang', 'EN');
    queryParams.set('bt_secret', 'binarytool');
    queryParams.set('app_id', appId);
    queryParams.set('client_id', clientId);
    queryParams.set('api_version', 'v2');
    
    const hashParams = new URLSearchParams();
    const activeToken = tokenData.token || '';

    if (loginId && activeToken) {
        // Pass to both queryParams AND hashParams so every Deriv DTrader variant detects auth immediately on boot
        queryParams.set('acct1', loginId);
        queryParams.set('cur1', currency);
        queryParams.set('token1', activeToken);

        hashParams.set('acct1', loginId);
        hashParams.set('cur1', currency);
        hashParams.set('token1', activeToken);
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
                queryParams.set(`cur${index}`, currency || 'USD');

                hashParams.set(`acct${index}`, accId);
                hashParams.set(`token${index}`, accToken);
                hashParams.set(`cur${index}`, currency || 'USD');
            }
        }
    } catch (error) {
        // no-op
    }

    const iframeSrc = `${targetBase}?${queryParams.toString()}#${hashParams.toString()}`;

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

        // Install auth service which centralizes handshake retries and message handling
        const authService = new IframeAuthService(iframeRef, syncSession, logger);
        authService.start();

        const handleLoad = () => {
            setIsLoading(false);
            logger.debug('IFRAME_LOAD', { iframeSrc });
            logger.debug('IFRAME_CONTENT_WINDOW', { contentWindowExists: !!iframe.contentWindow });
            // Initial minimal sync; authService will continue retries and respond to iframe requests
            syncSession(false);
            if (onLoad) onLoad();
        };

        iframe.addEventListener('load', handleLoad);

        return () => {
            clearTimeout(timer);
            iframe.removeEventListener('load', handleLoad);
            bridge.detach();
            authService.stop();
        };
    }, [syncSession, onLoad, iframeSrc]);

    if (!loginId || !activeToken) {
        return (
            <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle at center, #121c30 0%, #080c16 100%)',
                color: '#e2e8f0',
                padding: '20px'
            }}>
                <div style={{
                    maxWidth: '480px',
                    width: '100%',
                    background: 'rgba(20, 30, 50, 0.85)',
                    backdropFilter: 'blur(20px)',
                    border: '1.5px solid rgba(0, 242, 254, 0.35)',
                    borderRadius: '20px',
                    padding: '36px',
                    textAlign: 'center',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(124, 58, 237, 0.2))',
                        border: '1.5px solid #00f2fe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#00f2fe',
                        boxShadow: '0 0 24px rgba(0, 242, 254, 0.3)'
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    </div>
                    <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#f8fafc', margin: 0, letterSpacing: '-0.3px' }}>
                        DTrader Terminal Authentication
                    </h2>
                    <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                        To access live market trading and authorize your account connection, please log in with your Deriv account.
                    </p>
                    <button
                        onClick={async () => {
                            const { generateOAuthURL } = await import('@/components/shared');
                            const url = await generateOAuthURL();
                            if (url) window.location.replace(url);
                        }}
                        style={{
                            marginTop: '8px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '12px 32px',
                            fontSize: '15px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Log in with Deriv
                    </button>
                </div>
            </div>
        );
    }

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
