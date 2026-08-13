import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { TTradeCategory } from '@/stores/trader-store';
import { TrendingUp, Award, Layers, Target, Hash, Zap, Percent, Activity } from 'lucide-react';

const SYMBOLS_LIST = [
    { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index' },
    { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index' },
    { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index' },
    { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index' },
    { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index' },
    { symbol: 'R_100', name: 'Volatility 100 Index' },
    { symbol: 'R_75', name: 'Volatility 75 Index' },
    { symbol: 'R_50', name: 'Volatility 50 Index' },
    { symbol: 'R_25', name: 'Volatility 25 Index' },
    { symbol: 'R_10', name: 'Volatility 10 Index' },
    { symbol: 'BOOM500', name: 'Boom 500 Index' },
    { symbol: 'CRASH500', name: 'Crash 500 Index' },
    { symbol: 'STPINDEX', name: 'Step Index' },
];

const CATEGORIES: { id: TTradeCategory; label: string; icon: React.ElementType }[] = [
    { id: 'rise_fall', label: 'Rise / Fall', icon: TrendingUp },
    { id: 'high_low', label: 'Higher / Lower', icon: Activity },
    { id: 'digits_match_diff', label: 'Matches / Differs', icon: Hash },
    { id: 'digits_over_under', label: 'Over / Under', icon: Target },
    { id: 'digits_even_odd', label: 'Even / Odd', icon: Layers },
    { id: 'touch_no_touch', label: 'Touch / No Touch', icon: Award },
    { id: 'accumulator', label: 'Accumulator', icon: Zap },
    { id: 'multiplier', label: 'Multiplier', icon: Percent },
];

const TradeParamsPanel: React.FC = observer(() => {
    const store = useStore();
    
    if (!store?.trader) return null;
    
    const { trader } = store;

    return (
        <div className="trade-params-panel">
            {/* Symbol Selection */}
            <div className="panel-group">
                <label className="panel-label">Asset / Market</label>
                <select
                    className="panel-select"
                    value={trader.symbol}
                    onChange={(e) => {
                        const sel = SYMBOLS_LIST.find(s => s.symbol === e.target.value);
                        trader.setSymbol(e.target.value, sel?.name);
                    }}
                >
                    {SYMBOLS_LIST.map((item) => (
                        <option key={item.symbol} value={item.symbol}>
                            {item.name} ({item.symbol})
                        </option>
                    ))}
                </select>
            </div>

            {/* Category Selector */}
            <div className="panel-group">
                <label className="panel-label">Trade Category</label>
                <div className="category-grid">
                    {CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = trader.category === cat.id;
                        return (
                            <button
                                key={cat.id}
                                className={`category-btn ${isActive ? 'category-btn--active' : ''}`}
                                onClick={() => trader.setCategory(cat.id)}
                            >
                                <Icon className="cat-icon" size={16} />
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Duration Settings (Not required for Accumulator/Multiplier) */}
            {trader.category !== 'accumulator' && trader.category !== 'multiplier' && (
                <div className="panel-group">
                    <label className="panel-label">Duration</label>
                    <div className="input-with-select">
                        <input
                            type="number"
                            min={1}
                            max={365}
                            className="panel-input"
                            value={trader.duration}
                            onChange={(e) => trader.setDuration(Number(e.target.value))}
                        />
                        <select
                            className="panel-select-sub"
                            value={trader.duration_unit}
                            onChange={(e) => trader.setDurationUnit(e.target.value as any)}
                        >
                            <option value="t">Ticks</option>
                            <option value="s">Seconds</option>
                            <option value="m">Minutes</option>
                            <option value="h">Hours</option>
                            <option value="d">Days</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Prediction for Digits */}
            {(trader.category === 'digits_match_diff' || trader.category === 'digits_over_under') && (
                <div className="panel-group">
                    <label className="panel-label">Digit Prediction</label>
                    <div className="digit-picker">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                            <button
                                key={digit}
                                className={`digit-btn ${trader.prediction === digit ? 'digit-btn--active' : ''}`}
                                onClick={() => trader.setPrediction(digit)}
                            >
                                {digit}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Barrier for Touch / High Low */}
            {(trader.category === 'high_low' || trader.category === 'touch_no_touch') && (
                <div className="panel-group">
                    <label className="panel-label">Offset / Barrier</label>
                    <input
                        type="text"
                        className="panel-input"
                        value={trader.barrier}
                        onChange={(e) => trader.setBarrier(e.target.value)}
                        placeholder="+0.5"
                    />
                </div>
            )}

            {/* Growth Rate for Accumulator */}
            {trader.category === 'accumulator' && (
                <div className="panel-group">
                    <label className="panel-label">Growth Rate</label>
                    <div className="button-group">
                        {[0.01, 0.02, 0.03, 0.04, 0.05].map((rate) => (
                            <button
                                key={rate}
                                className={`pill-btn ${trader.growth_rate === rate ? 'pill-btn--active' : ''}`}
                                onClick={() => trader.setGrowthRate(rate)}
                            >
                                {(rate * 100).toFixed(0)}%
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Multiplier Selector */}
            {trader.category === 'multiplier' && (
                <div className="panel-group">
                    <label className="panel-label">Multiplier</label>
                    <div className="button-group">
                        {[10, 20, 30, 50, 100].map((mult) => (
                            <button
                                key={mult}
                                className={`pill-btn ${trader.multiplier === mult ? 'pill-btn--active' : ''}`}
                                onClick={() => trader.setMultiplier(mult)}
                            >
                                {mult}x
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Stake Amount & Basis */}
            <div className="panel-group">
                <div className="label-row">
                    <label className="panel-label">Amount</label>
                    {trader.category !== 'accumulator' && trader.category !== 'multiplier' && (
                        <div className="basis-toggle">
                            <button
                                className={`basis-btn ${trader.basis === 'stake' ? 'basis-btn--active' : ''}`}
                                onClick={() => trader.setBasis('stake')}
                            >
                                Stake
                            </button>
                            <button
                                className={`basis-btn ${trader.basis === 'payout' ? 'basis-btn--active' : ''}`}
                                onClick={() => trader.setBasis('payout')}
                            >
                                Payout
                            </button>
                        </div>
                    )}
                </div>
                <div className="input-with-currency">
                    <span className="currency-prefix">$</span>
                    <input
                        type="number"
                        step="0.5"
                        min="0.35"
                        className="panel-input"
                        value={trader.amount}
                        onChange={(e) => trader.setAmount(Number(e.target.value))}
                    />
                </div>
            </div>
        </div>
    );
});

export default TradeParamsPanel;
