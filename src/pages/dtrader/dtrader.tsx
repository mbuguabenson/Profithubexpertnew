import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import ChunkLoader from '@/components/loader/chunk-loader';
import ManualTrading from '../manual-trading/manual-trading';
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
    const [viewMode, setViewMode] = useState<'native' | 'iframe'>('native');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [resolvedToken, setResolvedToken] = useState<string>('');

    useEffect(() => {
        let isMounted = true;

        const initUrl = async () => {
            setIsLoading(true);

            // Resolve valid Deriv WS token (handles legacy API tokens AND PKCE OTP tokens)
            const token = await resolveValidDerivWSToken(loginid);
            if (!isMounted) return;

            setResolvedToken(token);

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

            const parentAppId = getAppId() || '121856';
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

    const handleLaunchOfficial = () => {
        const appId = getAppId() || '121856';
        const officialUrl = `https://trader.deriv.com/?acct1=${loginid}&token1=${resolvedToken}&app_id=${appId}`;
        window.open(officialUrl, '_blank', 'noopener,noreferrer');
    };

    if (isLoading && viewMode === 'iframe') {
        return <ChunkLoader message={localize('Initializing DTrader session...')} />;
    }

    return (
        <div className='dtrader-page-container' style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Top Toolbar Mode Switcher */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 1.2rem',
                background: 'var(--general-section-1, #151717)',
                borderBottom: '1px solid var(--border-normal, rgba(255, 255, 255, 0.1))',
                zIndex: 10,
                flexWrap: 'wrap',
                gap: '0.5rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <button
                        type='button'
                        onClick={() => setViewMode('native')}
                        style={{
                            padding: '0.4rem 1rem',
                            borderRadius: '4px',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            background: viewMode === 'native' ? 'var(--button-primary-default, #00a86b)' : 'transparent',
                            color: viewMode === 'native' ? '#ffffff' : 'var(--text-prominent, #999999)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        ⚡ Native Terminal
                    </button>

                    <button
                        type='button'
                        onClick={() => setViewMode('iframe')}
                        style={{
                            padding: '0.4rem 1rem',
                            borderRadius: '4px',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            background: viewMode === 'iframe' ? 'var(--button-primary-default, #38bdf8)' : 'transparent',
                            color: viewMode === 'iframe' ? '#ffffff' : 'var(--text-prominent, #999999)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        🖥️ Web View
                    </button>
                </div>

                <button
                    type='button'
                    onClick={handleLaunchOfficial}
                    style={{
                        padding: '0.4rem 1rem',
                        borderRadius: '4px',
                        border: '1px solid var(--button-primary-default, #38bdf8)',
                        fontWeight: 600,
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                        background: 'transparent',
                        color: '#38bdf8',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s ease'
                    }}
                >
                    Launch Deriv Trader ↗
                </button>
            </div>

            {/* Terminal Body */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {viewMode === 'native' ? (
                    <ManualTrading />
                ) : (
                    <IframeWrapper
                        src={dtraderUrl}
                        title='DTrader Terminal'
                        className='dtrader-iframe'
                    />
                )}
            </div>
        </div>
    );
});

export default DTraderPage;
