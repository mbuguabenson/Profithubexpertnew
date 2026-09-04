/* [AI] - Analytics removed - utility functions moved to @/utils/account-helpers */
import { getAccountId, getAccountType, isDemoAccount, removeUrlParameter } from '@/utils/account-helpers';
/* [/AI] */
import CommonStore from '@/stores/common-store';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { clearAuthData } from '@/utils/auth-utils';
import { resolveValidDerivWSToken } from '@/utils/token-bridge';
import { handleBackendError, isBackendError } from '@/utils/error-handler';
import { activeSymbolsProcessorService } from '../../../../services/active-symbols-processor.service';
import { observer as globalObserver } from '../../utils/observer';
import { doUntilDone, socket_state } from '../tradeEngine/utils/helpers';
import {
    CONNECTION_STATUS,
    setAccountList,
    setAuthData,
    setConnectionStatus,
    setIsAuthorized,
    setIsAuthorizing,
} from './observables/connection-status-stream';
import { generateDerivApiInstance, V2GetActiveAccountId } from './appId';
import chart_api from './chart-api';
import { ALL_DERIV_MARKETS } from '@/constants/markets';

type CurrentSubscription = {
    id: string;
    unsubscribe: () => void;
};

type SubscriptionPromise = Promise<{
    subscription: CurrentSubscription;
}>;

type TApiBaseApi = any;

const FALLBACK_SYMBOLS_LIST = [
    { value: 'R_10', label: 'Volatility 10 Index', group: 'Continuous Volatility Indices' },
    { value: 'R_25', label: 'Volatility 25 Index', group: 'Continuous Volatility Indices' },
    { value: 'R_50', label: 'Volatility 50 Index', group: 'Continuous Volatility Indices' },
    { value: 'R_75', label: 'Volatility 75 Index', group: 'Continuous Volatility Indices' },
    { value: 'R_100', label: 'Volatility 100 Index', group: 'Continuous Volatility Indices' },
    { value: '1HZ10V', label: 'Volatility 10 (1s) Index', group: 'Continuous 1s Indices' },
    { value: '1HZ15V', label: 'Volatility 15 (1s) Index', group: 'Continuous 1s Indices' },
    { value: '1HZ25V', label: 'Volatility 25 (1s) Index', group: 'Continuous 1s Indices' },
    { value: '1HZ30V', label: 'Volatility 30 (1s) Index', group: 'Continuous 1s Indices' },
    { value: '1HZ50V', label: 'Volatility 50 (1s) Index', group: 'Continuous 1s Indices' },
    { value: '1HZ75V', label: 'Volatility 75 (1s) Index', group: 'Continuous 1s Indices' },
    { value: '1HZ90V', label: 'Volatility 90 (1s) Index', group: 'Continuous 1s Indices' },
    { value: '1HZ100V', label: 'Volatility 100 (1s) Index', group: 'Continuous 1s Indices' },
    { value: 'JD10', label: 'Jump 10 Index', group: 'Jump Indices' },
    { value: 'JD25', label: 'Jump 25 Index', group: 'Jump Indices' },
    { value: 'JD50', label: 'Jump 50 Index', group: 'Jump Indices' },
    { value: 'JD75', label: 'Jump 75 Index', group: 'Jump Indices' },
    { value: 'JD100', label: 'Jump 100 Index', group: 'Jump Indices' },
    { value: 'STPIND', label: 'Step Index', group: 'Step Indices' },
    { value: 'STEP100', label: 'Step 100 Index', group: 'Step Indices' },
    { value: 'STEP200', label: 'Step 200 Index', group: 'Step Indices' },
    { value: 'STEP500', label: 'Step 500 Index', group: 'Step Indices' },
    { value: 'RDBEAR', label: 'Range Break 100 Index', group: 'Range Break Indices' },
    { value: 'RDBULL', label: 'Range Break 200 Index', group: 'Range Break Indices' },
    { value: 'DSI10', label: 'Drift Switch 10 Index', group: 'Drift Switch Indices' },
    { value: 'DSI20', label: 'Drift Switch 20 Index', group: 'Drift Switch Indices' },
    { value: 'DSI30', label: 'Drift Switch 30 Index', group: 'Drift Switch Indices' },
];

const buildFallbackActiveSymbols = (): any[] => {
    const list =
        typeof ALL_DERIV_MARKETS !== 'undefined' && Array.isArray(ALL_DERIV_MARKETS) && ALL_DERIV_MARKETS.length > 0
            ? ALL_DERIV_MARKETS
            : FALLBACK_SYMBOLS_LIST;
    return list.map(m => ({
        symbol: m.value,
        underlying_symbol: m.value,
        display_name: m.label,
        market: 'synthetic_index',
        market_display_name: 'Derived',
        submarket: 'random_index',
        submarket_display_name: m.group || 'Continuous Indices',
        subgroup: 'synthetics',
        subgroup_display_name: 'Synthetics',
        pip: 2,
        pip_size: 2,
        delay_amount: 0,
        exchange_is_open: true,
        is_trading_suspended: false,
    }));
};

class APIBase {
    api: TApiBaseApi | null = null;
    token: string = '';
    account_id: string = '';
    pip_sizes = {};
    account_info = {};
    is_running = false;
    subscriptions: CurrentSubscription[] = [];
    time_interval: ReturnType<typeof setInterval> | null = null;
    has_active_symbols = false;
    is_stopping = false;
    active_symbols: any[] = [];
    current_auth_subscriptions: SubscriptionPromise[] = [];
    is_authorized = false;
    active_symbols_promise: Promise<any[]> | null = null;
    common_store: CommonStore | undefined;
    reconnection_attempts: number = 0;
    ACTIVE_SYMBOLS_TIMEOUT_MS = 10000;
    ENRICHMENT_TIMEOUT_MS = 10000;
    private rate_limit_backoff_delay = 3000; // starts at 3s, doubles on rate limits up to 30s
    private rate_limit_retry_timer: ReturnType<typeof setTimeout> | null = null;
    private readonly MAX_RECONNECTION_ATTEMPTS = 15;
    private init_promise: Promise<void> | null = null;

    constructor() {
        this.loadCachedActiveSymbols();
    }

    private loadCachedActiveSymbols() {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const cached = localStorage.getItem('cached_active_symbols');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        this.active_symbols = parsed;
                        this.has_active_symbols = true;
                        return;
                    }
                }
            }
        } catch {}
        // Pre-seed in-memory with fallback symbols so all components have valid symbols on frame 1
        this.active_symbols = buildFallbackActiveSymbols();
        this.has_active_symbols = true;
    }

    unsubscribeAllSubscriptions = () => {
        this.current_auth_subscriptions?.forEach(subscription_promise => {
            subscription_promise
                ?.then(({ subscription }: any) => {
                    if (subscription?.id) {
                        this.api
                            ?.send({
                                forget: subscription.id,
                            })
                            .catch(() => {});
                    }
                })
                .catch(() => {});
        });
        this.current_auth_subscriptions = [];
    };

    onsocketopen() {
        setConnectionStatus(CONNECTION_STATUS.OPENED);

        // Reset reconnection attempts on successful connection
        this.reconnection_attempts = 0;

        const currentClientStore = globalObserver.getState('client.store');
        if (currentClientStore) {
            currentClientStore.setIsAccountRegenerating(false);
        }

        this.handleTokenExchangeIfNeeded();
    }

    private async handleTokenExchangeIfNeeded() {
        const urlParams = new URLSearchParams(window.location.search);
        const account_id = urlParams.get('account_id');
        const accountType = urlParams.get('account_type');

        if (account_id) {
            localStorage.setItem('active_loginid', account_id);
            // Remove account_id from URL after storing
            removeUrlParameter('account_id');
        }
        if (accountType) {
            localStorage.setItem('account_type', accountType);
            // Remove account_type from URL after storing
            removeUrlParameter('account_type');
        }

        // Check if we have an account_id from URL or localStorage
        let activeAccountId: string | null = getAccountId();

        // If no account_id in localStorage, check sessionStorage for accounts
        if (!activeAccountId) {
            try {
                const storedAccounts = sessionStorage.getItem('deriv_accounts');
                if (storedAccounts) {
                    const accounts = JSON.parse(storedAccounts);
                    if (accounts && accounts.length > 0 && accounts[0].account_id) {
                        // Use the first account as default
                        const accountId = accounts[0].account_id as string;
                        activeAccountId = accountId;
                        localStorage.setItem('active_loginid', accountId);

                        // Set account type based on account_id prefix
                        const isDemo = accountId.startsWith('VRT') || accountId.startsWith('VRTC');
                        localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
                    }
                }
            } catch (error) {
                console.error('[APIBase] Error reading accounts from sessionStorage:', error);
            }
        }

        // Now proceed with normal authorization if we have an account_id
        if (activeAccountId) {
            setIsAuthorizing(true);
            await this.authorizeAndSubscribe();
            return;
        }

        // If a PKCE auth session exists, attempt authorization from access_token even
        // when active_loginid is not yet present in localStorage.
        const authInfo = OAuthTokenExchangeService.getAuthInfo();
        if (authInfo?.access_token) {
            setIsAuthorizing(true);
            await this.authorizeAndSubscribe();
            return;
        }

        // No active account or auth info found -- end authorizing state cleanly.
        setIsAuthorizing(false);
    }

    onsocketclose() {
        setConnectionStatus(CONNECTION_STATUS.CLOSED);

        if (!this.is_authorized) {
            setIsAuthorizing(false);
        }

        this.reconnectIfNotConnected();
    }

    onSocketError = (event: Event) => {
        console.error('[APIBase] WebSocket error event:', event);
        if (!this.is_authorized) {
            setIsAuthorizing(false);
        }
    };

    async waitForConnection(timeoutMs = 5000): Promise<boolean> {
        if (this.api?.connection?.readyState === 1) return true;
        if (!this.api || this.api?.connection?.readyState > 1) {
            this.init().catch(() => {});
        }
        if (this.api?.connection?.readyState === 1) return true;

        return new Promise(resolve => {
            const start = Date.now();
            const check = () => {
                if (this.api?.connection?.readyState === 1) {
                    resolve(true);
                } else if (Date.now() - start >= timeoutMs) {
                    resolve(false);
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
    }

    async init(force_create_connection = false): Promise<void> {
        // If an init is already in flight and this is not a force reconnect, reuse the existing promise
        if (!force_create_connection && this.init_promise) {
            return this.init_promise;
        }

        // If connection is already OPEN and no force reconnect, nothing to do
        if (!force_create_connection && this.api?.connection?.readyState === 1) {
            return;
        }

        // If connection is currently CONNECTING and no force reconnect, wait for it rather than destroying it
        if (!force_create_connection && this.api?.connection?.readyState === 0) {
            return this.waitForConnection(5000).then(() => {});
        }

        this.init_promise = (async () => {
            try {
                if (this.api) {
                    this.unsubscribeAllSubscriptions();
                }

                // Reset reconnection attempts counter on successful connection initialization
                if (!force_create_connection) {
                    this.reconnection_attempts = 0;
                }

                const readyState = this.api?.connection?.readyState;
                const needsNewConnection = !this.api || readyState === undefined || readyState > 1 || force_create_connection;

                if (needsNewConnection) {
                    if (this.api?.connection) {
                        setConnectionStatus(CONNECTION_STATUS.CLOSED);
                        try {
                            this.api.connection.removeEventListener('open', this.onsocketopen.bind(this));
                            this.api.connection.removeEventListener('close', this.onsocketclose.bind(this));
                            this.api.disconnect();
                        } catch {}
                    }

                    this.api = await generateDerivApiInstance(force_create_connection);

                    this.api?.connection.addEventListener('open', this.onsocketopen.bind(this));
                    this.api?.connection.addEventListener('close', this.onsocketclose.bind(this));

                    // Store the current account ID used for this WebSocket connection
                    // This will be used to check if we need to regenerate the connection when the tab becomes active
                    const currentClientStore = globalObserver.getState('client.store');
                    if (currentClientStore) {
                        const active_login_id = getAccountId();
                        if (active_login_id) {
                            currentClientStore.setWebSocketLoginId(active_login_id);
                        }
                    }
                }

                const hasAccountID = V2GetActiveAccountId();

                if (!this.has_active_symbols && !hasAccountID) {
                    this.active_symbols_promise = this.getActiveSymbols();
                }

                this.initEventListeners();

                if (this.time_interval) clearInterval(this.time_interval);
                this.time_interval = null;

                try {
                    chart_api.init?.();
                } catch {}
            } finally {
                this.init_promise = null;
            }
        })();

        return this.init_promise;
    }

    getConnectionStatus() {
        if (this.api?.connection) {
            const ready_state = this.api.connection.readyState;
            return socket_state[ready_state as keyof typeof socket_state] || 'Unknown';
        }
        return 'Socket not initialized';
    }

    terminate() {
        // eslint-disable-next-line no-console
        if (this.api) this.api.disconnect();
    }

    initEventListeners() {
        if (window) {
            window.addEventListener('online', this.reconnectIfNotConnected);
            window.addEventListener('focus', this.reconnectIfNotConnected);
        }
    }

    async createNewInstance(account_id: string) {
        if (this.account_id !== account_id) {
            await this.init();
        }
    }

    reconnectIfNotConnected = () => {
        if (this.api?.connection?.readyState && this.api?.connection?.readyState > 1) {
            this.reconnection_attempts += 1;

            if (this.reconnection_attempts >= this.MAX_RECONNECTION_ATTEMPTS) {
                // Reset reconnection counter but do NOT clear auth data.
                // Network issues should never destroy the user's login session.
                this.reconnection_attempts = 0;
                console.warn('[APIBase] Max reconnection attempts reached, will continue retrying with backoff');
            }

            // Add exponential backoff delay to avoid hammering the server
            const delay = Math.min(1000 * Math.pow(1.5, Math.min(this.reconnection_attempts, 10)), 30000);
            setTimeout(() => this.init(true), delay);
        }
    };

    async authorizeAndSubscribe() {
        if (!this.api) return;

        this.account_id = getAccountId() || '';
        setIsAuthorizing(true);

        try {
            let authResult: any = null;
            const expectedId = this.account_id || getAccountId();

            // 1. Check if the WebSocket is already authenticated via an OTP in the connection URL for the EXPECTED account
            try {
                const balanceRes = await (this.api as any).send({ balance: 1 });
                if (balanceRes?.balance && (!expectedId || balanceRes.balance.loginid === expectedId)) {
                    authResult = balanceRes;
                    console.log(
                        '[APIBase] WebSocket authorized via OTP connection URL for:',
                        balanceRes.balance.loginid
                    );
                }
            } catch (authCheckErr: any) {
                // If it fails with AuthorizationRequired or on public socket, proceed
            }

            // 2. If not already authenticated, proceed with token authorization if available
            if (!authResult) {
                const token = await resolveValidDerivWSToken(expectedId || '');

                if (token) {
                    try {
                        const res = await this.api.authorize(token);
                        if (res?.authorize) {
                            if (!expectedId || res.authorize.loginid === expectedId) {
                                authResult = { balance: res.authorize, account_list: res.authorize.account_list };
                            } else {
                                console.warn(
                                    `[APIBase] Token authorized for ${res.authorize.loginid}, expected ${expectedId}`
                                );
                            }
                        } else if (res?.error) {
                            console.warn('[APIBase] Token authorize returned error:', res.error.message || res.error);
                            if (
                                res.error.code === 'InvalidToken' ||
                                res.error.code === 'InputValidationFailed' ||
                                String(res.error.message).includes('authorize')
                            ) {
                                localStorage.removeItem('active_token');
                                localStorage.removeItem('deriv_api_token');
                                localStorage.removeItem('token');
                                localStorage.removeItem('authToken');
                            }
                        }
                    } catch (tokErr: any) {
                        console.warn('[APIBase] Token authorize failed:', tokErr?.message || tokErr);
                        const code = tokErr?.error?.code || tokErr?.code;
                        const msg = tokErr?.error?.message || tokErr?.message || '';
                        if (
                            code === 'InvalidToken' ||
                            code === 'InputValidationFailed' ||
                            String(msg).includes('authorize')
                        ) {
                            localStorage.removeItem('active_token');
                            localStorage.removeItem('deriv_api_token');
                            localStorage.removeItem('token');
                            localStorage.removeItem('authToken');
                        }
                    }
                }
            }

            // 3. Ensure we have authResult populated (only if matching expected account)
            if (!authResult) {
                try {
                    const res = await (this.api as any).send({ balance: 1 });
                    if (res?.balance && (!expectedId || res.balance.loginid === expectedId)) {
                        authResult = res;
                    }
                } catch {
                    // Unauthenticated
                }
            }

            const balance = authResult?.balance;
            const error = authResult?.error;

            if (error || !balance) {
                const errorMessage = error
                    ? isBackendError(error)
                        ? handleBackendError(error)
                        : error.message || 'Unauthenticated'
                    : 'Unauthenticated session';

                setIsAuthorizing(false);
                this.is_authorized = false;
                if (this.has_active_symbols) {
                    this.toggleRunButton(false);
                } else {
                    this.active_symbols_promise = this.getActiveSymbols();
                }
                return { localizedMessage: errorMessage };
            }

            this.account_info = {
                balance: balance?.balance,
                currency: balance?.currency,
                loginid: balance?.loginid,
            };
            this.token = balance?.loginid;

            const account_type = getAccountType(balance?.loginid);
            const currentAccount = balance?.loginid
                ? {
                      balance: balance.balance,
                      currency: balance.currency || 'USD',
                      is_virtual: account_type === 'real' ? 0 : 1,
                      loginid: balance.loginid,
                  }
                : null;

            // Build full account list from authorize response, localStorage, or DerivWSAccountsService
            const responseAccountList = balance?.account_list || authResult?.account_list;
            const storedAccounts = DerivWSAccountsService.getStoredAccounts();
            let rawStoredClientAccounts: any = null;
            const existingBalances: Record<string, number> = {};

            try {
                const storedRaw = localStorage.getItem('client_account_details');
                if (storedRaw) {
                    rawStoredClientAccounts = JSON.parse(storedRaw);
                    if (Array.isArray(rawStoredClientAccounts)) {
                        rawStoredClientAccounts.forEach((a: any) => {
                            const id = a.loginid || a.account_id;
                            if (id && typeof a.balance === 'number' && a.balance > 0) {
                                existingBalances[id] = a.balance;
                            }
                        });
                    }
                }
            } catch {}

            try {
                const rawClientAccounts =
                    localStorage.getItem('client.accounts') || localStorage.getItem('clientAccounts');
                if (rawClientAccounts) {
                    const parsed = JSON.parse(rawClientAccounts);
                    Object.keys(parsed).forEach(id => {
                        const b = Number(parsed[id]?.balance);
                        if (id && !isNaN(b) && b > 0 && existingBalances[id] === undefined) {
                            existingBalances[id] = b;
                        }
                    });
                }
            } catch {}

            let accountList: any[] = [];
            if (responseAccountList && Array.isArray(responseAccountList) && responseAccountList.length > 0) {
                accountList = responseAccountList.map((a: any) => {
                    let bal = 0;
                    if (typeof a.balance === 'number') {
                        bal = a.balance;
                    } else if (a.loginid === balance?.loginid && typeof balance?.balance === 'number') {
                        bal = balance.balance;
                    } else if (existingBalances[a.loginid] !== undefined) {
                        bal = existingBalances[a.loginid];
                    }
                    return {
                        balance: bal,
                        currency: a.currency || 'USD',
                        is_virtual: a.is_virtual !== undefined ? a.is_virtual : isDemoAccount(a.loginid) ? 1 : 0,
                        loginid: a.loginid,
                    };
                });
            } else if (Array.isArray(rawStoredClientAccounts) && rawStoredClientAccounts.length > 0) {
                accountList = rawStoredClientAccounts.map((a: any) => {
                    let bal = typeof a.balance === 'number' ? a.balance : 0;
                    if (a.loginid === balance?.loginid && typeof balance?.balance === 'number') {
                        bal = balance.balance;
                    } else if (existingBalances[a.loginid] !== undefined) {
                        bal = existingBalances[a.loginid];
                    }
                    return {
                        balance: bal,
                        currency: a.currency || 'USD',
                        is_virtual: a.is_virtual !== undefined ? a.is_virtual : isDemoAccount(a.loginid) ? 1 : 0,
                        loginid: a.loginid,
                    };
                });
            } else if (storedAccounts && storedAccounts.length > 0) {
                accountList = storedAccounts
                    .filter(a => !a.status || a.status === 'active')
                    .map(a => ({
                        balance: parseFloat(a.balance) || existingBalances[a.account_id] || 0,
                        currency: a.currency || 'USD',
                        is_virtual: a.account_type === 'demo' ? 1 : 0,
                        loginid: a.account_id,
                    }));
            } else if (currentAccount) {
                accountList = [currentAccount];
            }

            setAccountList(accountList); // Observable stream
            setAuthData({
                balance: balance?.balance,
                currency: balance?.currency,
                loginid: balance?.loginid,
                is_virtual: account_type === 'real' ? 0 : 1,
                account_list: accountList,
            });

            // // Set account_type in localStorage based on loginid prefix using centralized utility
            const loginid = balance?.loginid || '';
            const isDemo = isDemoAccount(loginid);

            if (isDemo) {
                localStorage.setItem('account_type', 'demo');
            } else {
                localStorage.setItem('account_type', 'real');
            }

            globalObserver.emit('api.authorize', {
                account_list: accountList,
                current_account: {
                    loginid: balance?.loginid,
                    currency: balance?.currency || 'USD',
                    is_virtual: account_type === 'real' ? 0 : 1,
                    balance: typeof balance?.balance === 'number' ? balance.balance : undefined,
                },
            });

            // Update the WebSocket login ID in the client store
            const currentClientStore = globalObserver.getState('client.store');
            if (currentClientStore && balance?.loginid) {
                currentClientStore.setWebSocketLoginId(balance.loginid);
                currentClientStore.setLoginId(balance.loginid);
                currentClientStore.setCurrency(balance.currency || 'USD');
                currentClientStore.setIsLoggedIn(true);
                currentClientStore.setAccountList(accountList);
                if (typeof balance?.balance === 'number') {
                    currentClientStore.setBalance(balance.balance.toString());
                }
            }

            setAuthData({
                loginid: balance?.loginid,
                currency: balance?.currency || 'USD',
                balance: typeof balance?.balance === 'number' ? balance.balance : 0,
                is_virtual: account_type === 'real' ? 0 : 1,
                email: balance?.email || '',
                fullname: balance?.fullname || '',
                landing_company_name: balance?.landing_company_name || 'svg',
                user_id: balance?.user_id || 0,
            } as any);
            setAccountList(accountList);

            setIsAuthorized(true);
            this.is_authorized = true;
            localStorage.setItem('client_account_details', JSON.stringify(accountList));
            localStorage.setItem('client.country', balance?.country);

            if (balance?.loginid) {
                localStorage.setItem('active_loginid', balance.loginid);
            }

            if (this.has_active_symbols) {
                this.toggleRunButton(false);
            } else {
                this.active_symbols_promise = this.getActiveSymbols();
            }
            this.subscribe();
        } catch (e) {
            this.is_authorized = false;

            // Only clear auth data for permanent authentication failures.
            // Transient errors (timeout, network flicker, race conditions) should
            // NOT destroy the user's session — they can recover on reconnect.
            const errorCode = (e as any)?.error?.code || (e as any)?.code || '';
            const permanentAuthErrors = ['InvalidToken', 'ExpiredToken', 'InvalidAppID'];
            if (permanentAuthErrors.includes(errorCode)) {
                clearAuthData();
                globalObserver.emit('InvalidToken');
            } else {
                console.warn(
                    '[APIBase] Authorization failed with transient error, preserving session:',
                    errorCode || e
                );
            }

            setIsAuthorized(false);
            globalObserver.emit('Error', e);
        } finally {
            setIsAuthorizing(false);
        }
    }

    async subscribe() {
        const subscribeToStream = (streamName: string) => {
            return doUntilDone(
                () => {
                    const subscription = this.api?.send({
                        [streamName]: 1,
                        subscribe: 1,
                    });

                    if (subscription) {
                        this.current_auth_subscriptions.push(subscription);
                    }
                    return subscription;
                },
                [],
                this
            ).catch(err => {
                const code = err?.error?.code || err?.code;
                if (code !== 'AlreadySubscribed') {
                    console.warn(`[APIBase] Stream '${streamName}' subscription returned error:`, err?.error || err);
                }
            });
        };

        const streamsToSubscribe = ['balance', 'transaction', 'proposal_open_contract'];

        await Promise.all(streamsToSubscribe.map(subscribeToStream));
    }

    getActiveSymbols = async (): Promise<any[]> => {
        // Fast path 1: Return in-memory symbols if already available
        if (this.has_active_symbols && Array.isArray(this.active_symbols) && this.active_symbols.length > 0) {
            return this.active_symbols;
        }

        // Fast path 2: Return localStorage cached symbols if available
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const cached = localStorage.getItem('cached_active_symbols');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        this.active_symbols = parsed;
                        this.has_active_symbols = true;
                        return this.active_symbols;
                    }
                }
            }
        } catch {}

        // Fast path 3: If a fetch is already in flight, reuse the exact same promise (singleton lock)
        if (this.active_symbols_promise) {
            return this.active_symbols_promise;
        }

        // Start single in-flight request
        this.active_symbols_promise = (async (): Promise<any[]> => {
            let active_symbols: any[] = [];

            try {
                // Wait briefly for main WebSocket if it is connecting
                await this.waitForConnection(3000);

                if (this.api && this.api.connection?.readyState === WebSocket.OPEN) {
                    try {
                        const timeout = new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('Active symbols timeout')), this.ACTIVE_SYMBOLS_TIMEOUT_MS)
                        );
                        const fetchPromise = this.api.send({ active_symbols: 'brief' });
                        const apiResult = await Promise.race([fetchPromise, timeout]);

                        if (apiResult?.active_symbols && Array.isArray(apiResult.active_symbols) && apiResult.active_symbols.length > 0) {
                            active_symbols = apiResult.active_symbols;
                            this.rate_limit_backoff_delay = 3000; // Reset backoff on success
                        } else if (apiResult?.error) {
                            const errCode = apiResult.error.code || apiResult.error.name || '';
                            const errMsg = apiResult.error.message || '';
                            if (errCode === 'RateLimit' || errMsg.toLowerCase().includes('rate limit')) {
                                console.warn(`[APIBase] Deriv active_symbols rate limited. Coordinated backoff: ${this.rate_limit_backoff_delay}ms`);
                                this.scheduleSingleRateLimitRetry();
                            }
                        }
                    } catch (err: any) {
                        const errCode = err?.error?.code || err?.code || '';
                        const errMsg = err?.error?.message || err?.message || '';
                        if (errCode === 'RateLimit' || errMsg.toLowerCase().includes('rate limit')) {
                            console.warn(`[APIBase] Deriv active_symbols rate limited. Coordinated backoff: ${this.rate_limit_backoff_delay}ms`);
                            this.scheduleSingleRateLimitRetry();
                        } else {
                            console.warn('[APIBase] WS active symbols fetch notice:', errMsg || err);
                        }
                    }
                }
            } catch (err) {
                console.warn('[APIBase] getActiveSymbols network attempt failed, using fallback:', err);
            }

            // If network did not return symbols, use the comprehensive fallback list
            if (!active_symbols || active_symbols.length === 0) {
                active_symbols = buildFallbackActiveSymbols();
            }

            // Ensure required 1s volatility indices (15, 30, 90) are always present
            const required_1s_symbols_list = [10, 15, 25, 30, 50, 75, 90, 100];
            const required_1s_symbols = required_1s_symbols_list.map(v => ({
                symbol: `1HZ${v}V`,
                underlying_symbol: `1HZ${v}V`,
                display_name: `Volatility ${v} (1s) Index`,
                market: 'synthetic_index',
                market_display_name: 'Derived',
                submarket: 'random_index',
                submarket_display_name: 'Continuous Indices',
                subgroup: 'synthetics',
                subgroup_display_name: 'Synthetics',
                pip: 0.001,
                pip_size: 0.001,
                exchange_is_open: true,
                is_trading_suspended: false,
            }));

            required_1s_symbols.forEach(req => {
                const exists = active_symbols.some(
                    (s: any) => s.symbol === req.symbol || s.underlying_symbol === req.symbol
                );
                if (!exists) {
                    active_symbols.push(req);
                }
            });

            try {
                this.has_active_symbols = true;

                // Process active symbols using the dedicated service with fallback
                try {
                    const enrichmentTimeout = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Enrichment timeout')), this.ENRICHMENT_TIMEOUT_MS)
                    );

                    const enrichmentPromise = activeSymbolsProcessorService.processActiveSymbols(active_symbols);
                    const processedResult = await Promise.race([enrichmentPromise, enrichmentTimeout]);

                    this.active_symbols = processedResult.enrichedSymbols;
                    this.pip_sizes = processedResult.pipSizes;
                } catch (enrichmentError) {
                    this.active_symbols = active_symbols;
                    this.pip_sizes = {};
                }

                // Persist to localStorage for instantaneous loading next time
                try {
                    if (typeof window !== 'undefined' && window.localStorage && this.active_symbols?.length > 0) {
                        localStorage.setItem('cached_active_symbols', JSON.stringify(this.active_symbols));
                    }
                } catch {}

                this.toggleRunButton(false);
                return this.active_symbols;
            } catch (error) {
                console.error('[APIBase] Failed to process active symbols:', error);
                this.active_symbols = active_symbols;
                return this.active_symbols;
            } finally {
                this.active_symbols_promise = null;
            }
        })();

        return this.active_symbols_promise;
    };

    private scheduleSingleRateLimitRetry = () => {
        // Do not run several retry timers in parallel; use one retry after the suggested delay
        if (this.rate_limit_retry_timer) return;

        const delay = this.rate_limit_backoff_delay;
        // Increase backoff delay exponentially for subsequent rate limits (max 30s)
        this.rate_limit_backoff_delay = Math.min(this.rate_limit_backoff_delay * 2, 30000);

        this.rate_limit_retry_timer = setTimeout(async () => {
            this.rate_limit_retry_timer = null;
            try {
                if (this.api && this.api.connection?.readyState === WebSocket.OPEN) {
                    const res = await this.api.send({ active_symbols: 'brief' });
                    if (res?.active_symbols && Array.isArray(res.active_symbols) && res.active_symbols.length > 0) {
                        this.rate_limit_backoff_delay = 3000; // Reset backoff on success
                        const enriched = await activeSymbolsProcessorService.processActiveSymbols(res.active_symbols);
                        this.active_symbols = enriched.enrichedSymbols;
                        this.pip_sizes = enriched.pipSizes;
                        this.has_active_symbols = true;
                        try {
                            localStorage.setItem('cached_active_symbols', JSON.stringify(this.active_symbols));
                        } catch {}
                    }
                }
            } catch {
                // Ignore background retry failure
            }
        }, delay);
    };

    toggleRunButton = (toggle: boolean) => {
        const run_button = document.querySelector('#db-animation__run-button');
        if (!run_button) return;
        if (!toggle) {
            (run_button as HTMLButtonElement).disabled = false;
        }
    };

    setIsRunning(toggle = false) {
        this.is_running = toggle;
    }

    pushSubscription(subscription: CurrentSubscription) {
        this.subscriptions.push(subscription);
    }

    clearSubscriptions() {
        this.subscriptions.forEach(s => s.unsubscribe());
        this.subscriptions = [];

        // Resetting timeout resolvers
        const global_timeouts = globalObserver.getState('global_timeouts') ?? [];

        global_timeouts.forEach((_: unknown, i: number) => {
            clearTimeout(i);
        });
    }
}

export const api_base = new APIBase();
if (typeof window !== 'undefined') {
    (window as any).api_base = api_base;
}
