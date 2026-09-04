/**
 * Comprehensive list of all supported Deriv markets & synthetic indices.
 * Provides unified fallback definitions, groupings, and symbol resolution helpers.
 */

export interface MarketOption {
    value: string;
    label: string;
    group: string;
    symbol?: string;
    display_name?: string;
    market?: string;
    submarket?: string;
}

export interface GroupedMarketOptions {
    group: string;
    items: { value: string; label: string }[];
}

export const ALL_DERIV_MARKETS: MarketOption[] = [
    // ── Continuous Volatility Indices ──
    {
        value: 'R_10',
        label: 'Volatility 10 Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: 'R_25',
        label: 'Volatility 25 Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: 'R_50',
        label: 'Volatility 50 Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: 'R_75',
        label: 'Volatility 75 Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: 'R_100',
        label: 'Volatility 100 Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },

    // ── 1-Second Continuous Volatility Indices (1s) ──
    {
        value: '1HZ10V',
        label: 'Volatility 10 (1s) Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: '1HZ15V',
        label: 'Volatility 15 (1s) Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: '1HZ25V',
        label: 'Volatility 25 (1s) Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: '1HZ30V',
        label: 'Volatility 30 (1s) Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: '1HZ50V',
        label: 'Volatility 50 (1s) Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: '1HZ75V',
        label: 'Volatility 75 (1s) Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: '1HZ90V',
        label: 'Volatility 90 (1s) Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    {
        value: '1HZ100V',
        label: 'Volatility 100 (1s) Index',
        group: 'Continuous Indices',
        market: 'synthetic_index',
        submarket: 'random_index',
    },
    // NOTE: 1HZ150V, 1HZ200V, 1HZ250V, 1HZ300V are disabled — omitted from fallback

    // ── Crash/Boom Indices ──
    {
        value: 'CRASH300N',
        label: 'Crash 300 Index',
        group: 'Crash/Boom Indices',
        market: 'synthetic_index',
        submarket: 'crash_index',
    },
    {
        value: 'CRASH500',
        label: 'Crash 500 Index',
        group: 'Crash/Boom Indices',
        market: 'synthetic_index',
        submarket: 'crash_index',
    },
    {
        value: 'CRASH1000',
        label: 'Crash 1000 Index',
        group: 'Crash/Boom Indices',
        market: 'synthetic_index',
        submarket: 'crash_index',
    },
    {
        value: 'BOOM300N',
        label: 'Boom 300 Index',
        group: 'Crash/Boom Indices',
        market: 'synthetic_index',
        submarket: 'crash_index',
    },
    {
        value: 'BOOM500',
        label: 'Boom 500 Index',
        group: 'Crash/Boom Indices',
        market: 'synthetic_index',
        submarket: 'crash_index',
    },
    {
        value: 'BOOM1000',
        label: 'Boom 1000 Index',
        group: 'Crash/Boom Indices',
        market: 'synthetic_index',
        submarket: 'crash_index',
    },

    // ── Jump Indices ──
    {
        value: 'JD10',
        label: 'Jump 10 Index',
        group: 'Jump Indices',
        market: 'synthetic_index',
        submarket: 'jump_index',
    },
    {
        value: 'JD25',
        label: 'Jump 25 Index',
        group: 'Jump Indices',
        market: 'synthetic_index',
        submarket: 'jump_index',
    },
    {
        value: 'JD50',
        label: 'Jump 50 Index',
        group: 'Jump Indices',
        market: 'synthetic_index',
        submarket: 'jump_index',
    },
    {
        value: 'JD75',
        label: 'Jump 75 Index',
        group: 'Jump Indices',
        market: 'synthetic_index',
        submarket: 'jump_index',
    },
    {
        value: 'JD100',
        label: 'Jump 100 Index',
        group: 'Jump Indices',
        market: 'synthetic_index',
        submarket: 'jump_index',
    },

    // ── Step Indices ──
    {
        value: 'STPIND',
        label: 'Step Index',
        group: 'Step Indices',
        market: 'synthetic_index',
        submarket: 'step_index',
    },
    {
        value: 'STEP100',
        label: 'Step 100 Index',
        group: 'Step Indices',
        market: 'synthetic_index',
        submarket: 'step_index',
    },
    {
        value: 'STEP200',
        label: 'Step 200 Index',
        group: 'Step Indices',
        market: 'synthetic_index',
        submarket: 'step_index',
    },
    {
        value: 'STEP500',
        label: 'Step 500 Index',
        group: 'Step Indices',
        market: 'synthetic_index',
        submarket: 'step_index',
    },

    // ── Range Break Indices ──
    {
        value: 'RDBEAR',
        label: 'Range Break 100 Index',
        group: 'Range Break Indices',
        market: 'synthetic_index',
        submarket: 'range_break',
    },
    {
        value: 'RDBULL',
        label: 'Range Break 200 Index',
        group: 'Range Break Indices',
        market: 'synthetic_index',
        submarket: 'range_break',
    },

    // ── Drift Switch Indices ──
    {
        value: 'DSI10',
        label: 'Drift Switch 10 Index',
        group: 'Drift Switch Indices',
        market: 'synthetic_index',
        submarket: 'random_daily',
    },
    {
        value: 'DSI20',
        label: 'Drift Switch 20 Index',
        group: 'Drift Switch Indices',
        market: 'synthetic_index',
        submarket: 'random_daily',
    },
    {
        value: 'DSI30',
        label: 'Drift Switch 30 Index',
        group: 'Drift Switch Indices',
        market: 'synthetic_index',
        submarket: 'random_daily',
    },
];

/**
 * Returns grouped market options for HTML select optgroups.
 */
export function getGroupedMarkets(customMarkets?: MarketOption[]): GroupedMarketOptions[] {
    const list = customMarkets || ALL_DERIV_MARKETS;
    const groupMap: Record<string, { value: string; label: string }[]> = {};

    list.forEach(m => {
        if (!groupMap[m.group]) {
            groupMap[m.group] = [];
        }
        groupMap[m.group].push({ value: m.value, label: m.label });
    });

    return Object.keys(groupMap).map(group => ({
        group,
        items: groupMap[group],
    }));
}

/**
 * Derives full market list from live Deriv API active_symbols array, falling back to comprehensive list.
 */
export function getAllMarketsFromApi(active_symbols?: any[]): MarketOption[] {
    if (!active_symbols || !Array.isArray(active_symbols) || active_symbols.length === 0) {
        return ALL_DERIV_MARKETS;
    }

    const symbolMap = new Map<string, MarketOption>();

    // Enhance and add from active_symbols
    active_symbols.forEach((s: any) => {
        const sym = s.symbol || s.underlying_symbol;
        if (!sym) return;

        const displayName = s.display_name || s.symbol_display_name || sym;
        const marketName = s.market_display_name || s.market || 'Derived Indices';

        symbolMap.set(sym, {
            value: sym,
            label: displayName,
            group: marketName,
            symbol: sym,
            display_name: displayName,
        });
    });

    return Array.from(symbolMap.values());
}
