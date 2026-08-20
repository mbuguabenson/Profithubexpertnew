'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const NOTI_FILE = path.join(DATA_DIR, 'notifications.json');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const getStoredNotifications = () => {
    ensureDataDir();
    if (fs.existsSync(NOTI_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(NOTI_FILE, 'utf8'));
        } catch {
            /* ignore */
        }
    }
    const defaults = [];
    try {
        fs.writeFileSync(NOTI_FILE, JSON.stringify(defaults, null, 2));
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

    if (req.method === 'GET') {
        return res.status(200).json(getStoredNotifications());
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const { title, message } = body;

        if (!title || !message) {
            return res.status(400).json({ error: 'Title and message are required' });
        }

        const items = getStoredNotifications();
        const newNoti = {
            id: `noti-${Date.now()}`,
            title,
            message,
            timestamp: Date.now(),
            is_read: false,
        };

        items.unshift(newNoti);
        ensureDataDir();
        fs.writeFileSync(NOTI_FILE, JSON.stringify(items, null, 2));

        return res.status(201).json({ success: true, notification: newNoti });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
};
