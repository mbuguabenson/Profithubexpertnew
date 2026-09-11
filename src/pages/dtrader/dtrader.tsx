import React, { Suspense } from 'react';
import { observer } from 'mobx-react-lite';
import { useStoreReady } from '@/hooks/useStore';
import { DTraderIframeContainer } from '@/components/iframe-bridge';
import './dtrader.scss';

const DTraderPage: React.FC = observer(() => {
    const storeReady = useStoreReady();

    if (!storeReady) {
        return (
            <div className='dtrader-loading-overlay'>
                <div className='dtrader-spinner' />
                <span className='dtrader-loading-text'>Loading DTrader Terminal...</span>
            </div>
        );
    }

    return (
        <div className='dtrader-page-container' dir='ltr'>
            <Suspense
                fallback={
                    <div className='dtrader-loading-overlay'>
                        <div className='dtrader-spinner' />
                        <span className='dtrader-loading-text'>Loading DTrader Terminal...</span>
                    </div>
                }
            >
                <DTraderIframeContainer />
            </Suspense>
        </div>
    );
});

export default DTraderPage;
