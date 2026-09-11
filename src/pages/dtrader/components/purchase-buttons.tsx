import React, { memo } from 'react';
import classNames from 'classnames';
import {
    AlertCircle,
    ArrowDownRight,
    ArrowUpRight,
    CheckCircle2,
    Equal,
    Loader2,
    X,
    Zap,
} from 'lucide-react';
import type { ContractType, ProposalData, TradeParams } from '@/adapters/dtrader';

interface PurchaseButtonsProps {
    params: TradeParams;
    proposals: Record<string, ProposalData>;
    onBuy: (type: ContractType) => void;
    isPurchasing: boolean;
    purchaseError: string | null;
    currency: string;
    className?: string;
}

export const PurchaseButtons: React.FC<PurchaseButtonsProps> = memo(({
    params,
    proposals,
    onBuy,
    isPurchasing,
    purchaseError,
    currency,
    className,
}) => {
    const isAccumulator = params.category === 'accumulator';

    const getSidesConfig = (): {
        side1: { type: ContractType; label: string; color: string; icon: any };
        side2?: { type: ContractType; label: string; color: string; icon: any };
    } => {
        switch (params.category) {
            case 'rise_fall':
                return {
                    side1: { type: 'CALL', label: 'Rise', color: 'green', icon: ArrowUpRight },
                    side2: { type: 'PUT', label: 'Fall', color: 'red', icon: ArrowDownRight },
                };
            case 'high_low':
                return {
                    side1: { type: 'HIGHER', label: 'Higher', color: 'green', icon: ArrowUpRight },
                    side2: { type: 'LOWER', label: 'Lower', color: 'red', icon: ArrowDownRight },
                };
            case 'digits_matches_differs':
                return {
                    side1: { type: 'DIGITMATCH', label: `Matches ${params.selectedDigit ?? ''}`, color: 'blue', icon: Equal },
                    side2: { type: 'DIGITDIFF', label: `Differs ${params.selectedDigit ?? ''}`, color: 'purple', icon: X },
                };
            case 'digits_even_odd':
                return {
                    side1: { type: 'DIGITEVEN', label: 'Even', color: 'blue', icon: CheckCircle2 },
                    side2: { type: 'DIGITODD', label: 'Odd', color: 'amber', icon: CheckCircle2 },
                };
            case 'digits_over_under':
                return {
                    side1: { type: 'DIGITOVER', label: `Over ${params.selectedDigit ?? ''}`, color: 'green', icon: ArrowUpRight },
                    side2: { type: 'DIGITUNDER', label: `Under ${params.selectedDigit ?? ''}`, color: 'red', icon: ArrowDownRight },
                };
            case 'touch_notouch':
                return {
                    side1: { type: 'ONETOUCH', label: 'Touch', color: 'green', icon: ArrowUpRight },
                    side2: { type: 'NOTOUCH', label: 'No Touch', color: 'red', icon: ArrowDownRight },
                };
            case 'multiplier':
                return {
                    side1: { type: 'MULTUP', label: `Up x${params.multiplier || 20}`, color: 'green', icon: ArrowUpRight },
                    side2: { type: 'MULTDOWN', label: `Down x${params.multiplier || 20}`, color: 'red', icon: ArrowDownRight },
                };
            case 'accumulator':
                return {
                    side1: { type: 'ACCU', label: 'Buy Accumulator', color: 'accent', icon: Zap },
                };
            default:
                return {
                    side1: { type: 'CALL', label: 'Rise', color: 'green', icon: ArrowUpRight },
                    side2: { type: 'PUT', label: 'Fall', color: 'red', icon: ArrowDownRight },
                };
        }
    };

    const config = getSidesConfig();

    const renderButton = (side: { type: ContractType; label: string; color: string; icon: any }) => {
        const proposal = proposals[side.type];
        const Icon = side.icon;
        const hasProposal = Boolean(proposal && proposal.id && !proposal.error);
        const isLoadingProposal = !proposal || (!proposal.id && !proposal.error);
        const payout = proposal?.payout || 0;
        const profit = proposal?.profit || 0;
        const returns = proposal?.returns || 0;

        return (
            <button
                key={side.type}
                type='button'
                className={classNames('dtrader-purchase-btn', `btn-${side.color}`, {
                    loading: isPurchasing,
                    disabled: !hasProposal || isPurchasing,
                })}
                disabled={!hasProposal || isPurchasing}
                onClick={() => onBuy(side.type)}
            >
                <div className='dtrader-btn-left'>
                    <div className='dtrader-btn-icon-wrap'>
                        {isPurchasing ? (
                            <Loader2 className='dtrader-spin' size={20} />
                        ) : (
                            <Icon size={22} />
                        )}
                    </div>
                    <div className='dtrader-btn-text'>
                        <span className='dtrader-btn-title'>{side.label}</span>
                        {proposal?.error ? (
                            <span className='dtrader-btn-error'>{proposal.error}</span>
                        ) : isLoadingProposal ? (
                            <span className='dtrader-btn-sub'>Calculating proposal...</span>
                        ) : isAccumulator ? (
                            <span className='dtrader-btn-sub'>
                                {(params.growthRate ?? 0.03) * 100}% growth / tick
                            </span>
                        ) : (
                            <span className='dtrader-btn-sub'>
                                Payout: {payout.toFixed(2)} {currency}
                            </span>
                        )}
                    </div>
                </div>

                {!proposal?.error && hasProposal && !isAccumulator && (
                    <div className='dtrader-btn-right'>
                        <span className='dtrader-btn-return'>
                            {returns >= 0 ? `+${returns.toFixed(1)}%` : `${returns.toFixed(1)}%`}
                        </span>
                        <span className='dtrader-btn-profit'>
                            {profit >= 0 ? `+${profit.toFixed(2)}` : profit.toFixed(2)} {currency}
                        </span>
                    </div>
                )}
            </button>
        );
    };

    return (
        <div className={classNames('dtrader-purchase-container', className)}>
            {purchaseError && (
                <div className='dtrader-purchase-alert'>
                    <AlertCircle size={16} />
                    <span>{purchaseError}</span>
                </div>
            )}

            <div className={classNames('dtrader-purchase-buttons-row', { single: !config.side2 })}>
                {renderButton(config.side1)}
                {config.side2 && renderButton(config.side2)}
            </div>
        </div>
    );
});

PurchaseButtons.displayName = 'PurchaseButtons';
export default PurchaseButtons;
