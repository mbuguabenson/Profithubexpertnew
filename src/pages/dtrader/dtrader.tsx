import React, { Suspense } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore, useStoreReady } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
import { TraderApp } from '@/external/trader';
import './dtrader.scss';

const DTraderPage: React.FC = observer(() => {
    const storeReady = useStoreReady();
    const root_store = useStore();

    if (!storeReady || !root_store) {
        return (
            <div className='dtrader-loading-overlay'>
                <div className='dtrader-spinner' />
                <span className='dtrader-loading-text'>Loading DTrader Terminal &amp; Charts...</span>
            </div>
        );
    }

    return (
        <div className='dtrader-page-container'>
            <Suspense
                fallback={
                    <div className='dtrader-loading-overlay'>
                        <div className='dtrader-spinner' />
                        <span className='dtrader-loading-text'>Loading DTrader Terminal & Charts...</span>
                    </div>
                }
            >
                <TraderApp
                    passthrough={{
                        root_store: root_store as any,
                        WS: api_base as any,
                    }}
                />
            </Suspense>
        </div>
    );
});

export default DTraderPage;
