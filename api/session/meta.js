'use strict';

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

module.exports = async function handler(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const cookies = req.cookies || parseCookies(req.headers.cookie || '');
    const accessToken = cookies['deriv_session'];

    if (!accessToken) {
        return res.status(200).json({ loggedIn: false });
    }

    try {
        const response = await fetch(DERIV_ACCOUNTS_ENDPOINT, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            return res.status(200).json({ loggedIn: false });
        }

        const data = await response.json();
        const active = (data && data.accounts && data.accounts[0]) || {};
        return res.status(200).json({
            loggedIn: true,
            loginid: active.account_id || (data && data.account_id) || '',
            currency: active.currency || (data && data.currency) || 'USD',
            account_type: active.account_type || 'real',
            expiresAt: Date.now() + 3600 * 1000,
        });
    } catch {
        return res.status(200).json({ loggedIn: false });
    }
};
