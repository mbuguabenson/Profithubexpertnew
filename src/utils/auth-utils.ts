/**
 * Utility functions for authentication-related operations
 */

/**
 * Clears authentication data from local storage and reloads the page
 */
export const clearAuthData = () => {
    const keysToRemove = [
        'auth_info',
        'active_loginid',
        'active_account',
        'client.loginid',
        'client.currency',
        'client.accounts',
        'clientAccounts',
        'client.tokens',
        'config.tokens',
        'client_account_details',
        'accountsList',
        'account_type',
        'authToken',
        'active_token',
        'token',
        'token1',
        'deriv_api_token',
        'oidc_access_token',
        'callback_token',
        'bot_new_api_token',
        'legacy_dtrader_token',
        'deriv_accounts',
    ];

    for (let i = 1; i <= 10; i++) {
        keysToRemove.push(`acct${i}`, `token${i}`, `cur${i}`);
    }

    keysToRemove.forEach(key => {
        try {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        } catch {}
    });

    try {
        sessionStorage.clear();
    } catch {}
};

