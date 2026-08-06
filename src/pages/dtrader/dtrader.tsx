import React, { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
import { getAccountsList, resolveValidDerivWSToken } from '@/utils/token-bridge';
import { getAppId } from '@/components/shared/utils/config/config';
import './dtrader.scss';

const buildDTraderUrl = (loginid: string, resolvedToken?: string): string => {
    let baseUrl = process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app/dtrader';
    if (!baseUrl.endsWith('/dtrader')) {
        baseUrl = `${baseUrl.replace(/\/$/, '')}/dtrader`;
    }

    const params = new URLSearchParams();

    // 1. Read accounts from localStorage accountsList & current URL search params
    const accountsList = getAccountsList();
    const windowSearch = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

    const activeId = loginid || windowSearch.get('acct1') || localStorage.getItem('active_loginid') || Object.keys(accountsList)[0] || '';
    
    let activeToken = resolvedToken;
    if (!activeToken || activeToken.startsWith('ory_at_')) {
        activeToken = (activeId && accountsList[activeId]) ? accountsList[activeId] : windowSearch.get('token1') || localStorage.getItem('token') || '';
    }
    if (!activeToken || activeToken.startsWith('ory_at_')) {
        const firstValidKey = Object.keys(accountsList).find(k => accountsList[k] && !accountsList[k].startsWith('ory_at_'));
        if (firstValidKey) {
            activeToken = accountsList[firstValidKey];
        }
    }

    let count = 1;

    // 2. Add active account first (acct1, token1, cur1)
    if (activeId && activeToken && !activeToken.startsWith('ory_at_')) {
        params.set(`acct${count}`, activeId);
        params.set(`token${count}`, activeToken);
        params.set(`cur${count}`, 'USD');
        params.set('token', activeToken);
        params.set('loginid', activeId);
        params.set('account_id', activeId);
        count++;
    }

    // 3. Add any query params from window.location.search if present (acct1, token1, acct2, token2, etc.)
    for (let i = 1; i <= 10; i++) {
        const urlAcct = windowSearch.get(`acct${i}`);
        const urlToken = windowSearch.get(`token${i}`);
        const urlCur = windowSearch.get(`cur${i}`) || 'USD';
        if (urlAcct && urlToken && !urlToken.startsWith('ory_at_') && urlAcct !== activeId) {
            params.set(`acct${count}`, urlAcct);
            params.set(`token${count}`, urlToken);
            params.set(`cur${count}`, urlCur);
            count++;
        }
    }

    // 4. Add all remaining accounts from accountsList map
    Object.keys(accountsList).forEach(acc => {
        if (acc !== activeId && accountsList[acc] && !accountsList[acc].startsWith('ory_at_')) {
            let alreadyAdded = false;
            for (let i = 1; i < count; i++) {
                if (params.get(`acct${i}`) === acc) {
                    alreadyAdded = true;
                    break;
                }
            }
            if (!alreadyAdded) {
                params.set(`acct${count}`, acc);
                params.set(`token${count}`, accountsList[acc]);
                params.set(`cur${count}`, 'USD');
                count++;
            }
        }
    });

    params.set('api_version', 'v2');
    params.set('chart_type', 'area');
    params.set('interval', '1t');
    params.set('symbol', '1HZ100V');
    params.set('trade_type', 'accumulator');

    const appId = getAppId() || '134205';
    params.set('app_id', appId);
    params.set('lang', 'EN');
    params.set('theme', 'dark');
    params.set('bt_secret', 'binarytool');

    return `${baseUrl}?${params.toString()}`;
};

const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const loginid = V2GetActiveAccountId() || client?.loginid || localStorage.getItem('active_loginid') || '';

    // Synchronous initial URL so iframe mounts instantly on frame 1 with full login params
    const initialUrl = useMemo(() => buildDTraderUrl(loginid), [loginid]);
    const [dtraderUrl, setDtraderUrl] = useState<string>(initialUrl);

    useEffect(() => {
        let isMounted = true;

        const updateUrlWithResolvedToken = async () => {
            // Asynchronously resolve PKCE OTP or legacy session token if needed
            const token = await resolveValidDerivWSToken(loginid);
            if (!isMounted || !token) return;

            const updatedUrl = buildDTraderUrl(loginid, token);
            setDtraderUrl(updatedUrl);
        };

        updateUrlWithResolvedToken();

        return () => {
            isMounted = false;
        };
    }, [loginid]);

    return (
        <div className='dtrader-page-container' style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <IframeWrapper
                src={dtraderUrl}
                title='DTrader Terminal'
                className='dtrader-iframe'
            />
        </div>
    );
});

export default DTraderPage;
