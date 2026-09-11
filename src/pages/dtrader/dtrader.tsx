import React, { Suspense, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore, useStoreReady } from '@/hooks/useStore';
import {
    createTraderCoreStoreAdapter,
    createTraderWSAdapter,
    useDTraderAdapter,
} from '@/adapters/dtrader';
import { TraderApp } from '@/external/trader';
import {
    ContractReplayModal,
    DTraderChart,
    PositionsDrawer,
    PurchaseButtons,
    TradeParamsPanel,
} from './components';
import './dtrader.scss';

class TraderAppErrorBoundary extends React.Component<
    { children: React.ReactNode; fallback: React.ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: any) {
        console.warn('[TraderApp] Error rendering native TraderApp:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}

const DTraderPage: React.FC = observer(() => {
    const storeReady = useStoreReady();
    const rootStore = useStore();
    const chartStore = rootStore?.chart_store;

    const initialSymbol = chartStore?.symbol || 'R_100';

    const {
        params,
        updateParams,
        setSymbol,
        setCategory,
        proposals,
        openPositions,
        settledContracts,
        buy,
        sell,
        clearSettledHistory,
        isPurchasing,
        purchaseError,
        currency,
        balance,
    } = useDTraderAdapter(initialSymbol);

    const [replayContract, setReplayContract] = useState<any>(null);

    const passthrough = useMemo(() => {
        if (!rootStore) return null;
        return {
            root_store: createTraderCoreStoreAdapter(rootStore),
            WS: createTraderWSAdapter(),
        };
    }, [rootStore]);

    if (!storeReady || !rootStore) {
        return (
            <div className='dtrader-loading-overlay'>
                <div className='dtrader-spinner' />
                <span className='dtrader-loading-text'>Initializing DTrader Native Terminal...</span>
            </div>
        );
    }

    const fallbackView = (
        <div className='dtrader-workspace'>
            <div className='dtrader-chart-section'>
                <DTraderChart
                    symbol={params.symbol}
                    onSymbolChange={setSymbol}
                    barrier={params.barrier}
                    openPositions={openPositions}
                    className='dtrader-chart-view'
                />
            </div>
            <div className='dtrader-sidebar'>
                <div className='dtrader-sidebar-scroll'>
                    <TradeParamsPanel
                        params={params}
                        onChange={updateParams}
                        onCategoryChange={setCategory}
                        currency={currency}
                        balance={balance}
                    />
                    <PurchaseButtons
                        params={params}
                        proposals={proposals}
                        onBuy={buy}
                        isPurchasing={isPurchasing}
                        purchaseError={purchaseError}
                        currency={currency}
                    />
                </div>
            </div>
            <div className='dtrader-drawer-section'>
                <PositionsDrawer
                    openPositions={openPositions}
                    settledContracts={settledContracts}
                    onSell={sell}
                    onSelectContractReplay={contract => setReplayContract(contract)}
                    onClearHistory={clearSettledHistory}
                    currency={currency}
                />
            </div>
            <ContractReplayModal
                contract={replayContract}
                onClose={() => setReplayContract(null)}
                currency={currency}
            />
        </div>
    );

    return (
        <div className='dtrader-page-container' dir='ltr'>
            <TraderAppErrorBoundary fallback={fallbackView}>
                <Suspense
                    fallback={
                        <div className='dtrader-loading-overlay'>
                            <div className='dtrader-spinner' />
                            <span className='dtrader-loading-text'>Loading DTrader Original Terminal...</span>
                        </div>
                    }
                >
                    {passthrough && <TraderApp passthrough={passthrough} />}
                </Suspense>
            </TraderAppErrorBoundary>
        </div>
    );
});

export default DTraderPage;
