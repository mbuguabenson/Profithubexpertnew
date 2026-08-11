'use strict';

const brandConfig = require('../../brand.config.json');

const getDerivWSBaseURL = () => {
    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'staging';
    return brandConfig.platform.derivws.url[environment];
};

const getOptionsDir = () => brandConfig.platform.derivws.directories.options;

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authorization = req.headers.authorization || '';
    if (!authorization.toLowerCase().startsWith('bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const appId = req.headers['deriv-app-id'] || '121856';
    const endpoint = `${getDerivWSBaseURL()}${getOptionsDir()}accounts`;

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                Authorization: authorization,
                'Deriv-App-ID': appId,
            },
        });

        const contentType = response.headers.get('content-type') || 'application/json';
        const body = await response.text();

        res.status(response.status);
        res.setHeader('Content-Type', contentType);
        return res.send(body);
    } catch (error) {
        console.error('[DerivAccountsProxy] Error forwarding accounts request:', error);
        return res.status(502).json({ error: 'Failed to forward Deriv accounts request' });
    }
};
