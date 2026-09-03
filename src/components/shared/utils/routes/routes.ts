type Service = 'derivCom' | 'smartTrader' | 'derivHub' | 'derivHome' | 'derivDtrader';
type DomainType = 'me' | 'be' | 'com';

interface DomainConfig {
    staging: string | Record<DomainType, string>;
    production: Record<DomainType, string>;
}

const domains: Record<Service, DomainConfig> = {
    derivCom: {
        staging: 'https://staging.deriv.com',
        production: {
            me: 'https://deriv.me',
            be: 'https://deriv.be',
            com: 'https://deriv.com',
        },
    },
    smartTrader: {
        staging: {
            me: 'https://staging-smarttrader.deriv.me',
            be: 'https://staging-smarttrader.deriv.be',
            com: 'https://staging-smarttrader.deriv.com',
        },
        production: {
            me: 'https://smarttrader.deriv.me',
            be: 'https://smarttrader.deriv.be',
            com: 'https://smarttrader.deriv.com',
        },
    },
    derivHub: {
        staging: 'https://staging-hub.deriv.com',
        production: {
            me: 'https://hub.deriv.me',
            be: 'https://hub.deriv.be',
            com: 'https://hub.deriv.com',
        },
    },
    derivHome: {
        staging: 'https://staging-home.deriv.com',
        production: {
            me: 'https://home.deriv.com', // No .me domain yet, using .com
            be: 'https://home.deriv.com', // No .be domain yet, using .com
            com: 'https://home.deriv.com',
        },
    },
    derivDtrader: {
        staging: 'https://staging-dtrader.deriv.com',
        production: {
            me: 'https://dtrader.deriv.com', // No .me domain yet, using .com
            be: 'https://dtrader.deriv.com', // No .be domain yet, using .com
            com: 'https://dtrader.deriv.com',
        },
    },
};

export const getDerivDomain = (service: Service): string => {
    const hostname = window.location.hostname;
    const isStaging = hostname.includes('staging');
    const isDev = hostname.includes('dev-') || hostname.includes('localhost') || hostname.includes('127.0.0.1');
    const domainType: DomainType = hostname.endsWith('.me') ? 'me' : hostname.endsWith('.be') ? 'be' : 'com';

    const serviceConfig = domains[service];

    // Handle development environment for derivHome and derivDtrader
    if (service === 'derivHome' && isDev) {
        return 'https://dev-home.deriv.com';
    }

    if (service === 'derivDtrader' && isDev) {
        return 'https://dev-dtrader.deriv.com';
    }

    if (isStaging) {
        if (typeof serviceConfig.staging === 'string') {
            return serviceConfig.staging;
        } else {
            return serviceConfig.staging[domainType];
        }
    } else {
        return serviceConfig.production[domainType];
    }
};

/**
 * Standalone routes that use the domain helper functions.
 * Uses template literals to compose URLs dynamically.
 */
export const standalone_routes = {
    account_settings: `${getDerivDomain('derivHub')}/accounts`,
    bot: `${window.location.origin}`,
    cashier: `${getDerivDomain('derivDtrader')}/cashier/`,
    cashier_deposit: `${getDerivDomain('derivDtrader')}/cashier/deposit`,
    cashier_p2p: `${getDerivDomain('derivDtrader')}/cashier/p2p`,
    contract: `${getDerivDomain('derivDtrader')}/contract/:contract_id`,
    personal_details: `${getDerivDomain('derivDtrader')}/account/personal-details`,
    positions: `${getDerivDomain('derivDtrader')}/reports/positions`,
    profit: `${getDerivDomain('derivDtrader')}/reports/profit`,
    reports: `${getDerivDomain('derivDtrader')}/reports`,
    root: `${getDerivDomain('derivHome')}/dashboard/home`,
    smarttrader: getDerivDomain('smartTrader'),
    statement: `${getDerivDomain('derivDtrader')}/reports/statement`,
    trade: `${getDerivDomain('derivDtrader')}/dtrader`,
    traders_hub: `${getDerivDomain('derivHome')}/dashboard/home`,
    traders_hub_lowcode: getDerivDomain('derivHub'),
    recent_transactions: `${getDerivDomain('derivHub')}/tradershub/redirect?action=redirect_to&redirect_to=wallet`,
    wallets_transfer: `${getDerivDomain('derivDtrader')}/wallet/account-transfer`,
    signup: `${getDerivDomain('derivHome')}/dashboard/signup`,
    deriv_com: getDerivDomain('derivCom'),
    deriv_app: `${getDerivDomain('derivHome')}/dashboard/home`,
};

export const routes = {
    callback_page: '/callback',
    reset_password: '/',
    error404: '/404',
    index: '/index',
    redirect: '/redirect',
    endpoint: '/endpoint',
    complaints_policy: '/complaints-policy',
    contract: '/contract/:contract_id',

    // platforms
    mt5: '/mt5',
    dxtrade: '/derivx',
    bot: '/bot',
    trade: '/dtrader',
    trader_positions: '/dtrader/positions',
    smarttrader: 'https://smarttrader.deriv.com',

    // account
    account: '/account',
    trading_assessment: '/account/trading-assessment',
    languages: '/account/languages',
    financial_assessment: '/account/financial-assessment',
    personal_details: '/account/personal-details',
    proof_of_identity: '/account/proof-of-identity',
    proof_of_address: '/account/proof-of-address',
    proof_of_ownership: '/account/proof-of-ownership',
    proof_of_income: '/account/proof-of-income',
    passwords: '/account/passwords',
    passkeys: '/account/passkeys',
    phone_verification: '/account/personal-details/phone-verification',
    closing_account: '/account/closing-account',
    deactivate_account: '/account/deactivate-account',
    account_closed: '/account-closed',
    account_limits: '/account/account-limits',
    connected_apps: '/account/connected-apps',
    api_token: '/account/api-token',
    login_history: '/account/login-history',
    two_factor_authentication: '/account/two-factor-authentication',
    self_exclusion: '/account/self-exclusion',

    // settings
    settings: '/settings',
    account_password: '/settings/account_password',
    apps: '/settings/apps',

    // reports
    reports: '/reports',
    positions: '/reports/positions',
    profit: '/reports/profit',
    statement: '/reports/statement',

    // cashier
    cashier: '/cashier',
    cashier_deposit: '/cashier/deposit',
    cashier_withdrawal: '/cashier/withdrawal',
    cashier_pa: '/cashier/payment-agent',
    cashier_acc_transfer: '/cashier/account-transfer',
    cashier_pa_transfer: '/cashier/payment-agent-transfer',
    cashier_p2p: '/cashier/p2p',
    cashier_onramp: '/cashier/on-ramp',
    cashier_p2p_verification: '/cashier/p2p/verification',
    wallets_transfer: '/wallet/account-transfer',
    wallets_deposit: '/wallet/deposit',
    wallets_withdrawal: '/wallet/withdrawal',
    wallets_transactions: '/wallet/transactions',

    root: '/',
};
