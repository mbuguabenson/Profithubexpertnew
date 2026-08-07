import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { TrendingUp, TrendingDown, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const PurchaseButtonPanel: React.FC = observer(() => {
    const { trader } = useStore();

    if (!trader) return null;

    const {
        proposal_1,
        proposal_2,
        is_proposal_loading,
        proposal_error,
        is_purchasing,
        purchase_error,
        last_purchase_result,
        category,
    } = trader;

    const getOptionTitles = (): { opt1: string; opt2?: string } => {
        switch (category) {
            case 'rise_fall':
                return { opt1: 'Rise (Call)', opt2: 'Fall (Put)' };
            case 'high_low':
                return { opt1: 'Higher', opt2: 'Lower' };
            case 'digits_match_diff':
                return { opt1: 'Matches', opt2: 'Differs' };
            case 'digits_over_under':
                return { opt1: 'Over', opt2: 'Under' };
            case 'digits_even_odd':
                return { opt1: 'Even', opt2: 'Odd' };
            case 'touch_no_touch':
                return { opt1: 'Touch', opt2: 'No Touch' };
            case 'accumulator':
                return { opt1: 'Buy Accumulator' };
            case 'multiplier':
                return { opt1: 'Up Multiplier', opt2: 'Down Multiplier' };
            default:
                return { opt1: 'Purchase 1', opt2: 'Purchase 2' };
        }
    };

    const titles = getOptionTitles();

    return (
        <div className="purchase-button-panel">
            {proposal_error && (
                <div className="proposal-alert proposal-alert--error">
                    <AlertCircle size={16} />
                    <span>{proposal_error}</span>
                </div>
            )}

            {purchase_error && (
                <div className="proposal-alert proposal-alert--error">
                    <AlertCircle size={16} />
                    <span>{purchase_error}</span>
                </div>
            )}

            {last_purchase_result && (
                <div className="proposal-alert proposal-alert--success">
                    <CheckCircle2 size={16} />
                    <span>
                        Contract #{last_purchase_result.contract_id} purchased at ${last_purchase_result.buy_price.toFixed(2)}
                    </span>
                </div>
            )}

            <div className="purchase-buttons-grid">
                {/* Option 1 Button */}
                <div className="purchase-card purchase-card--primary">
                    <div className="purchase-card__header">
                        <TrendingUp size={18} className="icon-up" />
                        <span className="title">{titles.opt1}</span>
                    </div>

                    <div className="purchase-card__body">
                        {is_proposal_loading ? (
                            <div className="loading-state">
                                <Loader2 className="animate-spin" size={18} />
                                <span>Fetching quote...</span>
                            </div>
                        ) : proposal_1?.error ? (
                            <div className="error-copy">{proposal_1.error}</div>
                        ) : (
                            <div className="pricing-info">
                                <div className="price-row">
                                    <span className="lbl">Stake / Ask</span>
                                    <span className="val">${proposal_1?.ask_price?.toFixed(2) || trader.amount.toFixed(2)}</span>
                                </div>
                                <div className="price-row">
                                    <span className="lbl">Payout</span>
                                    <span className="val val--highlight">${proposal_1?.payout?.toFixed(2) || '-'}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        className="buy-btn buy-btn--up"
                        disabled={is_purchasing || is_proposal_loading || !proposal_1?.proposal_id}
                        onClick={() => {
                            if (proposal_1?.proposal_id && proposal_1?.ask_price) {
                                trader.buyContract(proposal_1.proposal_id, proposal_1.ask_price);
                            }
                        }}
                    >
                        {is_purchasing ? <Loader2 className="animate-spin" size={18} /> : `Purchase ${titles.opt1}`}
                    </button>
                </div>

                {/* Option 2 Button (If present for trade type) */}
                {titles.opt2 && (
                    <div className="purchase-card purchase-card--secondary">
                        <div className="purchase-card__header">
                            <TrendingDown size={18} className="icon-down" />
                            <span className="title">{titles.opt2}</span>
                        </div>

                        <div className="purchase-card__body">
                            {is_proposal_loading ? (
                                <div className="loading-state">
                                    <Loader2 className="animate-spin" size={18} />
                                    <span>Fetching quote...</span>
                                </div>
                            ) : proposal_2?.error ? (
                                <div className="error-copy">{proposal_2.error}</div>
                            ) : (
                                <div className="pricing-info">
                                    <div className="price-row">
                                        <span className="lbl">Stake / Ask</span>
                                        <span className="val">${proposal_2?.ask_price?.toFixed(2) || trader.amount.toFixed(2)}</span>
                                    </div>
                                    <div className="price-row">
                                        <span className="lbl">Payout</span>
                                        <span className="val val--highlight">${proposal_2?.payout?.toFixed(2) || '-'}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            className="buy-btn buy-btn--down"
                            disabled={is_purchasing || is_proposal_loading || !proposal_2?.proposal_id}
                            onClick={() => {
                                if (proposal_2?.proposal_id && proposal_2?.ask_price) {
                                    trader.buyContract(proposal_2.proposal_id, proposal_2.ask_price);
                                }
                            }}
                        >
                            {is_purchasing ? <Loader2 className="animate-spin" size={18} /> : `Purchase ${titles.opt2}`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

export default PurchaseButtonPanel;
