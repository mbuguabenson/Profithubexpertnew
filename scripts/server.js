'use strict';

const http = require('http');
const url = require('url');

const authHandler = require('../api/admin/auth');
const siteConfigHandler = require('../api/admin/site-config');
const systemHealthHandler = require('../api/admin/system-health');
const copyRequestsHandler = require('../api/admin/copy-requests');
const transactionsHandler = require('../api/admin/transactions');
const logsHandler = require('../api/admin/logs');
const notificationsHandler = require('../api/admin/notifications');
const botsHandler = require('../api/admin/bots');
const derivAccountsHandler = require('../api/deriv-accounts');
const derivAppsHandler = require('../api/admin/deriv-apps');
const derivOtpHandler = require('../api/deriv-otp/[accountId]');
const supabaseProxyHandler = require('../api/supabase-proxy');

const PORT = process.env.PORT || 4000;

const parseBody = req => {
    return new Promise(resolve => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                resolve(body);
            }
        });
    });
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    // Normalize path by stripping trailing slash
    let pathname = parsedUrl.pathname || '';
    if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
    }
    req.query = parsedUrl.query || {};

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Deriv-App-ID');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        req.body = await parseBody(req);
    }

    // Response helper wrappers
    res.status = code => {
        res.statusCode = code;
        return res;
    };
    res.json = data => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };
    res.send = data => {
        res.end(data);
    };

    console.log(`[API Server] ${req.method} ${pathname}`);

    try {
        // Root API endpoints list
        if (pathname === '/api' || pathname === '' || pathname === '/api/admin') {
            return res.status(200).json({
                name: 'ProfitHub Expert API Server',
                status: 'operational',
                version: '1.0.0',
                endpoints: [
                    '/api/admin/auth',
                    '/api/admin/site-config',
                    '/api/admin/system-health',
                    '/api/admin/copy-requests',
                    '/api/admin/transactions',
                    '/api/admin/logs',
                    '/api/admin/notifications',
                    '/api/admin/bots',
                    '/api/deriv-accounts',
                    '/api/deriv-otp/{accountId}',
                    '/api/supabase/{table}',
                ],
            });
        }

        if (pathname === '/api/admin/auth') {
            return await authHandler(req, res);
        }
        if (pathname === '/api/admin/site-config') {
            return await siteConfigHandler(req, res);
        }
        if (pathname === '/api/admin/system-health') {
            return await systemHealthHandler(req, res);
        }
        if (pathname === '/api/admin/copy-requests') {
            return await copyRequestsHandler(req, res);
        }
        if (pathname === '/api/admin/transactions') {
            return await transactionsHandler(req, res);
        }
        if (pathname === '/api/admin/logs') {
            return await logsHandler(req, res);
        }
        if (pathname === '/api/admin/notifications') {
            return await notificationsHandler(req, res);
        }
        if (pathname === '/api/admin/bots') {
            return await botsHandler(req, res);
        }
        if (pathname === '/api/deriv-accounts') {
            return await derivAccountsHandler(req, res);
        }
        if (pathname === '/api/admin/deriv-apps') {
            return await derivAppsHandler(req, res);
        }
        if (pathname.startsWith('/api/deriv-otp/')) {
            const parts = pathname.split('/');
            req.query.accountId = parts[parts.length - 1];
            return await derivOtpHandler(req, res);
        }
        if (pathname.startsWith('/api/supabase/')) {
            return await supabaseProxyHandler(req, res);
        }

        res.status(404).json({
            error: 'Endpoint not found',
            path: pathname,
            availableEndpoints: [
                '/api/admin/auth',
                '/api/admin/site-config',
                '/api/admin/system-health',
                '/api/admin/copy-requests',
            ],
        });
    } catch (err) {
        console.error('[API Server Error]', err);
        res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`🚀 ProfitHub Expert Backend API Server running at http://localhost:${PORT}/api/`);
    });
}

module.exports = server;
