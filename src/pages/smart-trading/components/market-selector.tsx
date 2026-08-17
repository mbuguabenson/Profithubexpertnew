import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './market-selector.scss';

const DEFAULT_FALLBACK_MARKETS = [
    {
        group: 'Derived Indices',
        items: [
            { value: 'R_100', label: 'Volatility 100 Index' },
            { value: 'R_10', label: 'Volatility 10 Index' },
            { value: 'R_25', label: 'Volatility 25 Index' },
            { value: 'R_50', label: 'Volatility 50 Index' },
            { value: 'R_75', label: 'Volatility 75 Index' },
            { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
            { value: '1HZ15V', label: 'Volatility 15 (1s) Index' },
            { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
            { value: '1HZ30V', label: 'Volatility 30 (1s) Index' },
            { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
            { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
            { value: '1HZ90V', label: 'Volatility 90 (1s) Index' },
            { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
        ],
    },
];

const MarketSelector = observer(() => {
    const { smart_trading } = useStore();
    const { symbol, setSymbol, markets, fetchMarkets } = smart_trading;

    useEffect(() => {
        if (!markets || markets.length === 0) {
            fetchMarkets();
        }
    }, [markets, fetchMarkets]);

    const activeMarkets = markets && markets.length > 0 ? markets : DEFAULT_FALLBACK_MARKETS;

    return (
        <div className='market-selector'>
            <select
                className='market-selector__select'
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                aria-label='Select Market'
            >
                {activeMarkets.map(group => (
                    <optgroup key={group.group} label={group.group}>
                        {group.items.map(item => (
                            <option key={item.value} value={item.value}>
                                {item.label}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
        </div>
    );
});

export default MarketSelector;

