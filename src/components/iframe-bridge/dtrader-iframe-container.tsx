import React, { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { ParentBridgeClient } from './parent-bridge';
import { BridgeEvent, createMessage } from './protocol';
import { resolveValidDerivWSToken } from '@/utils/token-bridge';
import { V2GetActiveClientId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId } from '@/components/shared/utils/config/config';
import { Loader2 } from 'lucide-react';
import './diagnostics-panel.scss';

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

    const syncSession = useCallback(async () => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;

        const activeLoginId = tokenData.loginid || V2GetActiveClientId() || client?.loginid || localStorage.getItem('active_loginid') || '';
        const token = tokenData.token || await resolveValidDerivWSToken(activeLoginId);
        const appId = getAppId() || '134205';
        const currency = client?.currency || 'USD';

        if (!token || !activeLoginId) return;

        const sessionPayload = {
            token,
            token1: token,
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

        const sessionMsg = createMessage(
            BridgeEvent.SESSION_DATA,
            appId,
            'parent',
            sessionPayload
        );

        try {
            iframe.contentWindow.postMessage(sessionMsg, '*');
            iframe.contentWindow.postMessage({ type: 'AUTH_TOKEN', ...sessionPayload }, '*');
            iframe.contentWindow.postMessage({ type: 'DERIV_AUTH', ...sessionPayload }, '*');
            iframe.contentWindow.postMessage({ action: 'setToken', ...sessionPayload }, '*');
            iframe.contentWindow.postMessage({ action: 'init', ...sessionPayload }, '*');
            iframe.contentWindow.postMessage({ action: 'login', ...sessionPayload }, '*');
            iframe.contentWindow.postMessage({ action: 'SYNC_SESSION', ...sessionPayload }, '*');
            iframe.contentWindow.postMessage(JSON.stringify({ type: 'SESSION_DATA', ...sessionPayload }), '*');
        } catch (e) {
            console.warn('[DTraderIframe] Error sending auth postMessage:', e);
        }
    }, [tokenData, client?.currency, hideHeader]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const timer = setTimeout(() => setIsLoading(false), 2500);

        const bridge = new ParentBridgeClient();
        bridge.attach(iframe, '*');

        const handleLoad = () => {
            setIsLoading(false);
            syncSession();
            const retryDelays = [100, 300, 600, 1200, 2500, 5000];
            retryDelays.forEach(ms => setTimeout(syncSession, ms));
            if (onLoad) onLoad();
        };

        const handleMessage = (event: MessageEvent) => {
            if (event.data && typeof event.data === 'object') {
                const type = event.data.type || event.data.action;
                if (type === 'REQUEST_AUTH' || type === 'PING' || type === 'GET_SESSION' || type === 'CHECK_AUTH') {
                    syncSession();
                }
            }
        };

        iframe.addEventListener('load', handleLoad);
        window.addEventListener('message', handleMessage);
        syncSession();

        return () => {
            clearTimeout(timer);
            iframe.removeEventListener('load', handleLoad);
            window.removeEventListener('message', handleMessage);
            bridge.detach();
        };
    }, [syncSession, onLoad]);

    // Construct full DTrader route URL with all accounts & tokens as query parameters
    const appId = getAppId() || '134205';
    const currency = client?.currency || 'USD';

    let targetBase = rawUrl.trim();
    if (!targetBase.includes('/dtrader') && !targetBase.includes('localhost')) {
        targetBase = `${targetBase.replace(/\/$/, '')}/dtrader`;
    }

    const queryParams = new URLSearchParams();
    queryParams.set('app_id', appId);
    queryParams.set('embed', 'true');
    queryParams.set('theme', 'dark');
    queryParams.set('hideHeader', String(hideHeader));
    queryParams.set('lang', 'EN');
    queryParams.set('bt_secret', 'binarytool');

    const accountsMap: Record<string, string> = (() => {
        try {
            return JSON.parse(localStorage.getItem('accountsList') || '{}');
        } catch {
            return {};
        }
    })();

    let idx = 1;
    // Set active account first
    if (tokenData.loginid && tokenData.token) {
        queryParams.set(`acct${idx}`, tokenData.loginid);
        queryParams.set(`token${idx}`, tokenData.token);
        queryParams.set(`cur${idx}`, currency);
        idx++;
    }

    // Set remaining accounts
    Object.entries(accountsMap).forEach(([accId, accToken]) => {
        if (accId !== tokenData.loginid && accToken && !accToken.startsWith('ory_at_')) {
            queryParams.set(`acct${idx}`, accId);
            queryParams.set(`token${idx}`, accToken);
            queryParams.set(`cur${idx}`, 'USD');
            idx++;
        }
    });

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
