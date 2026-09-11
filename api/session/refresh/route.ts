/**
 * POST /api/session/refresh
 *
 * Silent token refresh. Called automatically when the access token is near expiry.
 * Reads the HttpOnly deriv_refresh cookie, calls Deriv OAuth refresh endpoint,
 * and rotates both cookies. Returns only safe metadata (no tokens to browser JS).
 */
export const runtime = 'edge';

const DERIV_TOKEN_ENDPOINT = 'https://oauth.deriv.com/oauth2/token';
const COOKIE_NAME_ACCESS   = 'deriv_session';
const COOKIE_NAME_REFRESH  = 'deriv_refresh';
const SESSION_TTL_S = 3600;
const REFRESH_TTL_S = 2592000;

function cookieHeader(name, value, maxAge) {
    return name + '=' + value + '; HttpOnly; Secure; SameSite=Strict; Path=/api/session; Max-Age=' + maxAge;
}

function parseCookies(header) {
    const map = {};
    if (!header) return map;
    header.split(';').forEach(part => {
        const [k, ...v] = part.trim().split('=');
        if (k) map[k.trim()] = v.join('=').trim();
    });
    return map;
}

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin || '',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json',
    };
}

export async function POST(request) {
    const origin  = request.headers.get('origin') || '';
    const cookies = parseCookies(request.headers.get('cookie') || '');
    const refreshToken = cookies[COOKIE_NAME_REFRESH];

    if (!refreshToken) {
        return new Response(JSON.stringify({ error: 'No refresh token' }), { status: 401, headers: corsHeaders(origin) });
    }

    const clientId     = process.env.DERIV_APP_ID        || '121856';
    const clientSecret = process.env.DERIV_CLIENT_SECRET || '';

    let tokenResponse;
    try {
        const res = await fetch(DERIV_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type:    'refresh_token',
                refresh_token: refreshToken,
                client_id:     clientId,
                client_secret: clientSecret,
            }),
        });
        tokenResponse = await res.json();
    } catch (err) {
        console.error('[/api/session/refresh] Refresh error:', err);
        return new Response(JSON.stringify({ error: 'Refresh failed' }), { status: 502, headers: corsHeaders(origin) });
    }

    const { access_token, refresh_token, expires_in, account_id, currency, account_type } = tokenResponse;

    if (!access_token) {
        // Refresh token is invalid/expired — clear both cookies to force re-login
        const headers = new Headers(corsHeaders(origin));
        headers.append('Set-Cookie', COOKIE_NAME_ACCESS  + '=; HttpOnly; Secure; SameSite=Strict; Path=/api/session; Max-Age=0');
        headers.append('Set-Cookie', COOKIE_NAME_REFRESH + '=; HttpOnly; Secure; SameSite=Strict; Path=/api/session; Max-Age=0');
        return new Response(JSON.stringify({ error: 'Session expired', requiresLogin: true }), { status: 401, headers });
    }

    const expiresAt = Date.now() + (Number(expires_in) || SESSION_TTL_S) * 1000;

    const headers = new Headers(corsHeaders(origin));
    headers.append('Set-Cookie', cookieHeader(COOKIE_NAME_ACCESS, access_token, SESSION_TTL_S));
    if (refresh_token) {
        headers.append('Set-Cookie', cookieHeader(COOKIE_NAME_REFRESH, refresh_token, REFRESH_TTL_S));
    }

    return new Response(JSON.stringify({
        loginid:      account_id  || '',
        currency:     currency    || 'USD',
        account_type: account_type || 'real',
        expiresAt,
    }), { status: 200, headers });
}

export async function OPTIONS(request) {
    const origin = request.headers.get('origin') || '*';
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
        },
    });
}
