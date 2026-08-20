'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BOTS_FILE = path.join(DATA_DIR, 'uploaded-bots.json');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const getStoredBots = () => {
    ensureDataDir();
    if (fs.existsSync(BOTS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
        } catch {
            /* ignore */
        }
    }
    const defaults = [];
    try {
        fs.writeFileSync(BOTS_FILE, JSON.stringify(defaults, null, 2));
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
        return res.status(200).json(getStoredBots());
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const { name, description, xml } = body;

        if (!name || !xml) {
            return res.status(400).json({ error: 'Name and XML content are required' });
        }

        const bots = getStoredBots();
        const newBot = {
            id: `bot-${Date.now()}`,
            name,
            description: description || `Bot: ${name}`,
            xml,
            uploadedAt: Date.now(),
        };

        bots.push(newBot);
        ensureDataDir();
        fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));

        return res.status(201).json({ success: true, bot: newBot });
    }

    if (req.method === 'DELETE') {
        const id = req.query.id;
        if (!id) {
            return res.status(400).json({ error: 'Bot ID required' });
        }

        const bots = getStoredBots().filter(b => b.id !== id);
        ensureDataDir();
        fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));

        return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
};
