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
    TRADINGVIEW: 5,
    SIGNALS: 6,
    AUTO_TRADES: 7,
    SCANNER: 8,
    MANUAL_TRADING: 9,
    EASY_TOOL: 10,
    SIGNAL_CENTRE: 11,
    MARKETKILLER: 12,
    MULTI_TRADER: 13,
    MARKET_HUNTER_PRO: 14,
    AI_TRADING_ENGINE: 15,
    DCIRCLES: 16,
    DTRADER: 17,
    DIGITFLOW: 18,
    ELITE_PRO: 19,
    POVERTY_HUNTER: 20,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-charts',
    'id-trading-bots',
    'id-analysis-tool',
    'id-tradingview',
    'id-signals',
    'id-auto-trades',
    'id-scanner',
    'id-manual-trading',
    'id-easy-tool',
    'id-signal-centre',
    'id-marketkiller',
    'id-multi-trader',
    'id-market-hunter-pro',
    'id-ai-trading-engine',
    'id-dcircles',
    'id-dtrader',
    'id-digitflow',
    'id-elite-pro',
    'id-poverty-hunter',
];
