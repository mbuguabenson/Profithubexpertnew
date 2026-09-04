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

const getStoredDatabase = () => {
    ensureDataDir();
    if (fs.existsSync(AUTH_FILE)) {
        try {
            const content = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
            if (Array.isArray(content.users)) {
                return content;
            }
            // Migrate legacy flat structure to users array if needed
            if (content.username && content.password) {
                return {
                    users: [
                        {
                            id: 'usr_superadmin_01',
                            username: content.username,
                            password: content.password,
                            role: 'super_admin',
                            permissions: ['all'],
                            created_at: new Date().toISOString(),
                            last_login: null,
                        },
                    ],
                };
            }
        } catch {
            /* ignore corrupted file, fallback below */
        }
    }

    const defaultDatabase = {
        users: [
            {
                id: 'usr_superadmin_01',
                username: process.env.ADMIN_USERNAME || 'Admin_profithub',
                password: process.env.ADMIN_PASSWORD || 'Access@profithub2026',
                role: 'super_admin',
                permissions: ['all'],
                created_at: new Date().toISOString(),
                last_login: null,
            },
            {
                id: 'usr_admin_02',
                username: 'admin',
                password: 'admin123',
                role: 'administrator',
                permissions: ['manage_content', 'view_analytics', 'view_transactions'],
                created_at: new Date().toISOString(),
                last_login: null,
            },
        ],
    };

    try {
        fs.writeFileSync(AUTH_FILE, JSON.stringify(defaultDatabase, null, 2));
    } catch {
        /* ignore */
    }
    return defaultDatabase;
};

const saveDatabase = (db) => {
    ensureDataDir();
    fs.writeFileSync(AUTH_FILE, JSON.stringify(db, null, 2));
};

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    const db = getStoredDatabase();

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        const { action, username, password, token, newPassword } = body;

        // Login Action - verify credentials strictly against database
        if (action === 'login' || (!action && username && password)) {
            const trimmedUser = (username || '').trim().toLowerCase();
            const matchedUser = db.users.find(
                u => u.username.toLowerCase() === trimmedUser && u.password === password
            );

            if (matchedUser) {
                // Update last login in database
                matchedUser.last_login = new Date().toISOString();
                saveDatabase(db);

                const sessionToken = `admin_session_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
                return res.status(200).json({
                    success: true,
                    token: sessionToken,
                    user: {
                        id: matchedUser.id,
                        username: matchedUser.username,
                        role: matchedUser.role,
                        permissions: matchedUser.permissions,
                        last_login: matchedUser.last_login,
                    },
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

        // Password Change Action in database
        if (action === 'change_password') {
            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
            }
            const targetUsername = (username || 'Admin_profithub').trim().toLowerCase();
            const targetUser = db.users.find(u => u.username.toLowerCase() === targetUsername) || db.users[0];

            if (targetUser) {
                targetUser.password = newPassword;
                targetUser.updated_at = new Date().toISOString();
                try {
                    saveDatabase(db);
                    return res.status(200).json({ success: true, message: 'Password updated successfully in database' });
                } catch {
                    return res.status(500).json({ success: false, error: 'Failed to update credentials in database' });
                }
            }
            return res.status(404).json({ success: false, error: 'User not found in database' });
        }

        return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'online',
            authRequired: true,
            userCount: db.users.length,
        });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
};
