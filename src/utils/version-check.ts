import Cookies from 'js-cookie';
import { BOT_VERSION_CONFIG } from '@/constants/bot-version';
import { getCookieDomain } from '@/utils/cookie-domain';

/**
 * Clears all localStorage data except for the bot_version
 */
const clearLocalStorage = (): void => {
    try {
        // Get the current bot_version before clearing
        const currentBotVersion = localStorage.getItem(BOT_VERSION_CONFIG.STORAGE_KEY);

        // Preserve auth data across version bumps to prevent unwanted logouts.
        const authKeysToPreserve = [
            'active_loginid',
            'accountsList',
            'clientAccounts',
            'auth_info',
            'authToken',
            'active_token',
            'deriv_api_token',
            'token1',
            'client_account_details',
            'account_type',
        ];
        const preserved: Record<string, string | null> = {};
        authKeysToPreserve.forEach(key => {
            preserved[key] = localStorage.getItem(key);
        });

        // Clear all localStorage
        localStorage.clear();

        // Restore the bot_version if it existed
        if (currentBotVersion) {
            localStorage.setItem(BOT_VERSION_CONFIG.STORAGE_KEY, currentBotVersion);
        }

        // Restore preserved auth data
        Object.entries(preserved).forEach(([key, value]) => {
            if (value !== null) {
                localStorage.setItem(key, value);
            }
        });
    } catch (error) {
        console.error('Error clearing localStorage:', error);
    }
};

/**
 * Clears application-specific cookies safely without triggering cross-domain warnings
 */
const clearCookies = (): void => {
    try {
        const cookies = document.cookie.split(';');
        const cookieDomain = getCookieDomain();

        cookies.forEach(cookie => {
            const cookieName = cookie.split('=')[0].trim();
            // Do not attempt to touch third-party analytics or CDN cookies
            if (
                cookieName &&
                !cookieName.startsWith('_ga') &&
                !cookieName.startsWith('_gc') &&
                !cookieName.startsWith('_gid') &&
                !cookieName.startsWith('__cf')
            ) {
                try {
                    if (cookieDomain) {
                        Cookies.remove(cookieName, { domain: cookieDomain, path: '/' });
                    }
                    Cookies.remove(cookieName, { path: '/' });
                    Cookies.remove(cookieName);
                } catch {}
            }
        });
    } catch (error) {
        console.error('Error clearing cookies:', error);
    }
};

/**
 * Sets the bot version in localStorage to prevent infinite clearing
 */
const setBotVersion = (): void => {
    try {
        localStorage.setItem(BOT_VERSION_CONFIG.STORAGE_KEY, BOT_VERSION_CONFIG.REQUIRED_VERSION.toString());
    } catch (error) {
        console.error('Error setting bot version:', error);
    }
};

/**
 * Checks if the current bot version matches the required version
 */
const isVersionValid = (): boolean => {
    try {
        const currentVersion = localStorage.getItem(BOT_VERSION_CONFIG.STORAGE_KEY);

        // On first visit or initial load, initialize version without wiping
        if (currentVersion === null) {
            setBotVersion();
            return true;
        }

        const versionNumber = parseInt(currentVersion, 10);
        return versionNumber === BOT_VERSION_CONFIG.REQUIRED_VERSION;
    } catch (error) {
        console.error('Error checking bot version:', error);
        return true;
    }
};

/**
 * Performs version check and clears stale cache if necessary
 */
export const performVersionCheck = (): void => {
    if (!isVersionValid()) {
        console.log('Bot version mismatch. Clearing stale cache...');
        clearLocalStorage();
        clearCookies();
        setBotVersion();
    }
};
