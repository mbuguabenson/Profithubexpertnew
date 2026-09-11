import React, { memo, useCallback, useState } from 'react';
import classNames from 'classnames';
import {
    Activity,
    ChevronDown,
    DollarSign,
    Hash,
    Layers,
    Minus,
    Sliders,
    TrendingUp,
    X,
    Zap,
} from 'lucide-react';
import type { DurationUnit, TradeCategory, TradeParams } from '@/adapters/dtrader';

interface TradeParamsProps {
    params: TradeParams;
    onChange: (patch: Partial<TradeParams>) => void;
    onCategoryChange: (cat: TradeCategory) => void;
    currency: string;
    balance: number;
    className?: string;
}

interface CategoryGroup {
    title: string;
    items: { id: TradeCategory; label: string; icon: any; desc: string }[];
}

const CATEGORY_GROUPS: CategoryGroup[] = [
    {
        title: 'Ups & Downs',
        items: [
            { id: 'rise_fall', label: 'Rise / Fall', icon: TrendingUp, desc: 'Win payout if market closes strictly higher or lower than entry.' },
            { id: 'high_low', label: 'High / Low', icon: Sliders, desc: 'Win payout if market closes higher or lower than the barrier.' },
        ],
    },
    {
        title: 'Digits',
        items: [
            { id: 'digits_matches_differs', label: 'Matches / Differs', icon: Hash, desc: 'Predict if the last digit will match or differ from your target.' },
            { id: 'digits_even_odd', label: 'Even / Odd', icon: Hash, desc: 'Predict if the last digit of the contract will be even or odd.' },
            { id: 'digits_over_under', label: 'Over / Under', icon: Hash, desc: 'Predict if the last digit will be strictly over or under your target.' },
        ],
    },
    {
        title: 'Barriers & In/Out',
        items: [
            { id: 'touch_notouch', label: 'Touch / No Touch', icon: Activity, desc: 'Win payout if the market touches or never touches the target barrier.' },
        ],
    },
    {
        title: 'Compound & Growth',
        items: [
            { id: 'accumulator', label: 'Accumulators', icon: Zap, desc: 'Compound payout every tick at 1%–5% growth while within the range.' },
            { id: 'multiplier', label: 'Multipliers', icon: Layers, desc: 'Multiply potential returns with crash protection and limit orders.' },
        ],
    },
];

const ACCUMULATOR_RATES = [0.01, 0.02, 0.03, 0.04, 0.05];
const MULTIPLIERS = [10, 20, 40, 60, 100];
const QUICK_STAKES = [5, 10, 25, 50, 100];

export const TradeParamsPanel: React.FC<TradeParamsProps> = memo(({
    params,
    onChange,
    onCategoryChange,
    currency,
    balance,
    className,
}) => {
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);

    const isAccumulator = params.category === 'accumulator';
    const isMultiplier = params.category === 'multiplier';
    const isDigitMatchDiff = params.category === 'digits_matches_differs';
    const isDigitOverUnder = params.category === 'digits_over_under';
    const isDigitEvenOdd = params.category === 'digits_even_odd';
    const isHighLow = params.category === 'high_low';
    const isTouchNoTouch = params.category === 'touch_notouch';

    // Current category metadata
    const allCategories = CATEGORY_GROUPS.flatMap(g => g.items);
    const activeCategory = allCategories.find(c => c.id === params.category) || allCategories[0];
    const ActiveIcon = activeCategory.icon;

    const handleAmountChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseFloat(e.target.value);
            onChange({ amount: isNaN(val) ? 0 : Math.max(0.35, val) });
        },
        [onChange]
    );

    const stepAmount = useCallback(
        (delta: number) => {
            onChange({ amount: Math.max(0.35, Number((params.amount + delta).toFixed(2))) });
        },
        [onChange, params.amount]
    );

    const handleDurationChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = parseInt(e.target.value, 10);
            onChange({ duration: isNaN(val) ? 1 : Math.max(1, val) });
        },
        [onChange]
    );

    const handleDurationUnitChange = useCallback(
        (unit: DurationUnit) => {
            let defaultDur = params.duration;
            if (unit === 't' && defaultDur > 10) defaultDur = 5;
            if (unit === 's' && defaultDur < 15) defaultDur = 15;
            onChange({ durationUnit: unit, duration: defaultDur });
        },
        [onChange, params.duration]
    );

    return (
        <div className={classNames('dtrader-params-panel', className)}>
            {/* Account Balance Summary */}
            <div className='dtrader-balance-row'>
                <span className='dtrader-balance-label'>Account Balance</span>
                <span className='dtrader-balance-val'>
                    {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    {currency}
                </span>
            </div>

            {/* Deriv Original Style: Trade Type Dropdown Selector */}
            <div className='dtrader-section'>
                <label className='dtrader-section-label'>Trade Type</label>
                <button
                    type='button'
                    className='dtrader-type-dropdown-btn'
                    onClick={() => setIsTypeModalOpen(true)}
                >
                    <div className='dtrader-type-left'>
                        <div className='dtrader-type-icon-box'>
                            <ActiveIcon size={18} />
                        </div>
                        <div className='dtrader-type-info'>
                            <span className='dtrader-type-title'>{activeCategory.label}</span>
                            <span className='dtrader-type-subtitle'>{activeCategory.desc}</span>
                        </div>
                    </div>
                    <ChevronDown size={18} className='dtrader-type-arrow' />
                </button>
            </div>

            {/* Trade Type Selection Modal Overlay */}
            {isTypeModalOpen && (
                <div className='dtrader-type-modal-backdrop' onClick={() => setIsTypeModalOpen(false)}>
                    <div className='dtrader-type-modal' onClick={e => e.stopPropagation()}>
                        <div className='dtrader-type-modal-header'>
                            <h3>Select Trade Type</h3>
                            <button
                                type='button'
                                className='dtrader-modal-close'
                                onClick={() => setIsTypeModalOpen(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className='dtrader-type-modal-body'>
                            {CATEGORY_GROUPS.map(group => (
                                <div key={group.title} className='dtrader-type-group'>
                                    <h4 className='dtrader-type-group-title'>{group.title}</h4>
                                    <div className='dtrader-type-cards'>
                                        {group.items.map(item => {
                                            const Icon = item.icon;
                                            const isSelected = params.category === item.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type='button'
                                                    className={classNames('dtrader-type-card', { active: isSelected })}
                                                    onClick={() => {
                                                        onCategoryChange(item.id);
                                                        setIsTypeModalOpen(false);
                                                    }}
                                                >
                                                    <div className='dtrader-card-icon'>
                                                        <Icon size={20} />
                                                    </div>
                                                    <div className='dtrader-card-text'>
                                                        <strong>{item.label}</strong>
                                                        <span>{item.desc}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Duration Section (Hidden for Accumulators) */}
            {!isAccumulator && (
                <div className='dtrader-section'>
                    <div className='dtrader-section-header'>
                        <label className='dtrader-section-label'>Duration</label>
                        <div className='dtrader-unit-pills'>
                            {(!isHighLow && !isTouchNoTouch && !isMultiplier) && (
                                <button
                                    type='button'
                                    className={classNames('dtrader-unit-pill', { active: params.durationUnit === 't' })}
                                    onClick={() => handleDurationUnitChange('t')}
                                >
                                    Ticks
                                </button>
                            )}
                            {!isDigitMatchDiff && !isDigitOverUnder && !isDigitEvenOdd && !isMultiplier && (
                                <>
                                    <button
                                        type='button'
                                        className={classNames('dtrader-unit-pill', { active: params.durationUnit === 's' })}
                                        onClick={() => handleDurationUnitChange('s')}
                                    >
                                        Sec
                                    </button>
                                    <button
                                        type='button'
                                        className={classNames('dtrader-unit-pill', { active: params.durationUnit === 'm' })}
                                        onClick={() => handleDurationUnitChange('m')}
                                    >
                                        Min
                                    </button>
                                    <button
                                        type='button'
                                        className={classNames('dtrader-unit-pill', { active: params.durationUnit === 'h' })}
                                        onClick={() => handleDurationUnitChange('h')}
                                    >
                                        Hours
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {params.durationUnit === 't' ? (
                        <div className='dtrader-quick-ticks'>
                            {[1, 2, 3, 5, 10].map(tick => (
                                <button
                                    key={tick}
                                    type='button'
                                    className={classNames('dtrader-tick-pill', { active: params.duration === tick })}
                                    onClick={() => onChange({ duration: tick })}
                                >
                                    {tick} {tick === 1 ? 'Tick' : 'Ticks'}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className='dtrader-stepper-box'>
                            <input
                                type='number'
                                className='dtrader-stepper-input'
                                value={params.duration}
                                min={1}
                                max={3600}
                                onChange={handleDurationChange}
                            />
                            <span className='dtrader-stepper-unit'>
                                {params.durationUnit === 's'
                                    ? 'Seconds'
                                    : params.durationUnit === 'm'
                                    ? 'Minutes'
                                    : 'Hours'}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Accumulator Growth Rate */}
            {isAccumulator && (
                <div className='dtrader-section'>
                    <label className='dtrader-section-label'>Growth Rate</label>
                    <div className='dtrader-rate-grid'>
                        {ACCUMULATOR_RATES.map(rate => (
                            <button
                                key={rate}
                                type='button'
                                className={classNames('dtrader-rate-btn', { active: params.growthRate === rate })}
                                onClick={() => onChange({ growthRate: rate })}
                            >
                                {rate * 100}%
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Multiplier Factor */}
            {isMultiplier && (
                <div className='dtrader-section'>
                    <label className='dtrader-section-label'>Multiplier Factor</label>
                    <div className='dtrader-rate-grid'>
                        {MULTIPLIERS.map(mult => (
                            <button
                                key={mult}
                                type='button'
                                className={classNames('dtrader-rate-btn', { active: params.multiplier === mult })}
                                onClick={() => onChange({ multiplier: mult })}
                            >
                                x{mult}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Digit Prediction Selector */}
            {(isDigitMatchDiff || isDigitOverUnder) && (
                <div className='dtrader-section'>
                    <label className='dtrader-section-label'>
                        {isDigitOverUnder ? 'Prediction Barrier' : 'Last Digit Target'}
                    </label>
                    <div className='dtrader-digit-grid'>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                            <button
                                key={d}
                                type='button'
                                className={classNames('dtrader-digit-button', { active: params.selectedDigit === d })}
                                onClick={() => onChange({ selectedDigit: d })}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Barrier Offset */}
            {(isHighLow || isTouchNoTouch) && (
                <div className='dtrader-section'>
                    <label className='dtrader-section-label'>Barrier Offset</label>
                    <div className='dtrader-stepper-box'>
                        <input
                            type='text'
                            className='dtrader-stepper-input'
                            placeholder='+0.50'
                            value={params.barrier || ''}
                            onChange={e => onChange({ barrier: e.target.value })}
                        />
                    </div>
                </div>
            )}

            {/* Stake Input with Steppers & Quick Amounts */}
            <div className='dtrader-section'>
                <div className='dtrader-section-header'>
                    <label className='dtrader-section-label'>Stake</label>
                    <span className='dtrader-currency-pill'>{currency}</span>
                </div>
                <div className='dtrader-stepper-box with-buttons'>
                    <button
                        type='button'
                        className='dtrader-step-btn'
                        onClick={() => stepAmount(-1)}
                        title='Decrease Stake'
                    >
                        <Minus size={14} />
                    </button>
                    <input
                        type='number'
                        step='any'
                        min={0.35}
                        className='dtrader-stepper-input centered'
                        value={params.amount}
                        onChange={handleAmountChange}
                    />
                    <button
                        type='button'
                        className='dtrader-step-btn'
                        onClick={() => stepAmount(1)}
                        title='Increase Stake'
                    >
                        +
                    </button>
                </div>
                <div className='dtrader-quick-amounts'>
                    {QUICK_STAKES.map(stk => (
                        <button
                            key={stk}
                            type='button'
                            className={classNames('dtrader-quick-amount-btn', { active: params.amount === stk })}
                            onClick={() => onChange({ amount: stk })}
                        >
                            +{stk}
                        </button>
                    ))}
                </div>
            </div>

            {/* Risk Management (Take Profit & Stop Loss) */}
            {(isMultiplier || isAccumulator) && (
                <div className='dtrader-section'>
                    <label className='dtrader-section-label'>Take Profit (Optional)</label>
                    <div className='dtrader-stepper-box'>
                        <input
                            type='number'
                            step='any'
                            min={1}
                            placeholder='e.g. 50'
                            className='dtrader-stepper-input'
                            value={params.takeProfit || ''}
                            onChange={e => {
                                const val = parseFloat(e.target.value);
                                onChange({ takeProfit: isNaN(val) ? undefined : val });
                            }}
                        />
                        <span className='dtrader-stepper-unit'>{currency}</span>
                    </div>
                </div>
            )}

            {isMultiplier && (
                <div className='dtrader-section'>
                    <label className='dtrader-section-label'>Stop Loss (Optional)</label>
                    <div className='dtrader-stepper-box'>
                        <input
                            type='number'
                            step='any'
                            min={1}
                            placeholder='e.g. 25'
                            className='dtrader-stepper-input'
                            value={params.stopLoss || ''}
                            onChange={e => {
                                const val = parseFloat(e.target.value);
                                onChange({ stopLoss: isNaN(val) ? undefined : val });
                            }}
                        />
                        <span className='dtrader-stepper-unit'>{currency}</span>
                    </div>
                </div>
            )}
        </div>
    );
});

TradeParamsPanel.displayName = 'TradeParamsPanel';
export default TradeParamsPanel;
