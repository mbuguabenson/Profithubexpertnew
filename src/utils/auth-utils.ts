/**
 * Utility functions for authentication-related operations
 */

/**
 * Clears authentication data from local storage and reloads the page
 */
export const clearAuthData = () => {
    localStorage.removeItem('auth_info');
    sessionStorage.removeItem('auth_info');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('client.loginid');
    localStorage.removeItem('client.currency');
    localStorage.removeItem('authToken');
    localStorage.removeItem('active_token');
    localStorage.removeItem('deriv_api_token');
    localStorage.removeItem('oidc_access_token');
    localStorage.removeItem('account_type'); // Clear account type when clearing auth data
    localStorage.removeItem('accountsList');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('callback_token');
};
