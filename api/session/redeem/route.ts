/**
 * POST /api/session/redeem
 *
 * Called by the IFRAME (same origin or with CORS credentials).
 * Body: { ott: string }
 *
 * Verifies HMAC signature + expiry of the One-Time Token.
 * Extracts the OAuth access_token from the OTT payload.
 * Exchanges it for a Deriv WebSocket token via the Deriv API.
 * Returns { wsToken } — the minimal credential the iframe needs to authorize
 * a WebSocket connection. The raw OAuth Bearer token is never exposed.
 *
 * OTTs are single-use (tracked in an in-memory Set; replace with KV for multi-instance).
 */
export const runtime = 'edge';

// In-memory revocation set. For multi-instance Vercel deployments, swap for
// Vercel KV (Redis) or Upstash: const kv = createClient(process.env.UPSTASH_URL)
const consumed = new Set();

async function hmacVerify(secret, payloadB64, sigB64) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payloadB64));
}

function b64urlDecode(s) {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='));
}

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin || '',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json',
    };
}

const DERIV_WS_AUTH_ENDPOINT = 'https://api.derivws.com/rest/v1/token/exchange';

export async function POST(request) {
    const origin = request.headers.get('origin') || '';

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders(origin) });
    }

    const { ott } = body;
    if (!ott || typeof ott !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing ott' }), { status: 400, headers: corsHeaders(origin) });
    }

    const secret = process.env.OTT_HMAC_SECRET;
    if (!secret) {
        return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: corsHeaders(origin) });
    }

    // Split OTT into payload + signature
    const dotIdx = ott.lastIndexOf('.');
    if (dotIdx === -1) {
        return new Response(JSON.stringify({ error: 'Malformed OTT' }), { status: 400, headers: corsHeaders(origin) });
    }
    const payloadB64 = ott.substring(0, dotIdx);
    const sigB64     = ott.substring(dotIdx + 1);

    // Verify HMAC signature
    const valid = await hmacVerify(secret, payloadB64, sigB64).catch(() => false);
    if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid OTT signature' }), { status: 401, headers: corsHeaders(origin) });
    }

    // Decode payload
    let payload;
    try {
        payload = JSON.parse(b64urlDecode(payloadB64));
    } catch {
        return new Response(JSON.stringify({ error: 'Malformed OTT payload' }), { status: 400, headers: corsHeaders(origin) });
    }

    const { jti, exp, tok } = payload;

    // Check expiry
    if (!exp || Date.now() > exp) {
        return new Response(JSON.stringify({ error: 'OTT expired' }), { status: 401, headers: corsHeaders(origin) });
    }

    // Enforce single-use
    if (consumed.has(jti)) {
        return new Response(JSON.stringify({ error: 'OTT already used' }), { status: 401, headers: corsHeaders(origin) });
    }
    consumed.add(jti);

    // Clean up expired JTIs periodically (simple GC)
    if (consumed.size > 1000) consumed.clear();

    // Exchange the OAuth Bearer token for a Deriv WebSocket token
    // The Deriv /token/exchange endpoint accepts Authorization: Bearer <oauth_token>
    // and returns a short-lived WS token suitable for the authorize{} WS call.
    let wsToken;
    try {
        const res = await fetch(DERIV_WS_AUTH_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + tok,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange' }),
        });
        const data = await res.json();
        wsToken = data?.access_token || data?.token;
    } catch (err) {
        console.error('[/api/session/redeem] WS token exchange error:', err);
        return new Response(JSON.stringify({ error: 'Failed to obtain WS token' }), { status: 502, headers: corsHeaders(origin) });
    }

    if (!wsToken) {
        return new Response(JSON.stringify({ error: 'No WS token returned by Deriv' }), { status: 502, headers: corsHeaders(origin) });
    }

    return new Response(JSON.stringify({ wsToken }), { status: 200, headers: corsHeaders(origin) });
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
