import React, { memo } from 'react';
import classNames from 'classnames';
import {
    CheckCircle2,
    X,
    XCircle,
} from 'lucide-react';
import type { SettledContract } from '@/adapters/dtrader';

interface ContractReplayModalProps {
    contract: SettledContract | null;
    onClose: () => void;
    currency: string;
}

export const ContractReplayModal: React.FC<ContractReplayModalProps> = memo(({
    contract,
    onClose,
    currency,
}) => {
    if (!contract) return null;

    const isWon = contract.status === 'won';
    const startDate = new Date(contract.purchase_time * 1000).toLocaleString();
    const endDate = new Date(contract.sell_time * 1000).toLocaleString();

    return (
        <div className='dtrader-modal-backdrop' onClick={onClose}>
            <div
                className='dtrader-replay-modal'
                onClick={e => e.stopPropagation()}
                role='dialog'
                aria-modal='true'
            >
                {/* Modal Header */}
                <div className='dtrader-modal-header'>
                    <div className='dtrader-modal-title-row'>
                        <span
                            className={classNames('dtrader-status-icon', {
                                won: isWon,
                                lost: !isWon,
                            })}
                        >
                            {isWon ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                        </span>
                        <div>
                            <h3>
                                Contract Replay: {contract.contract_type} on {contract.underlying}
                            </h3>
                            <span className='dtrader-contract-id'>ID: #{contract.contract_id}</span>
                        </div>
                    </div>
                    <button type='button' className='dtrader-modal-close' onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className='dtrader-modal-body'>
                    {/* Hero Result Banner */}
                    <div
                        className={classNames('dtrader-result-banner', {
                            won: isWon,
                            lost: !isWon,
                        })}
                    >
                        <div className='dtrader-banner-left'>
                            <span className='dtrader-banner-label'>
                                {isWon ? 'Contract Won' : 'Contract Lost'}
                            </span>
                            <span className='dtrader-banner-val'>
                                {isWon ? `+${contract.profit.toFixed(2)}` : contract.profit.toFixed(2)}{' '}
                                {currency}
                            </span>
                        </div>
                        <div className='dtrader-banner-right'>
                            <span>Stake: {contract.buy_price.toFixed(2)} {currency}</span>
                            <span>Payout: {contract.sell_price.toFixed(2)} {currency}</span>
                        </div>
                    </div>

                    {/* Contract Details Grid */}
                    <div className='dtrader-audit-grid'>
                        <div className='dtrader-audit-card'>
                            <span className='dtrader-audit-label'>Entry Spot</span>
                            <strong className='dtrader-audit-val'>{contract.entry_spot ?? '--'}</strong>
                        </div>
                        <div className='dtrader-audit-card'>
                            <span className='dtrader-audit-label'>Exit Spot</span>
                            <strong className='dtrader-audit-val'>{contract.exit_spot ?? '--'}</strong>
                        </div>
                        {contract.barrier && (
                            <div className='dtrader-audit-card'>
                                <span className='dtrader-audit-label'>Barrier</span>
                                <strong className='dtrader-audit-val'>{contract.barrier}</strong>
                            </div>
                        )}
                        <div className='dtrader-audit-card'>
                            <span className='dtrader-audit-label'>Start Time</span>
                            <span className='dtrader-audit-sub'>{startDate}</span>
                        </div>
                        <div className='dtrader-audit-card'>
                            <span className='dtrader-audit-label'>Exit Time</span>
                            <span className='dtrader-audit-sub'>{endDate}</span>
                        </div>
                    </div>

                    {/* Longcode Description */}
                    {contract.longcode && (
                        <div className='dtrader-longcode-box'>
                            <span className='dtrader-longcode-title'>Contract Summary</span>
                            <p>{contract.longcode}</p>
                        </div>
                    )}

                    {/* Tick Audit Stream (if available) */}
                    {contract.ticks && contract.ticks.length > 0 && (
                        <div className='dtrader-ticks-stream-box'>
                            <span className='dtrader-ticks-stream-title'>
                                Tick Progression ({contract.ticks.length} ticks)
                            </span>
                            <div className='dtrader-ticks-stream-scroll'>
                                <table className='dtrader-ticks-table'>
                                    <thead>
                                        <tr>
                                            <th>Tick #</th>
                                            <th>Quote</th>
                                            <th>Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {contract.ticks.map(t => (
                                            <tr key={t.epoch}>
                                                <td>Tick {t.tick_number || 1}</td>
                                                <td className='dtrader-quote-val'>{t.quote}</td>
                                                <td>{new Date(t.epoch * 1000).toLocaleTimeString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className='dtrader-modal-footer'>
                    <button type='button' className='dtrader-close-btn' onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
});

ContractReplayModal.displayName = 'ContractReplayModal';
export default ContractReplayModal;
