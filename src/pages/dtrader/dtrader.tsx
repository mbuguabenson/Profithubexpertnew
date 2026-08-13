import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { getAppId } from '@/components/shared/utils/config/config';
import { resolveValidDerivWSToken, getAccountsList } from '@/utils/token-bridge';
import './dtrader.scss';

/**
 * DTraderPage — embeds the Vercel-hosted DTrader build.
 *
 * Host: https://deriv-dtrader.vercel.app  (Vercel, allows iframe embedding)
 * Auth: URL query params (acct1, token1) using the OTP WebSocket token
 *       resolved by resolveValidDerivWSToken().
 *
 * NOTE: This is NOT trader.deriv.com. The Vercel build accepts auth via
 * query params and does not rely on SameSite cookies, so embedding works.
 */
const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const [authToken, setAuthToken] = useState<string>('');
    const [activeLoginId, setActiveLoginId] = useState<string>('');

    useEffect(() => {
        let mounted = true;

        const loadAuthParams = async () => {
            // Prefer the active loginid from localStorage / store
            const storedLoginId =
                localStorage.getItem('active_loginid') ||
                (client as any)?.loginid ||
                '';

            const accountsList = getAccountsList();
            let loginId = storedLoginId;

            // Resolve a valid OTP / WS token (strips ory_at_ bearer tokens automatically)
            let token = storedLoginId ? await resolveValidDerivWSToken(storedLoginId) : '';

            // Fallback: pick first available account if no token yet
            if ((!loginId || !token) && Object.keys(accountsList).length > 0) {
                const primaryKey =
                    Object.keys(accountsList).find(id => !id.startsWith('VR')) ||
                    Object.keys(accountsList)[0];
                if (primaryKey) {
                    loginId = loginId || primaryKey;
                    token = token || accountsList[primaryKey] || '';
                }
            }

            // Do not pass raw Bearer (PKCE) tokens — they are not valid as DTrader URL params
            if (token && token.startsWith('ory_at_')) {
                token = '';
            }

            if (mounted) {
                setActiveLoginId(loginId);
                setAuthToken(token);
            }
        };

        loadAuthParams();
        return () => { mounted = false; };
    }, [client?.loginid]);

    const appId = getAppId() || '121856';

    // Base URL: Vercel-hosted DTrader (allows iframe embedding via URL params)
    const baseUrl = process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app';
    const embedBase = baseUrl.includes('/dtrader')
        ? baseUrl
        : `${baseUrl.replace(/\/$/, '')}/dtrader`;

    const queryParams = new URLSearchParams({
        chart_type: 'area',
        interval: '1t',
        symbol: '1HZ100V',
        trade_type: 'accumulator',
        app_id: appId,
        lang: 'EN',
        embed: 'true',
        cur1: client?.currency || 'USD',
    });

    if (activeLoginId) {
        queryParams.set('acct1', activeLoginId);
    }
    if (authToken) {
        // token1 is the standard URL param for DTrader auth on the Vercel build
        queryParams.set('token1', authToken);
    }

    const embedUrl = `${embedBase}?${queryParams.toString()}`;

    return (
        <div className='dtrader-page-container'>
            <div className='dtrader-iframe-wrapper'>
                <IframeWrapper src={embedUrl} title='DTrader Terminal' />
            </div>
        </div>
    );
});

export default DTraderPage;
