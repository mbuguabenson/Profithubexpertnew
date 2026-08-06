import React from 'react';
import { observer } from 'mobx-react-lite';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { V2GetActiveToken, V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
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
    if (loginid) {
        params.set('acct1', loginid);
    }
    if (token) {
        params.set('token1', token);
        params.set('token', token); // Also add legacy token param just in case
    }
    params.set('cur1', 'USD');
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
