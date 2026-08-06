import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import ChunkLoader from '@/components/loader/chunk-loader';
import { useStore } from '@/hooks/useStore';
import { V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
import { getAccountsList, resolveValidDerivWSToken } from '@/utils/token-bridge';
import { getAppId } from '@/components/shared/utils/config/config';
import { localize } from '@deriv-com/translations';
import './dtrader.scss';

const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const loginid = V2GetActiveAccountId() || client?.loginid || localStorage.getItem('active_loginid') || '';
    const [dtraderUrl, setDtraderUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        let isMounted = true;

        const initUrl = async () => {
            setIsLoading(true);

            // Resolve valid Deriv WS token (handles legacy API tokens AND PKCE OTP tokens)
            const token = await resolveValidDerivWSToken(loginid);
            if (!isMounted) return;

            let baseUrl = process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app';
            if (typeof window !== 'undefined' && (baseUrl.includes(window.location.hostname) || baseUrl.includes('dtraderprofithubtool.vercel.app'))) {
                baseUrl = 'https://deriv-dtrader.vercel.app';
            }

            const params = new URLSearchParams();
            const accountsList = getAccountsList();
            let count = 1;

            // Prioritize active account
            if (loginid && token) {
                params.set(`acct${count}`, loginid);
                params.set(`token${count}`, token);
                params.set(`cur${count}`, 'USD');
                params.set('token', token);
                count++;
            }

            // Append remaining accounts from accountsList
            Object.keys(accountsList).forEach(acc => {
                if (acc !== loginid && accountsList[acc] && !accountsList[acc].startsWith('ory_at_')) {
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

            const parentAppId = getAppId() || '114292';
            params.set('app_id', parentAppId);
            params.set('lang', 'EN');

            setDtraderUrl(`${baseUrl}/?${params.toString()}`);
            setIsLoading(false);
        };

        initUrl();

        return () => {
            isMounted = false;
        };
    }, [loginid]);

    if (isLoading || !dtraderUrl) {
        return <ChunkLoader message={localize('Initializing DTrader session...')} />;
    }

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
