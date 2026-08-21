import React, { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { ParentBridgeClient } from './parent-bridge';
import { BridgeEvent, createMessage } from './protocol';
import { resolveValidDerivWSToken, getAccountsList, getActiveToken } from '@/utils/token-bridge';
import { makeBridgeLogger, generateInstanceId } from './bridge-diagnostics';
import IframeAuthService from './iframe-auth.service';
import { V2GetActiveClientId } from '@/external/bot-skeleton/services/api/appId';
import { getClientId } from '@/components/shared/utils/config/config';
import { Loader2 } from 'lucide-react';

interface DigitFlowIframeContainerProps {
    standaloneUrl?: string;
    className?: string;
    onLoad?: () => void;
    hideHeader?: boolean;
}

export const DigitFlowIframeContainer: React.FC<DigitFlowIframeContainerProps> = observer(({
    standaloneUrl,
    className = '',
    onLoad,
    hideHeader = true,
}) => {
    const { client } = useStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tokenData, setTokenData] = useState<{ token: string; loginid: string }>(() => {
        const loginid = V2GetActiveClientId() || localStorage.getItem('active_loginid') || '';
        const token = getActiveToken() || '';
        return { token, loginid };
    });
    const instanceIdRef = useRef<string | null>(null);
    if (!instanceIdRef.current) instanceIdRef.current = generateInstanceId();
    const logger = makeBridgeLogger(instanceIdRef.current);
    const initializationCount = useRef<number>(0);

    const rawUrl = standaloneUrl || 'https://digitflowhub.vercel.app';

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
        const appId = getClientId() || '33Mmq9JHMrJaUKT2KIhKZ';
        const currency = client?.currency || 'USD';
        const maskedToken = token ? `${token.slice(0, 4)}...${token.slice(-4)}` : 'none';

        logger.debug('DIGITFLOW_SYNC_SESSION_PREPARE', { loginid: activeLoginId, tokenMasked: maskedToken });

        if (!activeLoginId) return;

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
            const targetOrigin = (() => {
                try { return new URL(iframe.src).origin; } catch { return '*'; }
            })();

            iframe.contentWindow.postMessage(sessionMsg, targetOrigin);
            iframe.contentWindow.postMessage({ type: 'SESSION_DATA', ...sessionPayload }, targetOrigin);
            iframe.contentWindow.postMessage({ type: 'DERIV_AUTH', ...sessionPayload }, targetOrigin);
            
            if (includeToken && sessionPayload.token) {
                iframe.contentWindow.postMessage({ type: 'AUTH_TOKEN', ...sessionPayload }, targetOrigin);
                iframe.contentWindow.postMessage({ action: 'setToken', ...sessionPayload }, targetOrigin);
                iframe.contentWindow.postMessage({ action: 'login', ...sessionPayload }, targetOrigin);
                iframe.contentWindow.postMessage({ action: 'SYNC_SESSION', ...sessionPayload }, targetOrigin);
                iframe.contentWindow.postMessage(JSON.stringify({ type: 'SESSION_DATA', ...sessionPayload }), targetOrigin);
            }
        } catch (e) {
            console.warn('[DigitFlowIframe] Error sending auth postMessage:', e);
        }
    }, [tokenData, client?.currency, hideHeader]);

    const appId = getClientId() || '33Mmq9JHMrJaUKT2KIhKZ';
    const currency = client?.currency || 'USD';
    const loginId = tokenData.loginid || client?.loginid || localStorage.getItem('active_loginid') || '';

    const targetBase = rawUrl.trim().replace(/\/$/, '');

    const queryParams = new URLSearchParams();
    queryParams.set('embed', 'true');
    queryParams.set('theme', 'dark');
    queryParams.set('hideHeader', String(hideHeader));
    queryParams.set('lang', 'EN');
    queryParams.set('bt_secret', 'binarytool');
    queryParams.set('app_id', appId);
    queryParams.set('client_id', appId);
    queryParams.set('api_version', 'v2');
    
    const activeToken = tokenData.token || '';
    if (loginId) {
        queryParams.set('acct1', loginId);
        queryParams.set('cur1', currency);
        if (activeToken) {
            queryParams.set('token1', activeToken);
        }
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
            }
        }
    } catch (error) {
        // no-op
    }

    const iframeSrc = `${targetBase}?${queryParams.toString()}`;

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        initializationCount.current += 1;
        logger.debug('DIGITFLOW_INITIALIZATION_COUNT', { count: initializationCount.current });

        const timer = setTimeout(() => setIsLoading(false), 2500);

        const bridge = new ParentBridgeClient();
        let computedIframeOrigin = '*';
        try {
            computedIframeOrigin = new URL(iframeSrc).origin;
        } catch (e) {
            computedIframeOrigin = '*';
        }
        bridge.attach(iframe, computedIframeOrigin);

        const authService = new IframeAuthService(iframeRef, syncSession, logger);
        authService.start();

        const handleLoad = () => {
            setIsLoading(false);
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

    return (
        <div className={`digitflow-standalone-container ${className}`} style={{ width: '100%', height: '100%', position: 'relative' }}>
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
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Loading DigitFlow...</span>
                </div>
            )}
            <iframe
                ref={iframeRef}
                src={iframeSrc}
                title="DigitFlow Standalone Terminal"
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

export default DigitFlowIframeContainer;
