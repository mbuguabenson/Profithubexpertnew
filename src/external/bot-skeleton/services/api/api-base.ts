/* [AI] - Analytics removed - utility functions moved to @/utils/account-helpers */
import { getAccountId, getAccountType, isDemoAccount, removeUrlParameter } from '@/utils/account-helpers';
/* [/AI] */
import CommonStore from '@/stores/common-store';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { isProduction, getLegacyServerURL } from '@/components/shared/utils/config/config';
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

type CurrentSubscription = {
    id: string;
    unsubscribe: () => void;
};

type SubscriptionPromise = Promise<{
    subscription: CurrentSubscription;
}>;

type TApiBaseApi = any;

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
    active_symbols_promise: Promise<any[] | undefined> | null = null;
    common_store: CommonStore | undefined;
    reconnection_attempts: number = 0;

    // Constants for timeouts - extracted magic numbers for better maintainability
    private readonly ACTIVE_SYMBOLS_TIMEOUT_MS = 4000; // 4 seconds before fallback
    private readonly ENRICHMENT_TIMEOUT_MS = 25000; // 25 seconds
    private readonly MAX_RECONNECTION_ATTEMPTS = 15; // Maximum number of reconnection attempts before giving up

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

    async init(force_create_connection = false) {
        if (this.api) {
            this.unsubscribeAllSubscriptions();
        }

        // Reset reconnection attempts counter on successful connection initialization
        if (!force_create_connection) {
            this.reconnection_attempts = 0;
        }

        if (!this.api || this.api?.connection.readyState !== 1 || force_create_connection) {
            if (this.api?.connection) {
                setConnectionStatus(CONNECTION_STATUS.CLOSED);
                this.api.disconnect();
                this.api.connection.removeEventListener('open', this.onsocketopen.bind(this));
                this.api.connection.removeEventListener('close', this.onsocketclose.bind(this));
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

        chart_api.init();
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

    getActiveSymbols = async () => {
        let active_symbols: any[] = [];

        // Wrap the entire fetch in a generous overall timeout so the promise never hangs forever.
        // Individual sub-steps also have their own timeouts; this is a safety net.
        const OVERALL_TIMEOUT_MS = 35000;

        const fetchSymbols = async (): Promise<any[]> => {
            // 1. Try the main WebSocket first if it is already open (fastest path, <100ms)
            if (this.api && this.api.connection?.readyState === 1) {
                try {
                    const timeout = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Active symbols timeout (main WS)')), this.ACTIVE_SYMBOLS_TIMEOUT_MS)
                    );
                    // Pass null instead of `this` so the bot's is_running flag does NOT kill the
                    // retry loop. Symbol fetches are infrastructure calls, not trade calls.
                    const fetchPromise = doUntilDone(() => this.api?.send({ active_symbols: 'brief' }), [], null);
                    const apiResult = await Promise.race([fetchPromise, timeout]);
                    const { active_symbols: ws_symbols = [], error = {} } = apiResult as any;
                    if (!error || Object.keys(error).length === 0) {
                        return ws_symbols;
                    }
                } catch (err) {
                    console.warn('[APIBase] Main WS active symbols fetch failed, trying fallback:', err);
                }
            }

            // 2. Fallback: standard Deriv public WS endpoint
            try {
                const publicSymbols = await new Promise<any[]>((resolve, reject) => {
                    // Use the reliable standard Deriv API WebSocket endpoint with domain app_id
                    const wsURL = getLegacyServerURL();

                    const ws = new WebSocket(wsURL);
                    let settled = false;

                    const cleanup = () => {
                        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                            ws.close();
                        }
                    };

                    const safeResolve = (val: any[]) => {
                        if (!settled) { settled = true; cleanup(); resolve(val); }
                    };
                    const safeReject = (err: any) => {
                        if (!settled) { settled = true; cleanup(); reject(err); }
                    };

                    const timer = setTimeout(() => safeReject(new Error('Public WS timeout')), 12000);

                    ws.onopen = () => {
                        ws.send(JSON.stringify({ active_symbols: 'brief', req_id: 1 }));
                    };
                    ws.onmessage = event => {
                        try {
                            const response = JSON.parse(event.data);
                            if (response.active_symbols && response.active_symbols.length > 0) {
                                clearTimeout(timer);
                                safeResolve(response.active_symbols);
                            } else if (response.error) {
                                clearTimeout(timer);
                                safeReject(new Error(response.error.message || 'API error'));
                            }
                        } catch (e) {
                            clearTimeout(timer);
                            safeReject(e);
                        }
                    };
                    ws.onerror = () => { clearTimeout(timer); safeReject(new Error('Public WS error')); };
                    ws.onclose = () => { if (!settled) { clearTimeout(timer); safeReject(new Error('Public WS closed prematurely')); } };
                });

                if (publicSymbols.length > 0) return publicSymbols;
            } catch (e) {
                console.warn('[APIBase] Public WS fallback failed, trying last-resort method:', e);
            }

            // 3. Last resort: wait for the main WS to open if it's still connecting
            if (!this.api) {
                throw new Error('API connection not available for fetching active symbols');
            }

            const lastResortTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Active symbols timeout (last resort)')), this.ACTIVE_SYMBOLS_TIMEOUT_MS)
            );
            // Again, pass null so bot's is_running=false doesn't immediately reject.
            const lastResortFetch = doUntilDone(() => this.api?.send({ active_symbols: 'brief' }), [], null);
            const apiResult = await Promise.race([lastResortFetch, lastResortTimeout]);
            const { active_symbols: ws_symbols = [], error = {} } = apiResult as any;
            if (error && Object.keys(error).length > 0) {
                throw new Error(`Active symbols API error: ${error.message || 'Unknown error'}`);
            }
            return ws_symbols;
        };

        try {
            const overallTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('getActiveSymbols overall timeout')), OVERALL_TIMEOUT_MS)
            );
            active_symbols = await Promise.race([fetchSymbols(), overallTimeout]);
        } catch (err) {
            // Reset the promise so the next caller gets a fresh attempt instead of awaiting
            // a hung/rejected promise forever.
            this.active_symbols_promise = null;
            console.error('[APIBase] getActiveSymbols failed:', err);
            throw err;
        }

        if (!active_symbols || !active_symbols.length) {
            this.active_symbols_promise = null;
            throw new Error('No active symbols received from API');
        }

        // Ensure 1s volatility indices (15, 30, 90) are always present
        const required_1s_symbols = [
            {
                symbol: '1HZ15V',
                underlying_symbol: '1HZ15V',
                display_name: 'Volatility 15 (1s) Index',
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
            },
            {
                symbol: '1HZ30V',
                underlying_symbol: '1HZ30V',
                display_name: 'Volatility 30 (1s) Index',
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
            },
            {
                symbol: '1HZ90V',
                underlying_symbol: '1HZ90V',
                display_name: 'Volatility 90 (1s) Index',
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
            },
        ];

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
                console.warn('Symbol enrichment failed, using raw symbols:', enrichmentError);
                // Fallback to raw symbols if enrichment fails
                this.active_symbols = active_symbols;
                this.pip_sizes = {};
            }

            this.toggleRunButton(false);
            return this.active_symbols;
        } catch (error) {
            console.error('Failed to process active symbols:', error);
            throw error;
        }
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
