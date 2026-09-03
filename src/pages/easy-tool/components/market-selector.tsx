import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './market-selector.scss';
import { getGroupedMarkets } from '@/constants/markets';

const DEFAULT_FALLBACK_MARKETS = getGroupedMarkets();

const MarketSelector = observer(() => {
    const store = useStore();
    if (!store?.easy_tool) return null;

    const { easy_tool } = store;
    const { symbol = '1HZ100V', setSymbol, markets = [], fetchMarkets } = easy_tool;

    useEffect(() => {
        if (!markets || markets.length === 0) {
            fetchMarkets?.();
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
