// Account and device utility functions
// Moved from src/analytics/utils.ts during analytics cleanup

export const MAX_MOBILE_WIDTH = 926;
export const ACCOUNT_TYPE_KEY = 'account_type';

/**
 * Check if a loginid represents a demo account.
 * Demo accounts include prefixes: VR, VRT, VRTC, VRW, DEM, DOT.
 *
 * @param loginid - The account loginid to check
 * @returns true if demo account, false otherwise
 */
export const isDemoAccount = (loginid: string): boolean => {
    if (!loginid) return false;
    return (
        loginid.startsWith('VR') ||
        loginid.startsWith('VRT') ||
        loginid.startsWith('VRTC') ||
        loginid.startsWith('VRW') ||
        loginid.startsWith('DEM') ||
        loginid.startsWith('DOT')
    );
};

/**
 * Alias for isDemoAccount for backward compatibility
 */
export const isVirtualAccount = (loginid: string): boolean => {
    return isDemoAccount(loginid);
};

/**
 * Check if a loginid represents a real money account.
 * Real accounts include prefixes: CR, ROT, MF.
 *
 * @param loginid - The account loginid to check
 * @returns true if real account, false otherwise
 */
export const isRealAccount = (loginid: string): boolean => {
    if (!loginid) return false;
    return !isDemoAccount(loginid);
};

/**
 * Get account type based on loginid and localStorage
 * This is the centralized function for determining account type
 * Loginid is the primary source of truth when provided
 *
 * @param loginid - Optional loginid to check (if not provided, uses localStorage only)
 * @returns 'demo' or 'real' or 'public' if cannot determine
 */
export const getAccountType = (loginid?: string): string | undefined => {
    try {
        if (loginid) {
            return isDemoAccount(loginid) ? 'demo' : 'real';
        }
        return 'public';
    } catch (error) {
        return 'public';
    }
};

/**
 * Gets account_id with priority: URL parameter > localStorage > null
 * @returns account_id string or null
 */
export const getAccountId = (): string | null => {
    const urlParams = new URLSearchParams(window.location.search);
    const accountIdFromUrl = urlParams.get('account_id');
    const tokenFromUrl = urlParams.get('token');

    if (accountIdFromUrl) {
        return accountIdFromUrl;
    }

    if (tokenFromUrl) {
        return null;
    }

    try {
        const storedLoginId = localStorage.getItem('active_loginid');
        if (storedLoginId) return storedLoginId;
    } catch (e) {
        // noop
    }

    return null;
};

/**
 * Removes a specific parameter key from the browser URL search query without reloading
 */
export const removeUrlParameter = (paramKey: string): void => {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete(paramKey);
        window.history.replaceState({}, document.title, url.pathname + url.search);
    } catch (e) {
        // noop
    }
};

/**
 * Get device type based on window innerWidth
 */
export const getDeviceType = (): 'mobile' | 'desktop' => {
    if (typeof window === 'undefined') return 'desktop';
    return window.innerWidth <= MAX_MOBILE_WIDTH ? 'mobile' : 'desktop';
};
