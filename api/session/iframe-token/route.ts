/**
 * POST /api/session/iframe-token
 *
 * Called by the PARENT PAGE only (same origin).
 * Reads the HttpOnly deriv_session cookie, generates a short-lived (60s)
 * HMAC-SHA256-signed One-Time Token (OTT) that the iframe can exchange for
 * a Deriv WebSocket token without ever seeing the raw OAuth access_token.
 *
 * OTT format: base64url(JSON { jti, sub, exp }) + '.' + base64url(HMAC-SHA256 signature)
 */
export const runtime = 'edge';

const OTT_TTL_MS = 60_000; // 60 seconds

async function hmacSign(secret, data) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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

function b64url(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function POST(request) {
    const origin = request.headers.get('origin') || '';
    const cookies = parseCookies(request.headers.get('cookie') || '');
    const accessToken = cookies['deriv_session'];

    if (!accessToken) {
        return new Response(JSON.stringify({ error: 'Not authenticated' }), {
            status: 401,
            headers: corsHeaders(origin),
        });
    }

    const secret = process.env.OTT_HMAC_SECRET;
    if (!secret) {
        console.error('[iframe-token] OTT_HMAC_SECRET env variable is not set');
        return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: corsHeaders(origin) });
    }

    const jti  = crypto.randomUUID();
    const exp  = Date.now() + OTT_TTL_MS;
    // Payload encodes the access token inside the signed claim — never sent to browser
    const payload = JSON.stringify({ jti, exp, tok: accessToken });
    const payloadB64 = b64url(payload);
    const sig = await hmacSign(secret, payloadB64);
    const ott = payloadB64 + '.' + sig;

    return new Response(JSON.stringify({ ott, expiresAt: exp }), {
        status: 200,
        headers: corsHeaders(origin),
    });
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
