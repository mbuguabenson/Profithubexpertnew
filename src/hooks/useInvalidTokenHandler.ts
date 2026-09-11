import { useEffect } from 'react';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { ErrorLogger } from '@/utils/error-logger';
import { reloadPage, replaceUrl } from '@/utils/navigation-utils';
import { STORAGE_KEYS } from '@/utils/token-bridge';

export type ErrorSource = 'bot' | 'dtrader' | 'legacy';

export const handleInvalidToken = (source: ErrorSource) => {
    if (source === 'dtrader' || source === 'legacy') {
        // Only clear legacy storage and flag iframe for re-auth
        localStorage.removeItem(STORAGE_KEYS.LEGACY_DTRADER_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.LEGACY_TOKEN1);
        window.dispatchEvent(new CustomEvent('dtrader_session_expired'));
    } else if (source === 'bot') {
        // Only clear bot storage
        localStorage.removeItem(STORAGE_KEYS.BOT_NEW_API_TOKEN);
        OAuthTokenExchangeService.clearAuthInfo();
        window.dispatchEvent(new CustomEvent('bot_session_expired'));
    }
    // DO NOT call window.location.reload() or clear all keys
};

/**
 * Hook to handle invalid token events by clearing auth data and redirecting to OAuth login
 *
 * This hook listens for 'InvalidToken' events emitted by the API base when
 * a token is invalid. When such an event is detected, it clears the invalid
 * authentication data and redirects to OAuth login to prevent infinite reload loops.
 *
 * @returns {{ unregisterHandler: () => void }} An object containing a function to unregister the event handler
 */
export const useInvalidTokenHandler = (): { unregisterHandler: () => void } => {
    const onInvalidToken = async (eventData?: any) => {
        try {
            const authInfo = OAuthTokenExchangeService.getAuthInfo({ allowExpiredWithRefresh: true });
            if (authInfo?.refresh_token) {
                const refreshed = await OAuthTokenExchangeService.refreshAccessToken(authInfo.refresh_token);
                if (refreshed.access_token) {
                    const { api_base } = await import('@/external/bot-skeleton');
                    await api_base.init(true);
                    return;
                }
            }

            const tokenContext = String(eventData?.context || eventData?.source || '');

            if (tokenContext === 'legacy' || tokenContext === 'dtrader') {
                handleInvalidToken('dtrader');
                return;
            }

            if (tokenContext === 'bot') {
                handleInvalidToken('bot');
                return;
            }

            // Clear invalid session data to prevent infinite reload loop
            localStorage.removeItem('auth_info');
            sessionStorage.removeItem('auth_info');
            localStorage.removeItem(STORAGE_KEYS.BOT_NEW_API_TOKEN);
            localStorage.removeItem(STORAGE_KEYS.LEGACY_DTRADER_TOKEN);
            localStorage.removeItem('active_loginid');
            localStorage.removeItem('client.loginid');
            localStorage.removeItem('client.currency');
            localStorage.removeItem('authToken');
            localStorage.removeItem('active_token');
            localStorage.removeItem('token1');
            localStorage.removeItem('deriv_api_token');
            localStorage.removeItem('oidc_access_token');
            localStorage.removeItem('accountsList');
            localStorage.removeItem('clientAccounts');
            localStorage.removeItem('account_type');

            // Clear sessionStorage completely to remove any stale auth data
            sessionStorage.clear();

            // Redirect to OAuth login instead of reload to get fresh authentication
            const { generateOAuthURL } = await import('@/components/shared');
            const oauthUrl = await generateOAuthURL();

            if (oauthUrl) {
                // Use replace to prevent back button from returning to invalid state
                replaceUrl(oauthUrl);
            } else {
                // Fallback: reload if OAuth URL generation fails
                ErrorLogger.error('InvalidToken', 'Failed to generate OAuth URL, falling back to reload');
                reloadPage();
            }
        } catch (error) {
            ErrorLogger.error('InvalidToken', 'Error handling invalid token', error);
            // Last resort: reload the page
            reloadPage();
        }
    };

    // Subscribe to the InvalidToken event
    useEffect(() => {
        globalObserver.register('InvalidToken', onInvalidToken);

        // Cleanup the subscription when the component unmounts
        return () => {
            globalObserver.unregister('InvalidToken', onInvalidToken);
        };
    }, []);

    // Return a function to unregister the handler manually if needed
    return {
        unregisterHandler: () => {
            globalObserver.unregister('InvalidToken', onInvalidToken);
        },
    };
};

export default useInvalidTokenHandler;
