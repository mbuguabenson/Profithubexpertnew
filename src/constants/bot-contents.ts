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
    SCANNER: 7,
    MANUAL_TRADING: 8,
    EASY_TOOL: 9,
    SIGNAL_CENTRE: 10,
    MARKETKILLER: 11,
    MULTI_TRADER: 12,
    MARKET_HUNTER_PRO: 13,
    AI_TRADING_ENGINE: 14,
    DIGITFLOW: 15,
    ELITE_PRO: 16,
    POVERTY_HUNTER: 17,
    AUTO_X_EO: 18,
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
    'id-scanner',
    'id-manual-trading',
    'id-easy-tool',
    'id-signal-centre',
    'id-marketkiller',
    'id-multi-trader',
    'id-market-hunter-pro',
    'id-ai-trading-engine',
    'id-digitflow',
    'id-elite-pro',
    'id-poverty-hunter',
    'id-auto-x-eo',
];
