import React, { useEffect, useState, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import ChunkLoader from '@/components/loader/chunk-loader';
import { useStore } from '@/hooks/useStore';
import { getAppId } from '@/components/shared/utils/config/config';
import { resolveValidDerivWSToken, getAccountsList, getActiveLoginId } from '@/utils/token-bridge';
import './dtrader.scss';

const getInitialLoginId = (): string => {
    try {
        const stored = localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
        if (stored) return stored;
        const list = getAccountsList();
        const keys = Object.keys(list);
        return keys.length > 0 ? keys[0] : '';
    } catch {
        return '';
    }
};

const getInitialToken = (loginid: string): string => {
    try {
        const list = getAccountsList();
        if (loginid && list[loginid] && !list[loginid].startsWith('ory_at_')) {
            return list[loginid];
        }
        for (const k in list) {
            if (list[k] && !list[k].startsWith('ory_at_')) return list[k];
        }
        const direct =
            localStorage.getItem('token') ||
            localStorage.getItem('active_token') ||
            localStorage.getItem('authToken') ||
            localStorage.getItem('token1') ||
            localStorage.getItem('deriv_api_token');
        if (direct && !direct.startsWith('ory_at_')) return direct;
    } catch {}
    return '';
};

/**
 * DTraderPage — embeds the DTrader build hosted at https://deriv-dtrader.vercel.app/
 * Passes active login tokens directly and renders the trading terminal seamlessly.
 */
const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const initialLoginId = getInitialLoginId() || (client as any)?.loginid || '';
    const [activeLoginId, setActiveLoginId] = useState<string>(initialLoginId);
    const [authToken, setAuthToken] = useState<string>(() => getInitialToken(initialLoginId));
    const [isAuthReady, setIsAuthReady] = useState<boolean>(true);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    useEffect(() => {
        let mounted = true;

        const loadAuthParams = async () => {
            const storedLoginId =
                localStorage.getItem('active_loginid') ||
                (client as any)?.loginid ||
                activeLoginId ||
                getActiveLoginId();

            const accountsList = getAccountsList();
            let loginId = storedLoginId;
            let token = storedLoginId ? await resolveValidDerivWSToken(storedLoginId) : '';

            if ((!loginId || !token) && Object.keys(accountsList).length > 0) {
                const primaryKey =
                    Object.keys(accountsList).find(id => !id.startsWith('VR')) ||
                    Object.keys(accountsList)[0];
                if (primaryKey) {
                    loginId = loginId || primaryKey;
                    token = token || accountsList[primaryKey] || '';
                }
            }

            if (token && token.startsWith('ory_at_')) {
                token = '';
            }

            if (mounted) {
                if (loginId) setActiveLoginId(loginId);
                if (token) setAuthToken(token);
                setIsAuthReady(true);
            }
        };

        loadAuthParams();
        return () => { mounted = false; };
    }, [client?.loginid]);

    const appId = getAppId() || '121856';
    const rawBaseUrl = process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app';
    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    const embedBase = baseUrl;

    const loginId = activeLoginId || (client as any)?.loginid || localStorage.getItem('active_loginid') || '';
    const currency = client?.currency || localStorage.getItem('client.currency') || 'USD';

    const queryParams = new URLSearchParams({
        api_version: 'v2',
        chart_type: 'area',
        interval: '1t',
        symbol: '1HZ100V',
        trade_type: 'accumulator',
        app_id: appId,
        lang: 'EN',
        theme: 'dark',
        hide_header_login: 'true',
        is_mobile_app: 'true',
    });

    if (loginId) {
        queryParams.set('acct1', loginId);
        queryParams.set('cur1', currency);
    }

    if (authToken && authToken !== 'a1-guest' && authToken !== 'dummy_token') {
        queryParams.set('token1', authToken);
    }

    // Populate all accounts from accountsList so iframe has full multi-account token map
    try {
        const accountsList = getAccountsList();
        let index = 1;
        for (const accId in accountsList) {
            const accToken = accountsList[accId];
            if (accToken && !accToken.startsWith('ory_at_')) {
                if (accId !== loginId) {
                    index++;
                    queryParams.set(`acct${index}`, accId);
                    queryParams.set(`token${index}`, accToken);
                    queryParams.set(`cur${index}`, currency);
                }
            }
        }
    } catch {}

    const embedUrl = `${embedBase}?${queryParams.toString()}`;

    // Broadcast active token to child iframe via postMessage on load
    useEffect(() => {
        const handleIframeAuthSync = () => {
            if (authToken) {
                const accountsList = getAccountsList();
                const payload = {
                    type: 'DERIV_AUTH_PAYLOAD',
                    active_loginid: loginId,
                    token: authToken,
                    accounts: accountsList,
                };
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    try {
                        iframe.contentWindow?.postMessage(payload, '*');
                    } catch {}
                });
            }
        };

        window.addEventListener('message', (e) => {
            if (e.data?.type === 'REQUEST_DERIV_AUTH') {
                handleIframeAuthSync();
            }
        });

        const timer = setTimeout(handleIframeAuthSync, 2000);
        return () => clearTimeout(timer);
    }, [authToken, loginId]);

    if (!isAuthReady) {
        return <ChunkLoader message="Loading DTrader Terminal..." />;
    }

    return (
        <div className='dtrader-page-container'>
            <div className='dtrader-iframe-wrapper'>
                <IframeWrapper src={embedUrl} title='DTrader Terminal' />
            </div>
        </div>
    );
});

export default DTraderPage;
