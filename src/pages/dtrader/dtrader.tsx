import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './dtrader.scss';

const DTraderPage: React.FC = observer(() => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { client } = useStore();

    // Ensure tokens and active session are populated before loading iframe
    const dtraderSrc = React.useMemo(() => {
        const theme = localStorage.getItem('theme') || 'dark';
        const activeLoginId = client?.loginid || localStorage.getItem('active_loginid') || '';
        const params = new URLSearchParams();
        if (theme) params.set('theme', theme);
        if (activeLoginId) params.set('account', activeLoginId);
        return `/dtrader/index.html?${params.toString()}`;
    }, [client?.loginid]);

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

            const payload = {
                type: 'NEWDTRADER_BRIDGE_AUTH',
                payload: {
                    active_loginid: activeLoginId,
                    active_token: activeToken,
                    token: activeToken,
                    accounts: rawAccounts,
                    server_url: localStorage.getItem('config.server_url') || 'ws.derivws.com',
                    app_id: localStorage.getItem('config.app_id') || '121856'
                }
            };

            iframeWin.postMessage(payload, '*');
            iframeWin.postMessage({ type: 'SET_SESSION', ...payload.payload }, '*');
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

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [client?.loginid]);

    useEffect(() => {
        const handleIframeLoad = () => {
            setIsLoading(false);
            sendAuthToIframe();
            try {
                // Synchronize parent storage items into iframe if same-origin
                const iframeWin = iframeRef.current?.contentWindow;
                if (iframeWin && iframeWin.localStorage) {
                    const keys = [
                        'client.accounts',
                        'clientAccounts',
                        'accountsList',
                        'client_account_details',
                        'deriv_accounts',
                        'active_loginid',
                        'active_token',
                        'deriv_api_token',
                        'authToken',
                        'token',
                        'token1',
                        'config.server_url',
                        'config.app_id',
                        'theme'
                    ];
                    keys.forEach(k => {
                        const val = localStorage.getItem(k);
                        if (val !== null) {
                            iframeWin.localStorage.setItem(k, val);
                        }
                    });
                }
            } catch (e) {
                console.warn('[DTraderPage] Storage sync notice:', e);
            }
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
                ref={iframeRef}
                src={dtraderSrc}
                title="DTrader"
                className="dtrader-iframe-frame"
                allow="clipboard-read; clipboard-write"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
        </div>
    );
});

export default DTraderPage;
