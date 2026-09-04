'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TXN_FILE = path.join(DATA_DIR, 'mpesa-transactions.json');
const COMM_FILE = path.join(DATA_DIR, 'commissions.json');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const getStoredTransactions = () => {
    ensureDataDir();
    if (fs.existsSync(TXN_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(TXN_FILE, 'utf8'));
        } catch {
            /* ignore */
        }
    }
    const defaults = [];
    try {
        fs.writeFileSync(TXN_FILE, JSON.stringify(defaults, null, 2));
    } catch {
        /* ignore */
    }
    return defaults;
};

const getStoredCommissions = () => {
    ensureDataDir();
    if (fs.existsSync(COMM_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(COMM_FILE, 'utf8'));
        } catch {
            /* ignore */
        }
    }
    const defaults = [];
    try {
        fs.writeFileSync(COMM_FILE, JSON.stringify(defaults, null, 2));
    } catch {
        /* ignore */
    }
    return defaults;
};

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    const type = req.query.type || 'transactions';

    if (req.method === 'GET') {
        if (type === 'commissions') {
            return res.status(200).json(getStoredCommissions());
        }
        return res.status(200).json(getStoredTransactions());
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        ensureDataDir();

        if (type === 'commissions') {
            const commissions = getStoredCommissions();
            const newComm = {
                id: body.id || `COMM-${Date.now().toString().slice(-6)}`,
                date: body.date || new Date().toISOString(),
                clientId: body.clientId || 'CR1000000',
                volume: Number(body.volume) || 0,
                profitShare: Number(body.profitShare) || 0,
                amount: Number(body.amount) || 0,
                status: body.status || 'pending',
            };
            commissions.unshift(newComm);
            fs.writeFileSync(COMM_FILE, JSON.stringify(commissions, null, 2));
            return res.status(201).json({ success: true, commission: newComm });
        }

        const txns = getStoredTransactions();
        const newTxn = {
            id: body.id || `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
            phoneNumber: body.phoneNumber || '',
            amount: Number(body.amount) || 0,
            packageName: body.packageName || 'Pass',
            timestamp: Date.now(),
            status: body.status || 'completed',
            reference: body.reference || `MPESA-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
        };
        txns.unshift(newTxn);
        fs.writeFileSync(TXN_FILE, JSON.stringify(txns, null, 2));
        return res.status(201).json({ success: true, transaction: newTxn });
    }

    if (req.method === 'PATCH') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        if (type === 'commissions') {
            const { id, status } = body;
            const commissions = getStoredCommissions();
            const idx = commissions.findIndex(c => c.id === id);
            if (idx >= 0) {
                commissions[idx].status = status;
                fs.writeFileSync(COMM_FILE, JSON.stringify(commissions, null, 2));
                return res.status(200).json({ success: true, commission: commissions[idx] });
            }
            return res.status(404).json({ error: 'Commission record not found' });
        }
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method Not Allowed' });
};
