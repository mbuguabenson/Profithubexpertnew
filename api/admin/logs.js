'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LOGS_FILE = path.join(DATA_DIR, 'system-logs.json');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const getStoredLogs = () => {
    ensureDataDir();
    if (fs.existsSync(LOGS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
        } catch {
            /* ignore */
        }
    }
    const defaults = [];
    try {
        fs.writeFileSync(LOGS_FILE, JSON.stringify(defaults, null, 2));
    } catch {
        /* ignore */
    }
    return defaults;
};

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        const logs = getStoredLogs();
        return res.status(200).json(logs);
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        const { level, message, component } = body;

        if (!message) {
            return res.status(400).json({ error: 'Missing log message' });
        }

        const logs = getStoredLogs();
        const newLog = {
            id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: Date.now(),
            level: level || 'info',
            message,
            component: component || 'System',
        };

        logs.unshift(newLog);
        if (logs.length > 300) logs.splice(300);

        ensureDataDir();
        fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
        return res.status(201).json({ success: true, log: newLog });
    }

    if (req.method === 'DELETE') {
        ensureDataDir();
        fs.writeFileSync(LOGS_FILE, JSON.stringify([], null, 2));
        return res.status(200).json({ success: true, message: 'Logs cleared' });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
};
