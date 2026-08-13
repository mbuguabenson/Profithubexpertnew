import Cookies from 'js-cookie';
import { BOT_VERSION_CONFIG } from '@/constants/bot-version';

/**
 * Clears all localStorage data except for the bot_version
 */
const clearLocalStorage = (): void => {
    try {
        // Get the current bot_version before clearing
        const currentBotVersion = localStorage.getItem(BOT_VERSION_CONFIG.STORAGE_KEY);

        // Preserve auth data across version bumps to prevent unwanted logouts.
        // Only non-auth cache data (UI preferences, stale config, etc.) should be reset.
        const authKeysToPreserve = [
            'active_loginid',
            'accountsList',
            'clientAccounts',
            'auth_info',
            'authToken',
            'active_token',
            'deriv_api_token',
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
 * Clears all cookies for the current domain and parent domains
 */
const clearCookies = (): void => {
    try {
        // Get all cookies
        const cookies = document.cookie.split(';');

        // Clear each cookie for different domain variations
        const domains = [`.${document.domain.split('.').slice(-2).join('.')}`, `.${document.domain}`, document.domain];

        const paths = ['/', window.location.pathname.split('/', 2)[1] || ''];

        cookies.forEach(cookie => {
            const cookieName = cookie.split('=')[0].trim();
            if (cookieName) {
                // Remove cookie for different domain and path combinations
                domains.forEach(domain => {
                    paths.forEach(path => {
                        Cookies.remove(cookieName, { domain, path });
                    });
                });
                // Also try removing without domain/path
                Cookies.remove(cookieName);
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
 * @returns true if version matches or is not set, false if version is different
 */
const isVersionValid = (): boolean => {
    try {
        const currentVersion = localStorage.getItem(BOT_VERSION_CONFIG.STORAGE_KEY);

        // If no version is set, consider it invalid (needs clearing)
        if (currentVersion === null) {
            return false;
        }

        // Parse the version and check if it matches
        const versionNumber = parseInt(currentVersion, 10);
        return versionNumber === BOT_VERSION_CONFIG.REQUIRED_VERSION;
    } catch (error) {
        console.error('Error checking bot version:', error);
        return false;
    }
};

/**
 * Performs version check and clears storage if necessary
 * This function should be called at the very beginning of app initialization
 * before any other localStorage or cookie operations
 */
export const performVersionCheck = (): void => {
    console.log('Performing bot version check...');

    if (!isVersionValid()) {
        console.log('Bot version mismatch or not set. Clearing localStorage and cookies...');

        // Clear all storage
        clearLocalStorage();
        clearCookies();

        // Set the correct version to prevent infinite clearing
        setBotVersion();

        console.log('Storage cleared and bot version set to:', BOT_VERSION_CONFIG.REQUIRED_VERSION);
    } else {
        console.log('Bot version is valid:', BOT_VERSION_CONFIG.REQUIRED_VERSION);
    }
};
