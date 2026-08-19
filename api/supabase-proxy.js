'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bljwlgebdrgfqcsawygs.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Simple serverless proxy for Supabase REST endpoints to avoid CORS and hide anon key from clients.
// Usage: /api/supabase/copy_traders -> proxied to https://<supabase>/rest/v1/copy_traders

module.exports = async function handler(req, res) {
    // Remove the prefix /api/supabase/ from requested path
    const prefix = '/api/supabase/';
    const requestPath = req.url || '';
    if (!requestPath.startsWith(prefix)) {
        return res.status(400).json({ error: 'Invalid proxy path' });
    }

    const proxiedPath = requestPath.slice(prefix.length);
    const targetUrl = `${SUPABASE_URL}/rest/v1/${proxiedPath}`;

    try {
        const headers = Object.assign({}, req.headers || {});
        // Ensure we pass the anon key and content-type
        headers.apikey = SUPABASE_ANON_KEY;
        headers.authorization = `Bearer ${SUPABASE_ANON_KEY}`;
        // Remove host header to avoid issues
        delete headers.host;

        const response = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
        });

        const contentType = response.headers.get('content-type') || 'application/json';
        const body = await response.text();

        res.status(response.status);
        res.setHeader('Content-Type', contentType);
        return res.send(body);
    } catch (err) {
        console.error('[SupabaseProxy] Error forwarding request:', err);
        return res.status(502).json({ error: 'Failed to forward Supabase request' });
    }
};
