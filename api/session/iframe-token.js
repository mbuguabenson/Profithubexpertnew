'use strict';

const crypto = require('crypto');

const OTT_TTL_MS = 60000; // 60 seconds

function parseCookies(header) {
    const map = {};
    if (!header) return map;
    header.split(';').forEach(part => {
        const [k, ...v] = part.trim().split('=');
        if (k) map[k.trim()] = v.join('=').trim();
    });
    return map;
}

function b64url(str) {
    return Buffer.from(str).toString('base64url');
}

function hmacSign(secret, data) {
    return crypto.createHmac('sha256', secret).update(data).digest('base64url');
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

    const cookies = req.cookies || parseCookies(req.headers.cookie || '');
    const accessToken = cookies['deriv_session'];

    if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const secret = process.env.OTT_HMAC_SECRET || 'profithub-dtrader-secure-ott-secret-2026';
    const jti = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    const exp = Date.now() + OTT_TTL_MS;

    const payload = JSON.stringify({ jti, exp, tok: accessToken });
    const payloadB64 = b64url(payload);
    const sig = hmacSign(secret, payloadB64);
    const ott = `${payloadB64}.${sig}`;

    return res.status(200).json({ ott, expiresAt: exp });
};
