import { useCallback, useEffect, useState } from 'react';
import { clearCSRFToken, validateCSRFToken } from '@/components/shared/utils/config/config';
import { clearAuthData } from '@/utils/auth-utils';

/**
 * A single account entry parsed from the legacy Deriv OAuth callback URL.
 * e.g. ?acct1=CR123&token1=a1-xxx&cur1=USD
 */
export interface LegacyAccount {
    loginid: string;
    token: string;
    currency: string;
}

/**
 * OAuth callback parameters extracted from URL
 */
export interface OAuthCallbackParams {
    code: string | null;
    state: string | null;
    error: string | null;
    error_description: string | null;
}

/**
 * OAuth callback processing result
 */
export interface OAuthCallbackResult {
    isProcessing: boolean;
    isValid: boolean;
    params: OAuthCallbackParams;
    /** Populated when Deriv legacy OAuth redirects back with acct/token/cur params */
    legacyAccounts: LegacyAccount[];
    error: string | null;
    cleanupURL: () => void;
}

/**
 * Parses legacy Deriv OAuth accounts from the URL search string.
 * Deriv returns: ?acct1=CR123&token1=a1-xxx&cur1=USD&acct2=...
 */
function parseLegacyAccounts(urlParams: URLSearchParams): LegacyAccount[] {
    const accounts: LegacyAccount[] = [];
    let i = 1;
    while (urlParams.has(`acct${i}`) || urlParams.has(`token${i}`)) {
        const loginid = urlParams.get(`acct${i}`) || '';
        const token = urlParams.get(`token${i}`) || '';
        const currency = urlParams.get(`cur${i}`) || '';
        if (token) {
            accounts.push({ loginid: loginid || (i === 1 ? (urlParams.get('account') || '') : ''), token, currency: currency || 'USD' });
        }
        i++;
    }
    if (accounts.length === 0 && (urlParams.has('token') || urlParams.has('token1'))) {
        const token = urlParams.get('token') || urlParams.get('token1') || '';
        const loginid = urlParams.get('acct1') || urlParams.get('account') || urlParams.get('loginid') || '';
        const currency = urlParams.get('cur1') || urlParams.get('cur') || 'USD';
        if (token) {
            accounts.push({ loginid, token, currency });
        }
    }
    return accounts;
}

/**
 * Custom hook to handle OAuth callback flow
 *
 * This hook:
 * 1. Extracts OAuth parameters (code, state, error) or legacy account params from URL
 * 2. Validates CSRF token (state parameter) for PKCE flow
 * 3. Returns the authorization code / legacy accounts and a cleanup function
 */
export const useOAuthCallback = (): OAuthCallbackResult => {
    const [result, setResult] = useState<Omit<OAuthCallbackResult, 'cleanupURL'>>({
        isProcessing: true,
        isValid: false,
        params: {
            code: null,
            state: null,
            error: null,
            error_description: null,
        },
        legacyAccounts: [],
        error: null,
    });

    // Cleanup function that can be called by the consuming component
    const cleanupURL = useCallback(() => {
        const url = new URL(window.location.href);
        // New OAuth2 params
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        url.searchParams.delete('scope');
        url.searchParams.delete('error');
        url.searchParams.delete('error_description');
        url.searchParams.delete('token');
        url.searchParams.delete('token1');
        // Legacy Deriv OAuth params
        let i = 1;
        while (url.searchParams.has(`acct${i}`) || url.searchParams.has(`token${i}`) || url.searchParams.has(`cur${i}`)) {
            url.searchParams.delete(`acct${i}`);
            url.searchParams.delete(`token${i}`);
            url.searchParams.delete(`cur${i}`);
            i++;
        }
        window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash);
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);

        // ── Legacy Deriv OAuth: ?acct1=X&token1=Y&cur1=Z ─────────────────────
        // Deriv's legacy flow returns tokens directly in the URL, no code
        // exchange needed. Detect it before checking for OAuth2 params.
        const legacyAccounts = parseLegacyAccounts(urlParams);
        if (legacyAccounts.length > 0) {
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code: null, state: null, error: null, error_description: null },
                legacyAccounts,
                error: null,
            });
            return;
        }

        // ── New OAuth2 PKCE: ?code=X&state=Y ─────────────────────────────────
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        const error_description = urlParams.get('error_description');

        // Check if this is an OAuth callback (has code or error parameter)
        const isOAuthCallback = code !== null || error !== null || state !== null;

        if (!isOAuthCallback) {
            // Not an OAuth callback, mark as complete
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code: null, state: null, error: null, error_description: null },
                legacyAccounts: [],
                error: null,
            });
            return;
        }

        // Handle OAuth error response
        if (error) {
            console.error('OAuth error:', error, error_description);
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                legacyAccounts: [],
                error: error_description || error,
            });

            cleanupURL();
            return;
        }

        // Validate CSRF token (state parameter)
        if (!state) {
            console.error('[DEBUG] Missing state parameter in OAuth callback');
            cleanupURL();
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                legacyAccounts: [],
                error: 'Missing state parameter - potential security threat',
            });
            return;
        }

        if (!validateCSRFToken(state)) {
            console.error('[DEBUG] CSRF token validation failed - potential security threat');
            cleanupURL();
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                legacyAccounts: [],
                error: 'CSRF token validation failed',
            });
            return;
        }

        // CSRF validation passed
        clearCSRFToken();

        // Validate that we have the authorization code
        if (!code) {
            console.error('Missing authorization code in OAuth callback');
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                legacyAccounts: [],
                error: 'Missing authorization code',
            });

            cleanupURL();
            return;
        }

        setResult({
            isProcessing: false,
            isValid: true,
            params: { code, state, error, error_description },
            legacyAccounts: [],
            error: null,
        });
    }, [cleanupURL]); // Run only once on mount

    return {
        ...result,
        cleanupURL,
    };
};

