// Updated to use centralized translation service to eliminate duplication
import { activeSymbolCategorizationService } from '../services/active-symbol-categorization.service';

export interface ActiveSymbol {
    symbol: string;
    underlying_symbol?: string;
    display_name: string;
    market: string;
    market_display_name?: string;
    submarket: string;
    submarket_display_name?: string;
    subgroup?: string;
    pip?: number;
    pip_size?: number;
    exchange_is_open?: boolean;
    is_trading_suspended?: boolean;
}

export type ActiveSymbols = ActiveSymbol[];

type MarketOrderMap = {
    [key: string]: number;
};

// Use centralized service for submarket display names to eliminate duplication
const getSubmarketDisplayName = (submarket: string) => {
    if (!submarket) return '';
    return activeSymbolCategorizationService.getSubmarketDisplayName(submarket) || submarket || '';
};

const sortSymbols = (symbolsList: ActiveSymbols) => {
    if (!Array.isArray(symbolsList)) return [];

    const marketSortingOrder = ['synthetic_index', 'forex', 'indices', 'cryptocurrency', 'commodities'];
    const marketOrderMap: MarketOrderMap = marketSortingOrder.reduce(
        (acc: MarketOrderMap, market: string, index: number) => {
            acc[market] = index;
            return acc;
        },
        {}
    );

    // Create defensive copy to avoid mutating the original array
    // This ensures immutability and prevents side effects in calling code
    return symbolsList.slice().sort((a, b) => {
        if (!a || !b) return 0;
        const marketOrderA =
            a.market && marketOrderMap[a.market] !== undefined ? marketOrderMap[a.market] : symbolsList.length;
        const marketOrderB =
            b.market && marketOrderMap[b.market] !== undefined ? marketOrderMap[b.market] : symbolsList.length;
        if (marketOrderA !== marketOrderB) {
            return marketOrderA - marketOrderB;
        }
        const nameA = getSubmarketDisplayName(a.submarket) || a.display_name || a.symbol || '';
        const nameB = getSubmarketDisplayName(b.submarket) || b.display_name || b.symbol || '';
        return nameA.localeCompare(nameB);
    });
};

export default sortSymbols;
