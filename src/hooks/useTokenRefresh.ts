import { useEffect, useRef } from 'react';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { ErrorLogger } from '@/utils/error-logger';

/**
 * Proactively refreshes the OAuth access token before it expires.
 *
 * The token's lifetime (default 3600s / 1 hour) is read from `auth_info`
 * in localStorage. A timer is set to refresh the token at 80% of its
 * lifetime so the user is never logged out due to silent expiry.
 *
 * If the refresh fails the hook retries once after 30 seconds, then gives up
 * and logs the failure — it intentionally does NOT clear auth data because
 * the existing (expired) token may still allow the backend to issue a new one
 * via refresh_token grant.
 */
export const useTokenRefresh = () => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    };

    const scheduleRefresh = () => {
        clearTimers();

        const authInfo = OAuthTokenExchangeService.getAuthInfo();
        if (!authInfo?.expires_at || !authInfo?.refresh_token) {
            // No token or no refresh_token — nothing to schedule
            return;
        }

        const now = Date.now();
        const expiresAt = authInfo.expires_at;
        const lifetime = (authInfo.expires_in || 3600) * 1000; // ms

        // Refresh at 80% of lifetime, but at least 60 seconds before expiry
        const refreshAt = expiresAt - Math.max(lifetime * 0.2, 60_000);
        const delay = Math.max(refreshAt - now, 5_000); // at least 5s from now

        timerRef.current = setTimeout(async () => {
            try {
                const currentAuth = OAuthTokenExchangeService.getAuthInfo({ allowExpiredWithRefresh: true });
                if (!currentAuth?.refresh_token) return;

                const result = await OAuthTokenExchangeService.refreshAccessToken(currentAuth.refresh_token);

                if (result.access_token) {
                    // Success — schedule next refresh
                    scheduleRefresh();
                } else if (result.error) {
                    ErrorLogger.warn('TokenRefresh', `Refresh failed: ${result.error}, retrying in 30s`);
                    // Retry once after 30s
                    retryTimerRef.current = setTimeout(async () => {
                        try {
                            const retryAuth = OAuthTokenExchangeService.getAuthInfo({ allowExpiredWithRefresh: true });
                            if (!retryAuth?.refresh_token) return;
                            const retryResult = await OAuthTokenExchangeService.refreshAccessToken(
                                retryAuth.refresh_token
                            );
                            if (retryResult.access_token) {
                                scheduleRefresh();
                            } else {
                                ErrorLogger.error(
                                    'TokenRefresh',
                                    'Retry also failed, user may be logged out on next API call'
                                );
                            }
                        } catch (retryErr) {
                            ErrorLogger.error('TokenRefresh', 'Retry refresh threw', retryErr);
                        }
                    }, 30_000);
                }
            } catch (err) {
                ErrorLogger.error('TokenRefresh', 'Proactive refresh threw', err);
            }
        }, delay);
    };

    useEffect(() => {
        // Schedule on mount
        scheduleRefresh();

        // Also re-schedule when localStorage changes (e.g., after a manual login/logout in another tab)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'auth_info') {
                scheduleRefresh();
            }
        };

        window.addEventListener('storage', handleStorageChange);

        return () => {
            clearTimers();
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);
};

export default useTokenRefresh;
