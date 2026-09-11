/**
 * GET /api/session/meta
 * Returns safe session metadata (NO token). Called by parent page JS.
 * Reads the HttpOnly deriv_session cookie server-side.
 */
export const runtime = 'edge';

const DERIV_ACCOUNTS_ENDPOINT = 'https://api.derivws.com/rest/v1/account';

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
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json',
    };
}

export async function GET(request) {
    const origin = request.headers.get('origin') || '';
    const cookies = parseCookies(request.headers.get('cookie') || '');
    const accessToken = cookies['deriv_session'];

    if (!accessToken) {
        return new Response(JSON.stringify({ loggedIn: false }), {
            status: 200,
            headers: corsHeaders(origin),
        });
    }

    // Validate token and fetch account metadata from Deriv REST API
    try {
        const res = await fetch(DERIV_ACCOUNTS_ENDPOINT, {
            headers: { Authorization: 'Bearer ' + accessToken },
        });
        if (!res.ok) {
            return new Response(JSON.stringify({ loggedIn: false }), { status: 200, headers: corsHeaders(origin) });
        }
        const data = await res.json();
        const active = data?.accounts?.[0] || {};
        return new Response(JSON.stringify({
            loggedIn:     true,
            loginid:      active.account_id  || data.account_id  || '',
            currency:     active.currency    || data.currency    || 'USD',
            account_type: active.account_type || 'real',
            expiresAt:    Date.now() + 3600 * 1000,
        }), { status: 200, headers: corsHeaders(origin) });
    } catch {
        return new Response(JSON.stringify({ loggedIn: false }), { status: 200, headers: corsHeaders(origin) });
    }
}

export async function OPTIONS(request) {
    const origin = request.headers.get('origin') || '*';
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
        },
    });
}
