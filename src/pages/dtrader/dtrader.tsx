import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import ChunkLoader from '@/components/loader/chunk-loader';
import { useStore } from '@/hooks/useStore';
import { getAppId } from '@/components/shared/utils/config/config';
import { resolveValidDerivWSToken, getAccountsList } from '@/utils/token-bridge';
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
 * DTraderPage — embeds the Vercel-hosted DTrader build.
 * Synchronously initializes auth params before rendering iframe to prevent
 * unauthenticated initial loads and race conditions.
 */
const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const initialLoginId = getInitialLoginId() || (client as any)?.loginid || '';
    const [activeLoginId, setActiveLoginId] = useState<string>(initialLoginId);
    const [authToken, setAuthToken] = useState<string>(() => getInitialToken(initialLoginId));
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

    useEffect(() => {
        let mounted = true;

        const loadAuthParams = async () => {
            const storedLoginId =
                localStorage.getItem('active_loginid') ||
                (client as any)?.loginid ||
                activeLoginId;

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
    const baseUrl = process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app';
    const embedBase = baseUrl.includes('/dtrader')
        ? baseUrl
        : `${baseUrl.replace(/\/$/, '')}/dtrader`;

    const loginId = activeLoginId || (client as any)?.loginid || localStorage.getItem('active_loginid') || 'DOT100000';
    const currency = client?.currency || localStorage.getItem('client.currency') || 'USD';
    const effectiveAuthToken = authToken || 'a1-guest';

    const queryParams = new URLSearchParams({
        acct1: loginId,
        token1: effectiveAuthToken,
        cur1: currency,
        api_version: 'v2',
        chart_type: 'area',
        interval: '1t',
        symbol: '1HZ100V',
        trade_type: 'accumulator',
        app_id: appId,
        lang: 'EN',
    });

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
