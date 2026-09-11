'use strict';

const handlers = {
    index: require('./_lib/session/index'),
    meta: require('./_lib/session/meta'),
    'iframe-token': require('./_lib/session/iframe-token'),
    redeem: require('./_lib/session/redeem'),
    refresh: require('./_lib/session/refresh'),
};

module.exports = async function handler(req, res) {
    let subpath = req.query && req.query.subpath;
    if (!subpath && req.url) {
        const pathname = req.url.split('?')[0];
        const match = pathname.match(/^\/api\/session\/?(.*)$/);
        if (match && match[1]) {
            subpath = match[1];
        }
    }

    if (Array.isArray(subpath)) {
        subpath = subpath.join('/');
    }
    subpath = String(subpath || '').trim();

    if (!subpath || subpath === 'index') {
        return await handlers.index(req, res);
    }

    const targetHandler = handlers[subpath];
    if (typeof targetHandler === 'function') {
        return await targetHandler(req, res);
    }

    return res.status(404).json({ error: `Session route '/${subpath}' not found` });
};
