/**
 * /api/session/route.ts -- Vercel Edge Function
 *
 * POST /api/session
 * Body: { code: string }  -- Deriv OAuth PKCE authorization code
 *
 * Exchanges the code for an access_token + refresh_token via the Deriv OAuth2 endpoint.
 * Stores BOTH tokens in HttpOnly, SameSite=Strict, Secure cookies.
 * Returns ONLY safe metadata { loginid, currency, account_type, expiresAt } -- no raw token.
 *
 * The browser client never receives or stores the raw credential.
 */

export const runtime = 'edge';

const DERIV_TOKEN_ENDPOINT = 'https://oauth.deriv.com/oauth2/token';
const COOKIE_NAME_ACCESS  = 'deriv_session';
const COOKIE_NAME_REFRESH = 'deriv_refresh';
const SESSION_TTL_S = 3600;
const REFRESH_TTL_S = 2592000;

function cookieHeader(name, value, maxAge, sameSite = 'Strict') {
    return name + '=' + value + '; HttpOnly; Secure; SameSite=' + sameSite + '; Path=/api/session; Max-Age=' + maxAge;
}

export async function POST(request) {
    const origin = request.headers.get('origin') || '';
    const allowedOrigins = [
        process.env.NEXT_PUBLIC_APP_URL || '',
        'https://profithub.vercel.app',
        'http://localhost:3000',
        'http://localhost:5173',
    ].filter(Boolean);

    if (!allowedOrigins.some(o => origin.startsWith(o))) {
        return new Response('Forbidden', { status: 403 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
    }

    const { code } = body;
    if (!code || typeof code !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing code parameter' }), { status: 400 });
    }

    const clientId     = process.env.DERIV_APP_ID        || '121856';
    const clientSecret = process.env.DERIV_CLIENT_SECRET || '';
    const redirectUri  = process.env.DERIV_REDIRECT_URI  || (origin + '/oauth/callback');

    let tokenResponse;
    try {
        const res = await fetch(DERIV_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type:    'authorization_code',
                code,
                client_id:     clientId,
                client_secret: clientSecret,
                redirect_uri:  redirectUri,
            }),
        });
        tokenResponse = await res.json();
    } catch (err) {
        console.error('[/api/session] Token exchange error:', err);
        return new Response(JSON.stringify({ error: 'Token exchange failed' }), { status: 502 });
    }

    const { access_token, refresh_token, expires_in, account_id, currency, account_type } = tokenResponse;

    if (!access_token) {
        return new Response(JSON.stringify({ error: tokenResponse.error || 'Token exchange failed' }), { status: 401 });
    }

    const expiresAt = Date.now() + (Number(expires_in) || SESSION_TTL_S) * 1000;

    const headers = new Headers();
    headers.append('Set-Cookie', cookieHeader(COOKIE_NAME_ACCESS, access_token, SESSION_TTL_S));
    if (refresh_token) {
        headers.append('Set-Cookie', cookieHeader(COOKIE_NAME_REFRESH, refresh_token, REFRESH_TTL_S));
    }
    headers.set('Content-Type', 'application/json');
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');

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
