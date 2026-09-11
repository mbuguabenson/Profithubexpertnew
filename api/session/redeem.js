'use strict';

const crypto = require('crypto');

const consumed = new Set();
const DERIV_WS_AUTH_ENDPOINT = 'https://api.derivws.com/rest/v1/token/exchange';

function b64urlDecode(s) {
    return Buffer.from(s, 'base64url').toString('utf8');
}

function hmacVerify(secret, payloadB64, sigB64) {
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    if (expectedSig.length !== sigB64.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedSig));
}

module.exports = async function handler(req, res) {
    const origin = req.headers.origin || '';
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { ott } = req.body || {};
    if (!ott || typeof ott !== 'string') {
        return res.status(400).json({ error: 'Missing ott' });
    }

    const secret = process.env.OTT_HMAC_SECRET || 'profithub-dtrader-secure-ott-secret-2026';
    const dotIdx = ott.lastIndexOf('.');
    if (dotIdx === -1) {
        return res.status(400).json({ error: 'Malformed OTT' });
    }

    const payloadB64 = ott.substring(0, dotIdx);
    const sigB64 = ott.substring(dotIdx + 1);

    try {
        if (!hmacVerify(secret, payloadB64, sigB64)) {
            return res.status(401).json({ error: 'Invalid OTT signature' });
        }
    } catch {
        return res.status(401).json({ error: 'Invalid OTT signature' });
    }

    let payload;
    try {
        payload = JSON.parse(b64urlDecode(payloadB64));
    } catch {
        return res.status(400).json({ error: 'Malformed OTT payload' });
    }

    const { jti, exp, tok } = payload;
    if (!exp || Date.now() > exp) {
        return res.status(401).json({ error: 'OTT expired' });
    }

    if (consumed.has(jti)) {
        return res.status(401).json({ error: 'OTT already used' });
    }
    consumed.add(jti);
    if (consumed.size > 1000) consumed.clear();

    // Exchange token using Deriv API endpoint with Authorization: Bearer <token>
    try {
        const response = await fetch(DERIV_WS_AUTH_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tok}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange' }),
        });

        const data = await response.json();
        const wsToken = data?.access_token || data?.token || tok;

        return res.status(200).json({ wsToken });
    } catch (err) {
        console.error('[/api/session/redeem] Token exchange error:', err);
        return res.status(200).json({ wsToken: tok });
    }
};
