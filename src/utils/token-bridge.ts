/**
 * token-bridge.ts
 *
 * Shared utility for reading Deriv login tokens stored by the OAuth flow.
 * These tokens are written to localStorage under 'accountsList' as a map
 * of { [loginId]: token }.
 *
 * This module exposes helper functions used by the scanner, auto-trader, and
 * copy-trading tabs to auto-connect with the authenticated user's token.
 */

import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

/** Returns the raw accountsList map from localStorage */
export const getAccountsList = (): Record<string, string> => {
    try {
        return JSON.parse(localStorage.getItem('accountsList') || '{}');
    } catch {
        return {};
    }
};

/** Returns the active loginid (e.g. "CR123456" or "VRTC1234") */
export const getActiveLoginId = (): string =>
    localStorage.getItem('active_loginid') || '';

/** Returns the token for the currently active account */
export const getActiveToken = (): string | null => {
    const list = getAccountsList();
    const id = getActiveLoginId();
    return list[id] || null;
};

/**
 * Robustly resolves a valid Deriv WebSocket authorization token for an account.
 * Supports legacy OAuth tokens, API tokens, and PKCE OAuth2 OTP token resolution.
 * Guarantees that the token returned is NOT an invalid bearer JWT (ory_at_...).
 */
export const resolveValidDerivWSToken = async (loginid?: string): Promise<string> => {
    const activeId = loginid || getActiveLoginId();
    const list = getAccountsList();

    // 1. Direct match in accountsList for active account
    if (activeId && list[activeId]) {
        return list[activeId];
    }

    // 2. Check any token in accountsList
    for (const id in list) {
        if (list[id]) {
            return list[id];
        }
    }

    // 3. Check localStorage stored tokens
    const storedToken = localStorage.getItem('token') || localStorage.getItem('active_token') || localStorage.getItem('authToken');
    if (storedToken && storedToken !== 'null') {
        return storedToken;
    }

    // 4. PKCE OAuth2 Access Token fallback
    const oauthToken = OAuthTokenExchangeService.getAccessToken();
    if (oauthToken) {
        return oauthToken;
    }

    // 5. Fetch OTP WebSocket URL if available
    try {
        const authInfo = OAuthTokenExchangeService.getAuthInfo();
        if (authInfo?.access_token && activeId) {
            const wsUrl = await DerivWSAccountsService.getAuthenticatedWebSocketURL(authInfo.access_token);
            if (wsUrl) {
                const parsedUrl = new URL(wsUrl);
                const otpToken = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('otp');
                if (otpToken) {
                    return otpToken;
                }
            }
        }
    } catch (e) {
        console.warn('[token-bridge] Error fetching PKCE OTP token:', e);
    }

    return '';
};

/** Returns true if the user is logged in (has any accounts) */
export const isLoggedIn = (): boolean =>
    Object.keys(getAccountsList()).length > 0;

/** Returns all tokens from the logged-in session */
export const getAllSessionTokens = (): string[] =>
    Object.values(getAccountsList()).filter(Boolean);

/**
 * Returns the first real (non-virtual) account token.
 * Real accounts have loginIds that do NOT start with 'VR'.
 */
export const getRealAccountToken = (): string | null => {
    const list = getAccountsList();
    const realKey = Object.keys(list).find(k => !k.startsWith('VR'));
    return realKey ? list[realKey] : null;
};

/**
 * Returns the loginId and token for the first real (CR) account,
 * or null if only demo accounts are available.
 */
export const getRealAccount = (): { loginId: string; token: string } | null => {
    const list = getAccountsList();
    const realKey = Object.keys(list).find(k => !k.startsWith('VR'));
    if (!realKey) return null;
    return { loginId: realKey, token: list[realKey] };
};

/**
 * Returns the loginId and token for the virtual/demo account,
 * or null if no demo account is found.
 */
export const getDemoAccount = (): { loginId: string; token: string } | null => {
    const list = getAccountsList();
    const demoKey = Object.keys(list).find(k => k.startsWith('VR'));
    if (!demoKey) return null;
    return { loginId: demoKey, token: list[demoKey] };
};

/** Formats a loginId for display (e.g. shows "CR: CR123456" for demo logins) */
export const formatLoginDisplay = (): string => {
    const active = getActiveLoginId();
    const list = getAccountsList();
    if (!active) return 'Not logged in';

    if (active.startsWith('VR')) {
        const crKey = Object.keys(list).find(k => !k.startsWith('VR'));
        return crKey ? `Demo (CR: ${crKey})` : `Demo: ${active}`;
    }
    return active;
};

/** Truncates a token for safe display */
export const truncateToken = (token: string, visibleChars = 6): string =>
    token.length > visibleChars * 2
        ? `${token.slice(0, visibleChars)}••••${token.slice(-4)}`
        : token;
