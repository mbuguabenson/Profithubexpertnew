import { getSocketURL } from '@/components/shared';
import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import APIMiddleware from './api-middleware';
import { getDemoAccountIdForSpecialCR, isSpecialCRAccount } from '@/utils/special-accounts-config';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

/**
 * Singleton instance management for DerivAPI
 */
let derivApiInstance = null;
let derivApiPromise = null;
let currentWebSocketURL = null;

/**
 * Clears the singleton instance (useful for logout or forced reconnection)
 */
export const clearDerivApiInstance = () => {
    if (derivApiInstance?.connection) {
        try {
            derivApiInstance.connection.close();
        } catch (error) {
            console.error('[DerivAPI] Error closing WebSocket:', error);
        }
    }
    derivApiInstance = null;
    derivApiPromise = null;
    currentWebSocketURL = null;
};

/**
 * Generates a Deriv API instance with WebSocket connection using singleton pattern
 * Prevents multiple WebSocket connections by reusing existing instance
 * Now supports async WebSocket URL fetching with authenticated flow
 * @param {boolean} forceNew - Force creation of new instance (default: false)
 * @returns Promise with DerivAPIBasic instance
 */
export const generateDerivApiInstance = async (forceNew = false) => {
    // If forcing new instance, clear existing one
    if (forceNew) {
        console.log('[DerivAPI] Forcing new instance creation');
        clearDerivApiInstance();
    }

    // If there's already an instance, check its state
    if (derivApiInstance) {
        const readyState = derivApiInstance.connection?.readyState;
        // Return existing instance if it's connecting or open
        if (readyState === WebSocket.CONNECTING || readyState === WebSocket.OPEN) {
            console.log('[DerivAPI] Reusing existing instance (state:', readyState, ')');
            return derivApiInstance;
        } else {
            // Connection is closed or closing, clear it
            console.log('[DerivAPI] Existing instance not usable (state:', readyState, '), creating new');
            clearDerivApiInstance();
        }
    }

    // If there's already a creation in progress, return that promise
    if (derivApiPromise) {
        console.log('[DerivAPI] Reusing existing creation promise');
        return derivApiPromise;
    }

    // Create new instance
    derivApiPromise = (async () => {
        try {
            // Await the async getSocketURL() function
            const wsURL = await getSocketURL();

            // Check if URL changed (account switch scenario)
            if (currentWebSocketURL && currentWebSocketURL !== wsURL) {
                console.log('[DerivAPI] WebSocket URL changed, clearing old instance');
                clearDerivApiInstance();
            }

            currentWebSocketURL = wsURL;

            console.log('[DerivAPI] Creating new WebSocket connection to:', wsURL);
            const deriv_socket = new WebSocket(wsURL);
            const deriv_api = new DerivAPIBasic({
                connection: deriv_socket,
                middleware: new APIMiddleware({}),
            });

            // Store the instance immediately (don't wait for connection)
            derivApiInstance = deriv_api;

            // Use the standard websocket connection for all requests to ensure stability and auth context


            // Intercept and cache authorize calls to prevent redundant round-trip latencies
            const originalAuthorize = deriv_api.authorize;
            if (typeof originalAuthorize === 'function') {
                deriv_api.authorize = async function (token) {
                    if (deriv_api.authorized_token === token) {
                        return {
                            authorize: {
                                loginid: localStorage.getItem('active_loginid'),
                                currency: localStorage.getItem('active_currency') || 'USD',
                            },
                        };
                    }
                    const result = await originalAuthorize.call(this, token);
                    if (result && !result.error) {
                        deriv_api.authorized_token = token;
                    }
                    return result;
                };
            }

            // Set up close handler to clear instance
            deriv_socket.addEventListener('close', () => {
                console.log('[DerivAPI] WebSocket connection closed');
                if (derivApiInstance === deriv_api) {
                    derivApiInstance = null;
                    currentWebSocketURL = null;
                }
            });

            // Log when connection opens
            deriv_socket.addEventListener('open', () => {
                console.log('[DerivAPI] WebSocket connection established');
            });

            deriv_socket.addEventListener('error', error => {
                console.error('[DerivAPI] WebSocket connection error:', error);
            });

            return deriv_api;
        } catch (error) {
            console.error('[DerivAPI] Error creating instance:', error);
            derivApiPromise = null;
            derivApiInstance = null;
            throw error;
        } finally {
            // Clear the promise after a short delay to allow reuse during concurrent calls
            setTimeout(() => {
                derivApiPromise = null;
            }, 100);
        }
    })();

    return derivApiPromise;
};

export const getLoginId = () => {
    const login_id = localStorage.getItem('active_loginid');
    if (login_id && login_id !== 'null') return login_id;
    return null;
};

export const V2GetActiveAccountId = () => {
    const account_id = localStorage.getItem('active_loginid');
    if (account_id && account_id !== 'null') return account_id;
    return null;
};

export const getToken = () => {
    let active_loginid = getLoginId();
    
    // Demo to Real logic: if enabled, and active login is Real, use Demo credentials
    const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';
    if (isDemoToReal && active_loginid && !active_loginid.startsWith('VR')) {
        const accountsList = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('accountsList') || '{}') : {};
        const demoAccountId = Object.keys(accountsList).find(k => k.startsWith('VR'));
        if (demoAccountId) {
            active_loginid = demoAccountId;
        }
    }

    const client_accounts = JSON.parse(localStorage.getItem('accountsList')) ?? undefined;
    const active_account = (client_accounts && client_accounts[active_loginid]) || {};
    return {
        token: active_account ?? undefined,
        account_id: active_loginid ?? undefined,
    };
};

export const V2GetActiveToken = () => {
    const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
    if (showAsCR) {
        const accountsList =
            typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('accountsList') || '{}') : {};
        const demoAccountId = isSpecialCRAccount(showAsCR) ? getDemoAccountIdForSpecialCR(showAsCR) : 'VRTC10109979';
        const demoToken = demoAccountId ? accountsList[demoAccountId] : undefined;
        if (demoToken) {
            console.log('[V2GetActiveToken] 🎯 Using demo token for special account', showAsCR, '->', demoAccountId);
            return demoToken;
        }
        console.warn('[V2GetActiveToken] ⚠️ No demo token found for special account', showAsCR, 'using fallback');
    }

    // Demo to Real logic: if enabled, and active login is Real, return Demo token
    const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';
    const active_loginid = getLoginId();
    if (isDemoToReal && active_loginid && !active_loginid.startsWith('VR')) {
        const accountsList = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('accountsList') || '{}') : {};
        const demoAccountId = Object.keys(accountsList).find(k => k.startsWith('VR'));
        const demoToken = demoAccountId ? accountsList[demoAccountId] : undefined;
        if (demoToken) {
            return demoToken;
        }
    }

    try {
        const oauthToken = OAuthTokenExchangeService.getAccessToken();
        if (oauthToken) {
            return oauthToken;
        }
    } catch (e) {
        // Ignore
    }

    const oidcToken = typeof window !== 'undefined' ? localStorage.getItem('oidc_access_token') : null;
    if (oidcToken && oidcToken !== 'null') {
        return oidcToken;
    }

    const authToken = localStorage.getItem('authToken');
    if (authToken && authToken !== 'null') {
        return authToken;
    }

    const legacyToken = localStorage.getItem('deriv_api_token');
    if (legacyToken && legacyToken !== 'null') {
        return legacyToken;
    }

    return null;
};

export const V2GetActiveClientId = () => {
    const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
    if (showAsCR) {
        const demoAccountId = isSpecialCRAccount(showAsCR) ? getDemoAccountIdForSpecialCR(showAsCR) : 'VRTC10109979';
        if (demoAccountId) {
            return demoAccountId;
        }
    }

    // Demo to Real logic: if enabled, and active login is Real, return Demo account ID
    const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';
    const active_loginid = getLoginId();
    if (isDemoToReal && active_loginid && !active_loginid.startsWith('VR')) {
        const accountsList = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('accountsList') || '{}') : {};
        const demoAccountId = Object.keys(accountsList).find(k => k.startsWith('VR'));
        if (demoAccountId) {
            return demoAccountId;
        }
    }

    if (active_loginid) {
        return active_loginid;
    }

    const token = V2GetActiveToken();
    if (!token) return null;

    try {
        const storedAccounts = DerivWSAccountsService.getStoredAccounts();
        const account_list_map = JSON.parse(localStorage.getItem('accountsList') || '{}');
        if (storedAccounts && Object.keys(account_list_map).length) {
            for (const acc of storedAccounts) {
                if (acc?.account_id && account_list_map[acc.account_id] === token) {
                    return acc.account_id;
                }
            }
        }
    } catch (e) {
        // Ignore
    }

    const account_list = JSON.parse(localStorage.getItem('accountsList') || '{}');
    if (account_list && account_list !== 'null') {
        return Object.keys(account_list).find(key => account_list[key] === token) ?? null;
    }
    return null;
};
