import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { getAccountsList, getActiveToken, isInvalidBearerToken } from '@/utils/token-bridge';
import { getAppId } from '@/components/shared/utils/config/config';
import './dtrader.scss';

const DTRADER_URL = 'https://deriv-dtrader.vercel.app';

const DTraderPage: React.FC = observer(() => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [iframeKey, setIframeKey] = useState(0);
    const { client } = useStore();

    // Construct the live iframe URL with active session & app_id override query params
    const dtraderSrc = React.useMemo(() => {
        const theme = localStorage.getItem('theme') || 'dark';
        const activeLoginId = client?.loginid || localStorage.getItem('active_loginid') || '';
        const activeToken = localStorage.getItem('active_token') ||
                            localStorage.getItem('deriv_api_token') ||
                            localStorage.getItem('token') ||
                            (activeLoginId ? getActiveToken(activeLoginId) : null) ||
                            localStorage.getItem('authToken') || '';
        const appId = String(getAppId() || localStorage.getItem('config.app_id') || '121856');
        const serverUrl = localStorage.getItem('config.server_url') || 'ws.derivws.com';

        const params = new URLSearchParams();
        if (theme) params.set('theme', theme);
        if (appId) params.set('app_id', appId);
        if (serverUrl) params.set('server_url', serverUrl);
        if (activeLoginId) params.set('account', activeLoginId);
        if (activeLoginId) params.set('acct1', activeLoginId);
        if (activeToken && !isInvalidBearerToken(activeToken)) {
            params.set('token', activeToken);
            params.set('token1', activeToken);
        }
        if (client?.currency) params.set('cur1', client.currency);

        // Append remaining accounts if available
        try {
            const allAccounts = getAccountsList();
            let idx = 2;
            Object.keys(allAccounts).forEach(id => {
                if (id !== activeLoginId && allAccounts[id]) {
                    params.set(`acct${idx}`, id);
                    params.set(`token${idx}`, allAccounts[id]);
                    idx++;
                }
            });
        } catch {}

        return `${DTRADER_URL}/?${params.toString()}`;
    }, [client?.loginid, client?.currency, iframeKey]);

    const sendAuthToIframe = () => {
        try {
            const iframeWin = iframeRef.current?.contentWindow;
            if (!iframeWin) return;

            const activeLoginId = client?.loginid || localStorage.getItem('active_loginid') || '';
            const activeToken = localStorage.getItem('active_token') ||
                                localStorage.getItem('deriv_api_token') ||
                                localStorage.getItem('token') ||
                                getActiveToken(activeLoginId) ||
                                localStorage.getItem('token1') ||
                                localStorage.getItem('authToken') || '';

            const rawAccounts = localStorage.getItem('client.accounts') || localStorage.getItem('client_account_details');
            const appId = String(getAppId() || localStorage.getItem('config.app_id') || '121856');
            const serverUrl = localStorage.getItem('config.server_url') || 'ws.derivws.com';

            const payload = {
                type: 'NEWDTRADER_BRIDGE_AUTH',
                payload: {
                    active_loginid: activeLoginId,
                    active_token: activeToken,
                    token: activeToken,
                    accounts: rawAccounts,
                    server_url: serverUrl,
                    app_id: appId,
                }
            };

            iframeWin.postMessage(payload, '*');
            iframeWin.postMessage({ type: 'SET_SESSION', ...payload.payload }, '*');
            iframeWin.postMessage({ type: 'DERIV_AUTH_OVERRIDE', app_id: appId, server_url: serverUrl, loginid: activeLoginId, token: activeToken }, '*');
        } catch (e) {
            console.warn('[DTraderPage] Error posting session to iframe:', e);
        }
    };

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data && (event.data.type === 'IFRAME_READY' || event.data.type === 'REQUEST_SESSION')) {
                sendAuthToIframe();
            }
        };

        const handleAccountSwitch = () => {
            setIframeKey(prev => prev + 1);
            sendAuthToIframe();
        };

        window.addEventListener('message', handleMessage);
        window.addEventListener('account_switched', handleAccountSwitch);
        return () => {
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('account_switched', handleAccountSwitch);
        };
    }, [client?.loginid]);

    useEffect(() => {
        const handleIframeLoad = () => {
            setIsLoading(false);
            sendAuthToIframe();
        };

        const iframe = iframeRef.current;
        if (iframe) {
            iframe.addEventListener('load', handleIframeLoad);
            return () => {
                iframe.removeEventListener('load', handleIframeLoad);
            };
        }
    }, [dtraderSrc]);

    return (
        <div className="dtrader-page-container">
            {isLoading && (
                <div className="dtrader-loading-overlay">
                    <div className="dtrader-spinner" />
                    <span className="dtrader-loading-text">Loading DTrader Terminal & Charts...</span>
                </div>
            )}
            <iframe
                key={iframeKey}
                ref={iframeRef}
                src={dtraderSrc}
                title="DTrader"
                className="dtrader-iframe-frame"
                allow="clipboard-read; clipboard-write; fullscreen"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            />
        </div>
    );
});

export default DTraderPage;
