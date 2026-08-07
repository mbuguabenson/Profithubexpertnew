import React, { Suspense, lazy, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import TradeParamsPanel from './trade-params-panel';
import PurchaseButtonPanel from './purchase-button-panel';
import ChunkLoader from '@/components/loader/chunk-loader';
import { Activity, History, Shield, Wallet } from 'lucide-react';
import './dtrader.scss';

const ChartWrapper = lazy(() => import('../chart/chart-wrapper'));

const DTraderWorkspace: React.FC = observer(() => {
    const { trader, client } = useStore();

    useEffect(() => {
        if (trader) {
            trader.requestProposals();
        }
    }, [trader]);

    if (!trader) return null;

    const balance = client?.balance || '0.00';
    const currency = client?.currency || 'USD';

    return (
        <div className="dtrader-workspace">
            {/* Header Toolbar */}
            <div className="dtrader-header">
                <div className="asset-info">
                    <div className="asset-badge">
                        <Activity className="icon-pulse" size={18} />
                        <span className="symbol-name">{trader.symbol_display_name}</span>
                        <span className="symbol-tag">{trader.symbol}</span>
                    </div>
                </div>

                <div className="account-balance-card">
                    <Wallet size={16} className="text-blue-400" />
                    <span className="balance-lbl">Balance:</span>
                    <span className="balance-val">{balance} {currency}</span>
                </div>
            </div>

            {/* Main Split Body */}
            <div className="dtrader-body">
                {/* Left Area: Chart & Active Positions */}
                <div className="dtrader-main-panel">
                    <div className="chart-container">
                        <Suspense fallback={<ChunkLoader message="Loading interactive chart..." />}>
                            <ChartWrapper show_digits_stats={true} />
                        </Suspense>
                    </div>

                    {/* Recent Purchased Contracts Table */}
                    {trader.active_contracts.length > 0 && (
                        <div className="active-contracts-panel">
                            <div className="panel-title">
                                <History size={16} />
                                <span>Recent Contract Purchases ({trader.active_contracts.length})</span>
                            </div>
                            <div className="contracts-table">
                                <div className="table-head">
                                    <span>Contract ID</span>
                                    <span>Description</span>
                                    <span>Purchase Price</span>
                                    <span>Status</span>
                                </div>
                                {trader.active_contracts.slice(0, 5).map((contract) => (
                                    <div key={contract.contract_id} className="table-row">
                                        <span className="contract-id">#{contract.contract_id}</span>
                                        <span className="longcode">{contract.longcode}</span>
                                        <span className="price">${Number(contract.buy_price).toFixed(2)}</span>
                                        <span className="status-badge status-badge--active">Active</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar: Trading Parameters & Buy Buttons */}
                <div className="dtrader-sidebar">
                    <div className="sidebar-card">
                        <div className="sidebar-card__header">
                            <Shield size={16} className="text-blue-400" />
                            <span>Trade Configuration</span>
                        </div>
                        <TradeParamsPanel />
                    </div>

                    <div className="sidebar-card sidebar-card--action">
                        <PurchaseButtonPanel />
                    </div>
                </div>
            </div>
        </div>
    );
});

export default DTraderWorkspace;
