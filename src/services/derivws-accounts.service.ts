import { isProduction } from '@/components/shared';
import { getAppId } from '@/components/shared/utils/config/config';
import brandConfig from '../../brand.config.json';

/**
 * Account information from derivatives/accounts endpoint
 */
export interface DerivAccount {
    account_id: string;
    balance: string;
    currency: string;
    group: string;
    status: string;
    account_type: 'demo' | 'real';
}

/**
 * Response from derivatives/accounts endpoint
 */
interface AccountsResponse {
    data: DerivAccount[];
}

/**
 * OTP response data (nested JSON string)
 */
interface OTPResponseData {
    url: string;
}

/**
 * Response from options/accounts/{accountId}/otp endpoint
 */
interface OTPResponse {
    data: OTPResponseData;
    // JSON string containing OTPResponseData
}

/**
 * Service for handling DerivWS account operations and WebSocket URL retrieval
 *
 * This service manages:
 * - Fetching account list from derivatives/accounts endpoint
 * - Storing accounts in sessionStorage
 * - Fetching OTP and WebSocket URL for specific accounts
 * - Managing default account selection
 * - Singleton pattern to prevent duplicate API calls
 * - Promise caching to handle concurrent requests
 */
export class DerivWSAccountsService {
    // Singleton instance for promise caching
    private static accountsFetchPromise: Promise<DerivAccount[]> | null = null;
    private static otpFetchPromises: Map<string, Promise<string>> = new Map();

    /**
     * Gets the DerivWS base URL based on environment
     * @returns DerivWS base URL (e.g., "https://api.derivws.com/trading/v1/")
     */
    private static getDerivWSBaseURL(): string {
        const environment = isProduction() ? 'production' : 'staging';
        return brandConfig.platform.derivws.url[environment];
    }

    private static isBrowser(): boolean {
        return typeof window !== 'undefined' && typeof window.document !== 'undefined';
    }

    private static getOTPProxyEndpoint(accountId: string): string {
        return `/api/deriv-otp/${encodeURIComponent(accountId)}`;
    }

    private static getAccountsProxyEndpoint(): string {
        return '/api/deriv-accounts';
    }

    private static async fetchWithTimeout<T>(url: string, options: RequestInit, timeoutMs = 10000): Promise<T> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Request failed: ${response.status} ${response.statusText}`);
            }

            return (await response.json()) as T;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private static async fetchTextWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Request failed: ${response.status} ${response.statusText}`);
            }

            return await response.text();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Clears all cached promises (useful for testing or forced refresh)
     */
    static clearCache(): void {
        this.accountsFetchPromise = null;
        this.otpFetchPromises.clear();
    }

    /**
     * Stores accounts list in sessionStorage
     * @param accounts Array of DerivAccount objects
     */
    static storeAccounts(accounts: DerivAccount[]): void {
        sessionStorage.setItem('deriv_accounts', JSON.stringify(accounts));
    }

    /**
     * Retrieves accounts list from sessionStorage
     * @returns Array of DerivAccount objects or null if not found
     */
    static getStoredAccounts(): DerivAccount[] | null {
        try {
            const accountsStr = sessionStorage.getItem('deriv_accounts');
            if (!accountsStr) {
                return null;
            }
            return JSON.parse(accountsStr) as DerivAccount[];
        } catch (error) {
            console.error('[DerivWS] Error parsing stored accounts:', error);
            return null;
        }
    }

    /**
     * Gets the default account (first account from the list)
     * @returns DerivAccount object or null if no accounts available
     */
    static getDefaultAccount(): DerivAccount | null {
        const accounts = this.getStoredAccounts();
        if (!accounts || accounts.length === 0) {
            return null;
        }
        return accounts[0];
    }

    /**
     * Clears stored accounts from sessionStorage
     */
    static clearStoredAccounts(): void {
        sessionStorage.removeItem('deriv_accounts');
    }

    /**
     * Fetches accounts list from derivatives/accounts endpoint with singleton pattern
     * Prevents duplicate API calls by caching the promise
     * @param accessToken Bearer token from OAuth authentication
     * @returns Promise with array of DerivAccount objects
     */
    static async fetchAccountsList(accessToken: string): Promise<DerivAccount[]> {
        // If there's already a fetch in progress, return that promise
        if (this.accountsFetchPromise) {
            return this.accountsFetchPromise;
        }

        // Create new fetch promise and cache it
        this.accountsFetchPromise = (async () => {
            try {
                const appId = getAppId() || '121856';
                try { console.debug('[DerivWS] fetchAccountsList called', { appId, token_prefix: String(accessToken).slice(0, 8) }); } catch (e) {}

                const fetchAccounts = async (url: string): Promise<AccountsResponse> => {
                    return this.fetchWithTimeout<AccountsResponse>(url, {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Deriv-App-ID': appId,
                        },
                    });
                };

                let data: AccountsResponse;
                const proxyEndpoint = this.getAccountsProxyEndpoint();
                try {
                    data = await fetchAccounts(proxyEndpoint);
                } catch (proxyError) {
                    const isNetworkFailure =
                        proxyError instanceof TypeError ||
                        proxyError?.name === 'TypeError' ||
                        /NetworkError|Failed to fetch/i.test(String(proxyError)) ||
                        proxyError?.name === 'AbortError';

                    if (this.isBrowser() && isNetworkFailure) {
                        const baseURL = this.getDerivWSBaseURL();
                        const optionsDir = brandConfig.platform.derivws.directories.options;
                        const endpoint = `${baseURL}${optionsDir}accounts`;
                        console.warn('[DerivWS] Proxy accounts fetch failed; retrying direct Deriv endpoint', proxyError);
                        data = await fetchAccounts(endpoint);
                    } else {
                        throw proxyError;
                    }
                }

                // Extract accounts array from nested data structure
                const accounts = data?.data || [];

                if (accounts.length === 0) {
                    console.warn('[DerivWS] No accounts found in response');
                }

                // Store accounts in sessionStorage for future use
                this.storeAccounts(accounts);
                try { console.debug('[DerivWS] fetched accounts count', { count: accounts.length }); } catch (e) {}
                return accounts;
            } catch (error) {
                console.error('[DerivWS] Error fetching accounts:', error);
                // Clear the cached promise on error so retry is possible
                this.accountsFetchPromise = null;
                throw error;
            } finally {
                // Clear the promise after completion (success or failure)
                // This allows fresh fetches on subsequent calls
                setTimeout(() => {
                    this.accountsFetchPromise = null;
                }, 100);
            }
        })();

        return this.accountsFetchPromise;
    }

    /**
     * Fetches OTP and WebSocket URL for a specific account with singleton pattern
     * Prevents duplicate OTP calls for the same account by caching the promise
     * @param accessToken Bearer token from OAuth authentication
     * @param accountId Account ID to get OTP for
     * @returns Promise with WebSocket URL
     */
    static async fetchOTPWebSocketURL(accessToken: string, accountId: string): Promise<string> {
        // Create a unique key for this account's OTP request
        const cacheKey = `${accountId}`;

        // If there's already a fetch in progress for this account, return that promise
        if (this.otpFetchPromises.has(cacheKey)) {
            return this.otpFetchPromises.get(cacheKey)!;
        }

        // Create new fetch promise and cache it
        const otpPromise = (async () => {
            const controller = new AbortController();
            // Abort after 10 seconds to prevent indefinite blocking
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            try {
                const baseURL = this.getDerivWSBaseURL();
                const optionsDir = brandConfig.platform.derivws.directories.options;
                const endpoint = `${baseURL}${optionsDir}accounts/${accountId}/otp`;
                const appId = getAppId() || '121856';
                try { console.debug('[DerivWS] fetchOTPWebSocketURL', { endpoint, accountId, appId, token_prefix: String(accessToken).slice(0, 8) }); } catch (e) {}

                const fetchOTP = async (url: string): Promise<string> => {
                    const otpResponse = await this.fetchWithTimeout<OTPResponse>(url, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Deriv-App-ID': appId,
                        },
                    });

                    const websocketURL = otpResponse.data.url;
                    try { console.debug('[DerivWS] otp response received', { websocketURLExists: !!websocketURL }); } catch (e) {}
                    if (!websocketURL) {
                        throw new Error('WebSocket URL not found in OTP response');
                    }
                    return websocketURL;
                };

                const proxyEndpoint = this.getOTPProxyEndpoint(accountId);
                try {
                    return await fetchOTP(proxyEndpoint);
                } catch (proxyError) {
                    const isNetworkFailure =
                        proxyError instanceof TypeError ||
                        proxyError?.name === 'TypeError' ||
                        /NetworkError|Failed to fetch/i.test(String(proxyError)) ||
                        proxyError?.name === 'AbortError';

                    if (this.isBrowser() && isNetworkFailure) {
                        const baseURL = this.getDerivWSBaseURL();
                        const optionsDir = brandConfig.platform.derivws.directories.options;
                        const endpoint = `${baseURL}${optionsDir}accounts/${encodeURIComponent(accountId)}/otp`;
                        console.warn('[DerivWS] Proxy OTP fetch failed; retrying direct Deriv endpoint', proxyError);
                        return await fetchOTP(endpoint);
                    }

                    throw proxyError;
                }
            } catch (error) {
                console.error('[DerivWS] Error fetching OTP:', error);
                // Clear the cached promise on error so retry is possible
                this.otpFetchPromises.delete(cacheKey);
                throw error;
            } finally {
                clearTimeout(timeoutId);
                // Clear the promise after completion (success or failure)
                // This allows fresh OTP fetches on subsequent calls
                setTimeout(() => {
                    this.otpFetchPromises.delete(cacheKey);
                }, 100);
            }
        })();

        this.otpFetchPromises.set(cacheKey, otpPromise);
        return otpPromise;
    }

    /**
     * Complete flow to get authenticated WebSocket URL with optimized caching
     * 1. Check if accounts are already in sessionStorage (skip fetch on refresh)
     * 2. If not in storage, fetch accounts list
     * 3. Store accounts in sessionStorage
     * 4. Get default account (first from list)
     * 5. Fetch OTP and WebSocket URL for that account (always fresh OTP)
     *
     * @param accessToken Bearer token from OAuth authentication
     * @returns Promise with WebSocket URL
     */
    static async getAuthenticatedWebSocketURL(accessToken: string): Promise<string> {
        try {
            let accounts: DerivAccount[] | null = null;

            // Step 1: Check if accounts are already stored (optimization for refresh)
            const storedAccounts = this.getStoredAccounts();
            if (storedAccounts && storedAccounts.length > 0) {
                accounts = storedAccounts;
            } else {
                // Step 2: Fetch accounts list if not in storage
                accounts = await this.fetchAccountsList(accessToken);

                if (!accounts || accounts.length === 0) {
                    throw new Error('No accounts available');
                }
            }

            // Step 3: Resolve which account to connect as.
            // On an account switch the caller has already written the new loginid to
            // localStorage before triggering a WebSocket regeneration, so we honour
            // that selection here instead of always falling back to accounts[0].
            let activeLoginId = localStorage.getItem('active_loginid');
            const targetAccount =
                (activeLoginId && accounts.find(a => a.account_id === activeLoginId)) || accounts[0];

            if (!activeLoginId && targetAccount?.account_id) {
                localStorage.setItem('active_loginid', targetAccount.account_id);
                localStorage.setItem('account_type', targetAccount.account_type === 'demo' ? 'demo' : 'real');
                activeLoginId = targetAccount.account_id;
            }

            // Step 4: Fetch OTP and WebSocket URL for the resolved account (always fresh OTP)
            const websocketURL = await this.fetchOTPWebSocketURL(accessToken, targetAccount.account_id);
            return websocketURL;
        } catch (error) {
            console.error('[DerivWS] Error in authenticated WebSocket URL flow:', error);
            throw error;
        }
    }
}
