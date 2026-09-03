'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const COPY_FILE = path.join(DATA_DIR, 'copy-requests.json');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const getStoredRequests = () => {
    ensureDataDir();
    if (fs.existsSync(COPY_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(COPY_FILE, 'utf8'));
        } catch {
            /* ignore */
        }
    }
    const defaults = [];
    try {
        fs.writeFileSync(COPY_FILE, JSON.stringify(defaults, null, 2));
    } catch {
        /* ignore */
    }
    return defaults;
};

const saveStoredRequests = requests => {
    ensureDataDir();
    fs.writeFileSync(COPY_FILE, JSON.stringify(requests, null, 2));
};

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        const providerLoginid = req.query.provider_loginid || req.query.provider;
        const requests = getStoredRequests();
        if (providerLoginid) {
            const filtered = requests.filter(r => r.provider_loginid === providerLoginid);
            return res.status(200).json(filtered);
        }
        return res.status(200).json(requests);
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        const { requester_loginid, requester_token, provider_loginid } = body;

        if (!requester_loginid || !requester_token) {
            return res.status(400).json({ error: 'Missing requester_loginid or requester_token' });
        }

        const requests = getStoredRequests();

        // Remove old duplicate request for same requester + provider
        const cleaned = requests.filter(
            r => !(r.requester_loginid === requester_loginid && r.provider_loginid === provider_loginid)
        );

        const newRequest = {
            id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            requester_loginid,
            requester_token,
            provider_loginid: provider_loginid || 'Profithubadmin',
            status: 'pending',
            created_at: new Date().toISOString(),
        };

        cleaned.unshift(newRequest);
        saveStoredRequests(cleaned);

        return res.status(201).json({ success: true, request: newRequest });
    }

    if (req.method === 'PATCH') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        const requestId = req.query.id || body.id;
        const { status } = body;

        if (!requestId || !status) {
            return res.status(400).json({ error: 'Missing requestId or status' });
        }

        const requests = getStoredRequests();
        const idx = requests.findIndex(r => r.id === requestId);

        if (idx < 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        requests[idx].status = status;
        if (status === 'accepted') {
            requests[idx].accepted_at = new Date().toISOString();
        }
        saveStoredRequests(requests);

        return res.status(200).json({ success: true, request: requests[idx] });
    }

    if (req.method === 'DELETE') {
        const requestId = req.query.id;
        if (!requestId) {
            return res.status(400).json({ error: 'Missing id query parameter' });
        }
        const requests = getStoredRequests();
        const filtered = requests.filter(r => r.id !== requestId);
        saveStoredRequests(filtered);
        return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
};
