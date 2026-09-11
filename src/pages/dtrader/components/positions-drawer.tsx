import React, { memo, useState } from 'react';
import classNames from 'classnames';
import {
    Activity,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Eye,
    History,
    Trash2,
    XCircle,
} from 'lucide-react';
import type { OpenPosition, SettledContract } from '@/adapters/dtrader';

interface PositionsDrawerProps {
    openPositions: OpenPosition[];
    settledContracts: SettledContract[];
    onSell: (contractId: number) => Promise<any>;
    onSelectContractReplay: (contract: SettledContract) => void;
    onClearHistory: () => void;
    currency: string;
    className?: string;
}

export const PositionsDrawer: React.FC<PositionsDrawerProps> = memo(({
    openPositions,
    settledContracts,
    onSell,
    onSelectContractReplay,
    onClearHistory,
    currency,
    className,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [activeTab, setActiveTab] = useState<'open' | 'settled'>('open');
    const [sellingId, setSellingId] = useState<number | null>(null);

    // Auto-open drawer when a contract is active
    const prevPositionsCountRef = React.useRef(openPositions.length);
    React.useEffect(() => {
        if (openPositions.length > prevPositionsCountRef.current) {
            setIsCollapsed(false);
            setActiveTab('open');
        }
        prevPositionsCountRef.current = openPositions.length;
    }, [openPositions.length]);

    const totalOpenProfit = openPositions.reduce((acc, pos) => acc + (pos.profit || 0), 0);

    const handleSell = async (contractId: number) => {
        setSellingId(contractId);
        try {
            await onSell(contractId);
        } finally {
            setSellingId(null);
        }
    };

    return (
        <div className={classNames('dtrader-positions-drawer', { collapsed: isCollapsed }, className)}>
            {/* Drawer Header / Bar */}
            <div className='dtrader-drawer-header' onClick={() => setIsCollapsed(prev => !prev)}>
                <div className='dtrader-drawer-tabs'>
                    <button
                        type='button'
                        className={classNames('dtrader-drawer-tab', { active: activeTab === 'open' })}
                        onClick={e => {
                            e.stopPropagation();
                            setActiveTab('open');
                            if (isCollapsed) setIsCollapsed(false);
                        }}
                    >
                        <Activity size={16} />
                        <span>Open Positions</span>
                        <span className='dtrader-badge'>{openPositions.length}</span>
                    </button>

                    <button
                        type='button'
                        className={classNames('dtrader-drawer-tab', { active: activeTab === 'settled' })}
                        onClick={e => {
                            e.stopPropagation();
                            setActiveTab('settled');
                            if (isCollapsed) setIsCollapsed(false);
                        }}
                    >
                        <History size={16} />
                        <span>Settled History</span>
                        <span className='dtrader-badge'>{settledContracts.length}</span>
                    </button>
                </div>

                <div className='dtrader-drawer-summary'>
                    {openPositions.length > 0 && (
                        <div
                            className={classNames('dtrader-total-pnl', {
                                positive: totalOpenProfit >= 0,
                                negative: totalOpenProfit < 0,
                            })}
                        >
                            <span>Total P/L:</span>
                            <strong>
                                {totalOpenProfit >= 0 ? `+${totalOpenProfit.toFixed(2)}` : totalOpenProfit.toFixed(2)}{' '}
                                {currency}
                            </strong>
                        </div>
                    )}
                    <button
                        type='button'
                        className='dtrader-collapse-btn'
                        title={isCollapsed ? 'Expand Drawer' : 'Collapse Drawer'}
                    >
                        {isCollapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>
            </div>

            {/* Drawer Content */}
            {!isCollapsed && (
                <div className='dtrader-drawer-content'>
                    {activeTab === 'open' ? (
                        openPositions.length === 0 ? (
                            <div className='dtrader-empty-positions'>
                                <Activity size={32} className='dtrader-empty-icon' />
                                <span>No active open trades</span>
                                <small>Placed contracts will stream live updates and early cash-out here.</small>
                            </div>
                        ) : (
                            <div className='dtrader-positions-grid'>
                                {openPositions.map(pos => {
                                    const isPositive = pos.profit >= 0;
                                    const isSelling = sellingId === pos.contract_id;
                                    return (
                                        <div
                                            key={pos.contract_id}
                                            className={classNames('dtrader-position-card', {
                                                profit: isPositive,
                                                loss: !isPositive,
                                            })}
                                        >
                                            <div className='dtrader-pos-top'>
                                                <div className='dtrader-pos-badge-row'>
                                                    <span className='dtrader-contract-pill'>
                                                        {pos.contract_type}
                                                    </span>
                                                    <span className='dtrader-symbol-pill'>{pos.underlying}</span>
                                                    {pos.tick_count && (
                                                        <span className='dtrader-tick-pill'>
                                                            Tick {pos.current_tick || 1}/{pos.tick_count}
                                                        </span>
                                                    )}
                                                </div>

                                                <div
                                                    className={classNames('dtrader-pos-profit', {
                                                        positive: isPositive,
                                                        negative: !isPositive,
                                                    })}
                                                >
                                                    <strong>
                                                        {isPositive ? `+${pos.profit.toFixed(2)}` : pos.profit.toFixed(2)}{' '}
                                                        {currency}
                                                    </strong>
                                                    <small>
                                                        ({isPositive ? `+${pos.profit_percentage.toFixed(1)}` : pos.profit_percentage.toFixed(1)}%)
                                                    </small>
                                                </div>
                                            </div>

                                            <div className='dtrader-pos-details'>
                                                <div className='dtrader-pos-col'>
                                                    <span>Stake</span>
                                                    <strong>{pos.buy_price.toFixed(2)} {currency}</strong>
                                                </div>
                                                <div className='dtrader-pos-col'>
                                                    <span>Entry Spot</span>
                                                    <strong>{pos.entry_spot ?? '--'}</strong>
                                                </div>
                                                <div className='dtrader-pos-col'>
                                                    <span>Current Spot</span>
                                                    <strong>{pos.current_spot ?? '--'}</strong>
                                                </div>
                                                <div className='dtrader-pos-col'>
                                                    <span>Potential Payout</span>
                                                    <strong>{pos.payout.toFixed(2)} {currency}</strong>
                                                </div>
                                            </div>

                                            {pos.is_valid_to_sell && (
                                                <button
                                                    type='button'
                                                    className='dtrader-sell-btn'
                                                    disabled={isSelling}
                                                    onClick={() => handleSell(pos.contract_id)}
                                                >
                                                    {isSelling ? (
                                                        'Closing...'
                                                    ) : (
                                                        `Close Contract (${pos.bid_price.toFixed(2)} ${currency})`
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        // Settled History Tab
                        settledContracts.length === 0 ? (
                            <div className='dtrader-empty-positions'>
                                <History size={32} className='dtrader-empty-icon' />
                                <span>No settled contracts yet</span>
                                <small>Finished contracts and replay audits will appear here.</small>
                            </div>
                        ) : (
                            <div className='dtrader-settled-wrap'>
                                <div className='dtrader-settled-actions'>
                                    <span>Recent Trades ({settledContracts.length})</span>
                                    <button
                                        type='button'
                                        className='dtrader-clear-btn'
                                        onClick={onClearHistory}
                                    >
                                        <Trash2 size={14} />
                                        <span>Clear History</span>
                                    </button>
                                </div>

                                <div className='dtrader-settled-table-wrap'>
                                    <table className='dtrader-settled-table'>
                                        <thead>
                                            <tr>
                                                <th>Type</th>
                                                <th>Symbol</th>
                                                <th>Stake</th>
                                                <th>Return</th>
                                                <th>Profit / Loss</th>
                                                <th>Status</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {settledContracts.map(contract => {
                                                const isWon = contract.status === 'won';
                                                return (
                                                    <tr key={contract.contract_id}>
                                                        <td>
                                                            <span className='dtrader-type-tag'>
                                                                {contract.contract_type}
                                                            </span>
                                                        </td>
                                                        <td>{contract.underlying}</td>
                                                        <td>{contract.buy_price.toFixed(2)} {currency}</td>
                                                        <td>{contract.sell_price.toFixed(2)} {currency}</td>
                                                        <td className={isWon ? 'text-profit' : 'text-loss'}>
                                                            {isWon
                                                                ? `+${contract.profit.toFixed(2)}`
                                                                : contract.profit.toFixed(2)}{' '}
                                                            {currency}
                                                        </td>
                                                        <td>
                                                            <span
                                                                className={classNames('dtrader-status-tag', {
                                                                    won: isWon,
                                                                    lost: !isWon,
                                                                })}
                                                            >
                                                                {isWon ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                                                {isWon ? 'Won' : 'Lost'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <button
                                                                type='button'
                                                                className='dtrader-replay-btn'
                                                                onClick={() => onSelectContractReplay(contract)}
                                                                title='Inspect Contract Audit & Ticks'
                                                            >
                                                                <Eye size={14} />
                                                                <span>Audit</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
});

PositionsDrawer.displayName = 'PositionsDrawer';
export default PositionsDrawer;
