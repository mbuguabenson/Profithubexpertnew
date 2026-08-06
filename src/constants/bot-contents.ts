type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    CHART: 2,
    TRADING_BOTS: 3,
    ANALYSIS_TOOL: 4,
    COPY_TRADING: 5,
    TRADINGVIEW: 6,
    SIGNALS: 7,
    AUTO_TRADES: 8,
    SCANNER: 9,
    MANUAL_TRADING: 10,
    EASY_TOOL: 11,
    SIGNAL_CENTRE: 12,
    MARKETKILLER: 13,
    MULTI_TRADER: 14,
    AI_COMPOUNDING_ENGINE: 15,
    DTRADER: 16,
    AI_TRADING_ENGINE: 17,
    DCIRCLES: 18,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-charts',
    'id-trading-bots',
    'id-analysis-tool',
    'id-copy-trading',
    'id-tradingview',
    'id-signals',
    'id-auto-trades',
    'id-scanner',
    'id-manual-trading',
    'id-easy-tool',
    'id-signal-centre',
    'id-marketkiller',
    'id-multi-trader',
    'id-ai-compounding-engine',
    'id-dtrader',
    'id-ai-trading-engine',
    'id-dcircles',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
