import React from 'react';
import { observer } from 'mobx-react-lite';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { V2GetActiveToken, V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
import { getAccountsList } from '@/utils/token-bridge';
import './dtrader.scss';

const LEGACY_APP_ID = '134249';

const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const loginid = V2GetActiveAccountId() || client?.loginid || localStorage.getItem('active_loginid') || '';
    
    // Prefer OAuth token bypass to prevent Demo-to-Real intercepts from breaking OTP authentication
    let token = OAuthTokenExchangeService.getAuthInfo()?.access_token;
    if (!token) {
        token = V2GetActiveToken() || (client as any)?.token || localStorage.getItem('token') || '';
    }

    let baseUrl = process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app';
    if (typeof window !== 'undefined' && (baseUrl.includes(window.location.hostname) || baseUrl.includes('dtraderprofithubtool.vercel.app'))) {
        baseUrl = 'https://deriv-dtrader.vercel.app';
    }

    const params = new URLSearchParams();
    
    // Smart integration: Pass all tokens and accounts to DTrader to fix session expiry
    const accountsList = getAccountsList();
    let count = 1;

    // Prioritize active account
    if (loginid && accountsList[loginid]) {
        params.set(`acct${count}`, loginid);
        params.set(`token${count}`, accountsList[loginid]);
        params.set(`cur${count}`, 'USD');
        // Also add legacy single params just in case
        params.set('token', accountsList[loginid]);
        count++;
    } else if (loginid && token) {
        params.set(`acct${count}`, loginid);
        params.set(`token${count}`, token);
        params.set(`cur${count}`, 'USD');
        params.set('token', token);
        count++;
    }

    // Append remaining accounts
    Object.keys(accountsList).forEach(acc => {
        if (acc !== loginid) {
            params.set(`acct${count}`, acc);
            params.set(`token${count}`, accountsList[acc]);
            params.set(`cur${count}`, 'USD');
            count++;
        }
    });
    params.set('api_version', 'v2');
    params.set('chart_type', 'area');
    params.set('interval', '1t');
    params.set('symbol', '1HZ100V');
    params.set('trade_type', 'accumulator');
    params.set('app_id', LEGACY_APP_ID);
    params.set('lang', 'EN');

    const dtraderUrl = `${baseUrl}/?${params.toString()}`;

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
