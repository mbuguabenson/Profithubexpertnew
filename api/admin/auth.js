'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const getStoredCredentials = () => {
    ensureDataDir();
    if (fs.existsSync(AUTH_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
        } catch {
            /* ignore */
        }
    }
    const defaults = {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123',
        tokenSecret: 'profithub_admin_secret_token_2026',
    };
    try {
        fs.writeFileSync(AUTH_FILE, JSON.stringify(defaults, null, 2));
    } catch {
        /* ignore */
    }
    return defaults;
};

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    const credentials = getStoredCredentials();

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        const { action, username, password, token, newPassword } = body;

        // Login Action
        if (action === 'login' || (!action && username && password)) {
            const isValidUser = username === credentials.username || username === 'Profithubadmin';
            const isValidPass = password === credentials.password;

            if (isValidUser && isValidPass) {
                const sessionToken = `admin_session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                return res.status(200).json({
                    success: true,
                    token: sessionToken,
                    user: { username: credentials.username, role: 'super_admin' },
                    message: 'Authentication successful',
                });
            } else {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid username or password',
                });
            }
        }

        // Token Verification Action
        if (action === 'verify') {
            if (token && token.startsWith('admin_session_')) {
                return res.status(200).json({ success: true, valid: true });
            }
            return res.status(401).json({ success: false, valid: false });
        }

        // Password Change Action
        if (action === 'change_password') {
            if (!newPassword || newPassword.length < 4) {
                return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
            }
            credentials.password = newPassword;
            try {
                fs.writeFileSync(AUTH_FILE, JSON.stringify(credentials, null, 2));
                return res.status(200).json({ success: true, message: 'Password updated successfully' });
            } catch (err) {
                return res.status(500).json({ success: false, error: 'Failed to update credentials' });
            }
        }

        return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'online',
            authRequired: true,
        });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
};
