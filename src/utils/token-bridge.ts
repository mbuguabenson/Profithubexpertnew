/**
 * token-bridge.ts
 *
 * Shared utility for reading Deriv login tokens stored by the OAuth flow.
 * These tokens are written to localStorage under 'accountsList' as a map
 * of { [loginId]: token }.
 */

import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

/** Returns the raw accountsList map from all localStorage/sessionStorage sources */
export const getAccountsList = (): Record<string, string> => {
    const map: Record<string, string> = {};

    try {
        // 1. Check accountsList
        const rawAccountsList = localStorage.getItem('accountsList');
        if (rawAccountsList) {
            const parsed = JSON.parse(rawAccountsList);
            if (parsed && typeof parsed === 'object') {
                for (const k in parsed) {
                    if (parsed[k] && !isInvalidBearerToken(parsed[k])) {
                        map[k] = parsed[k];
                    }
                }
            }
        }

        // 2. Check client.accounts / clientAccounts
        const rawClientAccounts = localStorage.getItem('client.accounts') || localStorage.getItem('clientAccounts');
        if (rawClientAccounts) {
            const parsed = JSON.parse(rawClientAccounts);
            if (parsed && typeof parsed === 'object') {
                for (const k in parsed) {
                    const token = parsed[k]?.token || (typeof parsed[k] === 'string' ? parsed[k] : '');
                    if (token && !isInvalidBearerToken(token)) {
                        map[k] = token;
                    }
                }
            }
        }

        // 3. Check deriv_accounts in session/local storage
        const rawDerivAccounts = sessionStorage.getItem('deriv_accounts') || localStorage.getItem('deriv_accounts');
        if (rawDerivAccounts) {
            const parsed = JSON.parse(rawDerivAccounts);
            if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                    const id = item?.account_id || item?.loginid;
                    const token = item?.token;
                    if (id && token && !isInvalidBearerToken(token)) {
                        map[id] = token;
                    }
                });
            }
        }

        // 4. Direct token fallback if mapped with active_loginid
        const activeId = localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid');
        const directToken =
            localStorage.getItem('token') ||
            localStorage.getItem('active_token') ||
            localStorage.getItem('authToken') ||
            localStorage.getItem('token1') ||
            localStorage.getItem('deriv_api_token');
        if (activeId && directToken && !isInvalidBearerToken(directToken) && !map[activeId]) {
            map[activeId] = directToken;
        }
    } catch {}

    return map;
};

/** Returns the active loginid (e.g. "CR123456" or "VRTC1234") */
export const getActiveLoginId = (): string =>
    localStorage.getItem('active_loginid') ||
    localStorage.getItem('client.loginid') ||
    '';

const isInvalidBearerToken = (token: string | null | undefined): boolean =>
    !token || token === 'null' || token === 'undefined' || token === 'a1-guest';

/** Synchronously checks if a valid token is available in storage or URL */
export const getActiveToken = (): string | null => {
    const list = getAccountsList();
    const id = getActiveLoginId();
    if (id && list[id] && !isInvalidBearerToken(list[id])) {
        return list[id];
    }
    for (const key in list) {
        if (!isInvalidBearerToken(list[key])) {
            return list[key];
        }
    }

    const storedToken =
        localStorage.getItem('token') ||
        localStorage.getItem('active_token') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('token1') ||
        localStorage.getItem('deriv_api_token') ||
        sessionStorage.getItem('token') ||
        sessionStorage.getItem('active_token') ||
        sessionStorage.getItem('token1');

    if (!isInvalidBearerToken(storedToken)) {
        return storedToken!;
    }

    const oauthToken = OAuthTokenExchangeService.getAccessToken();
    if (!isInvalidBearerToken(oauthToken)) {
        return oauthToken!;
    }

    return null;
};

/**
 * Robustly resolves a valid Deriv WebSocket authorization token for an account.
 * Fast-paths synchronous storage checks so postMessage handshakes are never delayed.
 */
export const resolveValidDerivWSToken = async (_loginid?: string): Promise<string> => {
    // 1. Fast synchronous check from storage / URL
    const syncToken = getActiveToken();
    if (syncToken) {
        return syncToken;
    }

    // 2. Check URL query parameters (e.g., ?token1=a1-xxx or ?token=a1-xxx)
    try {
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const tokenFromUrl = urlParams.get('token1') || urlParams.get('token');
            if (tokenFromUrl && !isInvalidBearerToken(tokenFromUrl)) {
                return tokenFromUrl;
            }
        }
    } catch (e) {
        // noop
    }

    // 3. PKCE OAuth2 Access Token fallback
    const oauthToken = OAuthTokenExchangeService.getAccessToken();
    if (!isInvalidBearerToken(oauthToken)) {
        return oauthToken!;
    }

    // 4. Fetch OTP WebSocket URL with strict 800ms timeout to avoid blocking handshakes
    try {
        const authInfo = OAuthTokenExchangeService.getAuthInfo();
        if (authInfo?.access_token) {
            const fetchPromise = DerivWSAccountsService.getAuthenticatedWebSocketURL(authInfo.access_token);
            const timeoutPromise = new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('OTP fetch timeout')), 800)
            );
            const wsUrl = await Promise.race([fetchPromise, timeoutPromise]);
            if (wsUrl) {
                const parsedUrl = new URL(wsUrl);
                const otpToken = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('otp');
                if (otpToken) {
                    return otpToken;
                }
            }
        }
    } catch (e) {
        // Fail fast if OTP backend is unreachable
    }

    return '';
};

/** Returns true if the user is logged in (has any accounts) */
export const isLoggedIn = (): boolean =>
    Object.keys(getAccountsList()).length > 0;

/** Returns all tokens from the logged-in session */
export const getAllSessionTokens = (): string[] =>
    Object.values(getAccountsList()).filter(Boolean);

/** Sanitize accountsList in-place */
export const sanitizeAccountsList = (): void => {
    try {
        const raw = getAccountsList();
        const filtered = Object.fromEntries(
            Object.entries(raw).filter(([, v]) => v && v !== 'null' && v !== 'undefined')
        );
        if (JSON.stringify(filtered) !== JSON.stringify(raw)) {
            localStorage.setItem('accountsList', JSON.stringify(filtered));
        }
    } catch (e) {
        // noop
    }
};

/** Returns the first real account token */
export const getRealAccountToken = (): string | null => {
    const list = getAccountsList();
    const realKey = Object.keys(list).find(k => !k.startsWith('VR') && !k.startsWith('VRT') && !k.startsWith('DOT'));
    return realKey ? list[realKey] : null;
};

export const getRealAccount = (): { loginId: string; token: string } | null => {
    const list = getAccountsList();
    const realKey = Object.keys(list).find(k => !k.startsWith('VR') && !k.startsWith('VRT') && !k.startsWith('DOT'));
    if (!realKey) return null;
    return { loginId: realKey, token: list[realKey] };
};

export const getDemoAccount = (): { loginId: string; token: string } | null => {
    const list = getAccountsList();
    const demoKey = Object.keys(list).find(k => k.startsWith('VR') || k.startsWith('VRT') || k.startsWith('DOT'));
    if (!demoKey) return null;
    return { loginId: demoKey, token: list[demoKey] };
};

export const formatLoginDisplay = (): string => {
    const active = getActiveLoginId();
    const list = getAccountsList();
    if (!active) return 'Not logged in';

    if (active.startsWith('VR') || active.startsWith('DOT')) {
        const crKey = Object.keys(list).find(k => !k.startsWith('VR') && !k.startsWith('DOT'));
        return crKey ? `Demo (${crKey})` : `Demo: ${active}`;
    }
    return active;
};

export const truncateToken = (token: string, visibleChars = 6): string =>
    token.length > visibleChars * 2
        ? `${token.slice(0, visibleChars)}••••${token.slice(-4)}`
        : token;
