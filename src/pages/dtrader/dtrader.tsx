import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { getAccountsList } from '@/utils/token-bridge';
import './dtrader.scss';

const DTRADER_URL = 'https://deriv-dtrader.vercel.app';

const DTraderPage: React.FC = observer(() => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [iframeKey, setIframeKey] = useState(0);
    const { client } = useStore();

    // Construct the live iframe URL with all session & app_id override query params
    const dtraderSrc = React.useMemo(() => {
        const theme = localStorage.getItem('theme') || 'dark';
        const activeLoginId = client?.loginid || localStorage.getItem('active_loginid') || '';
        const activeToken = localStorage.getItem('active_token') ||
                            localStorage.getItem('deriv_api_token') ||
                            localStorage.getItem('token') ||
                            localStorage.getItem('authToken') || '';
        const appId = localStorage.getItem('config.app_id') || '121856';
        const serverUrl = localStorage.getItem('config.server_url') || 'ws.derivws.com';

        const params = new URLSearchParams();
        if (theme) params.set('theme', theme);
        if (appId) params.set('app_id', appId);
        if (serverUrl) params.set('server_url', serverUrl);
        if (activeLoginId) params.set('account', activeLoginId);
        if (activeLoginId) params.set('acct1', activeLoginId);
        if (activeToken) {
            params.set('token', activeToken);
            params.set('token1', activeToken);
        } else {
            // Anti-clickjack bypass token parameter for guest view
            params.set('token', 'guest');
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
                                localStorage.getItem('token1') ||
                                localStorage.getItem('authToken') || '';

            const rawAccounts = localStorage.getItem('client.accounts') || localStorage.getItem('client_account_details');
            const appId = localStorage.getItem('config.app_id') || '121856';
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

    const handleOpenNewTab = () => {
        const activeLoginId = client?.loginid || localStorage.getItem('active_loginid') || '';
        const activeToken = localStorage.getItem('active_token') ||
                            localStorage.getItem('deriv_api_token') ||
                            localStorage.getItem('token') ||
                            localStorage.getItem('authToken') || '';
        const params = new URLSearchParams();
        if (activeLoginId) params.set('account', activeLoginId);
        if (activeToken) params.set('token1', activeToken);
        const url = `${DTRADER_URL}/?${params.toString()}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleReload = () => {
        setIsLoading(true);
        setIframeKey(prev => prev + 1);
    };

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data && (event.data.type === 'IFRAME_READY' || event.data.type === 'REQUEST_SESSION')) {
                sendAuthToIframe();
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
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
            <div className="dtrader-toolbar">
                <div className="dtrader-toolbar__left">
                    <span className="dtrader-toolbar__title">DTrader Terminal</span>
                    <span className="dtrader-toolbar__badge">Live Trading & Advanced Charts</span>
                </div>
                <div className="dtrader-toolbar__right">
                    <button
                        className="dtrader-toolbar__btn"
                        onClick={handleReload}
                        title="Reload DTrader Terminal"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 4v6h-6" />
                            <path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        <span>Refresh</span>
                    </button>
                    <button
                        className="dtrader-toolbar__btn dtrader-toolbar__btn--primary"
                        onClick={handleOpenNewTab}
                        title="Open DTrader in a separate browser tab"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        <span>Open in New Tab</span>
                    </button>
                </div>
            </div>
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
