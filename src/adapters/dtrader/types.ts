export type TradeCategory =
    | 'rise_fall'
    | 'high_low'
    | 'digits_matches_differs'
    | 'digits_even_odd'
    | 'digits_over_under'
    | 'touch_notouch'
    | 'multiplier'
    | 'accumulator';

export type ContractType =
    | 'CALL'
    | 'PUT'
    | 'HIGHER'
    | 'LOWER'
    | 'DIGITMATCH'
    | 'DIGITDIFF'
    | 'DIGITEVEN'
    | 'DIGITODD'
    | 'DIGITOVER'
    | 'DIGITUNDER'
    | 'ONETOUCH'
    | 'NOTOUCH'
    | 'MULTUP'
    | 'MULTDOWN'
    | 'ACCU';

export type DurationUnit = 't' | 's' | 'm' | 'h' | 'd';

export interface TradeParams {
    symbol: string;
    category: TradeCategory;
    basis: 'stake' | 'payout';
    amount: number;
    duration: number;
    durationUnit: DurationUnit;
    barrier?: string;
    barrier2?: string;
    selectedDigit?: number; // 0-9
    growthRate?: number; // e.g. 0.01, 0.02, 0.03, 0.04, 0.05
    multiplier?: number; // 10, 20, 40, 60, 100
    takeProfit?: number;
    stopLoss?: number;
    hasCancellation?: boolean;
    cancellationDuration?: string;
}

export interface ProposalData {
    id: string;
    contract_type: ContractType;
    ask_price: number;
    payout: number;
    profit: number;
    returns: number; // percentage
    spot?: number;
    spot_time?: number;
    longcode?: string;
    error?: string;
    barrier?: string;
    growth_rate?: number;
}

export interface ContractTick {
    epoch: number;
    quote: number;
    tick_number?: number;
}

export interface OpenPosition {
    contract_id: number;
    transaction_id: number;
    contract_type: string;
    underlying: string;
    display_name?: string;
    barrier?: string;
    high_barrier?: string;
    low_barrier?: string;
    buy_price: number;
    bid_price: number;
    payout: number;
    profit: number;
    profit_percentage: number;
    current_spot?: number;
    entry_spot?: number;
    entry_tick_time?: number;
    purchase_time: number;
    date_expiry?: number;
    tick_count?: number;
    current_tick?: number;
    is_valid_to_sell: boolean;
    is_sold: boolean;
    status: 'open' | 'won' | 'lost' | 'sold';
    longcode: string;
    shortcode?: string;
    growth_rate?: number;
    ticks?: ContractTick[];
}

export interface SettledContract {
    contract_id: number;
    transaction_id: number;
    contract_type: string;
    underlying: string;
    display_name?: string;
    buy_price: number;
    sell_price: number;
    profit: number;
    status: 'won' | 'lost';
    purchase_time: number;
    sell_time: number;
    entry_spot?: number;
    exit_spot?: number;
    barrier?: string;
    longcode: string;
    shortcode?: string;
    ticks?: ContractTick[];
}

export interface CategoryOption {
    id: TradeCategory;
    name: string;
    group: string;
    description: string;
    types: ContractType[];
}
