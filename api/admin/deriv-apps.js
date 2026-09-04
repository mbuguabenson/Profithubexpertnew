'use strict';

const WebSocket = require('ws');

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Deriv-App-ID');
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authorization = req.headers.authorization || '';
    let token = '';

    if (authorization.toLowerCase().startsWith('bearer ')) {
        token = authorization.slice(7).trim();
    } else if (req.query.token) {
        token = String(req.query.token).trim();
    }

    const appId = req.headers['deriv-app-id'] || req.query.app_id || '121856';
    const wsUrl = `wss://ws.binaryws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`;

    // Build standard date formats for Deriv API (YYYY-MM-DD HH:MM:SS)
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const defaultDateTo = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} 23:59:59`;
    const dateFrom = req.query.date_from || '2020-01-01 00:00:00';
    const dateTo = req.query.date_to || defaultDateTo;
    const limit = parseInt(req.query.limit, 10) || 100;

    return new Promise(resolve => {
        let ws;
        let isClosed = false;
        const result = {
            success: true,
            authorizedScopes: [],
            account: null,
            applications: [],
            markupStatistics: {
                total_app_markup_usd: 0,
                total_transactions_count: 0,
                breakdown: [],
            },
            markupDetails: {
                transactions: [],
            },
        };

        const cleanupAndFinish = () => {
            if (isClosed) return;
            isClosed = true;
            clearTimeout(timeout);
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                try {
                    ws.close();
                } catch {}
            }
            res.status(200).json(result);
            resolve();
        };

        const timeout = setTimeout(cleanupAndFinish, 6000);

        try {
            ws = new WebSocket(wsUrl);

            let pendingCount = 0;

            ws.on('open', () => {
                if (token) {
                    pendingCount++;
                    ws.send(JSON.stringify({ authorize: token, req_id: 1 }));
                } else {
                    pendingCount++;
                    ws.send(JSON.stringify({ app_list: 1, req_id: 2 }));
                }
            });

            ws.on('message', message => {
                try {
                    const data = JSON.parse(message.toString());

                    if (data.msg_type === 'authorize') {
                        pendingCount--;
                        if (data.authorize) {
                            const auth = data.authorize;
                            result.authorizedScopes = auth.scopes || [];
                            result.account = {
                                loginid: auth.loginid,
                                fullname: auth.fullname || auth.nickname || auth.loginid,
                                email: auth.email || '',
                                currency: auth.currency || 'USD',
                                balance: typeof auth.balance === 'number' ? auth.balance : parseFloat(auth.balance || '0'),
                                country: auth.country || '',
                                isVirtual: Boolean(auth.is_virtual),
                            };

                            // Send app_list, app_markup_statistics, app_markup_details
                            pendingCount += 3;
                            ws.send(JSON.stringify({ app_list: 1, req_id: 2 }));
                            ws.send(JSON.stringify({
                                app_markup_statistics: 1,
                                date_from: dateFrom,
                                date_to: dateTo,
                                req_id: 3,
                            }));
                            ws.send(JSON.stringify({
                                app_markup_details: 1,
                                date_from: dateFrom,
                                date_to: dateTo,
                                description: 1,
                                limit,
                                sort: 'DESC',
                                req_id: 4,
                            }));
                        } else {
                            // Authorization failed
                            cleanupAndFinish();
                            return;
                        }
                    }

                    if (data.msg_type === 'app_list') {
                        pendingCount--;
                        if (data.app_list) {
                            result.applications = data.app_list.map(app => ({
                                app_id: app.app_id,
                                name: app.name,
                                scopes: app.scopes || result.authorizedScopes || ['read', 'trade'],
                                redirect_uri: app.redirect_uri || '',
                                verification_uri: app.verification_uri || '',
                                active: app.active !== undefined ? Boolean(app.active) : true,
                                markup_percentage: app.app_markup_percentage || 2.0,
                            }));
                        }
                    }

                    if (data.msg_type === 'app_markup_statistics') {
                        pendingCount--;
                        if (data.app_markup_statistics) {
                            result.markupStatistics = {
                                total_app_markup_usd: Number(data.app_markup_statistics.total_app_markup_usd || 0),
                                total_transactions_count: Number(data.app_markup_statistics.total_transactions_count || 0),
                                breakdown: Array.isArray(data.app_markup_statistics.breakdown) ? data.app_markup_statistics.breakdown : [],
                            };
                        }
                    }

                    if (data.msg_type === 'app_markup_details') {
                        pendingCount--;
                        if (data.app_markup_details) {
                            result.markupDetails = {
                                transactions: Array.isArray(data.app_markup_details.transactions) ? data.app_markup_details.transactions : [],
                            };
                        }
                    }

                    if (pendingCount <= 0) {
                        cleanupAndFinish();
                    }
                } catch (parseErr) {
                    console.error('[deriv-apps] parse error:', parseErr);
                }
            });

            ws.on('error', err => {
                console.error('[deriv-apps] ws error:', err.message);
                cleanupAndFinish();
            });
        } catch (err) {
            cleanupAndFinish();
        }
    });
};
