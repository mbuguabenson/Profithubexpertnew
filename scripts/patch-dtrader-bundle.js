const fs = require('fs');
const path = require('path');

const dtraderJsDir = path.resolve(__dirname, '..', 'public', 'dtrader', 'js');

if (!fs.existsSync(dtraderJsDir)) {
    console.log('ℹ️ DTrader js directory not found, skipping bundle patch.');
    return;
}

// 1. Patch core.main~A (socket_base and BinarySocket)
const mainAPath = path.join(dtraderJsDir, 'core.main~A.f3f000ad5ccf319ed8e3.js');
if (fs.existsSync(mainAPath)) {
    let codeA = fs.readFileSync(mainAPath, 'utf8');
    let modA = false;

    if (!codeA.includes('window.BinarySocket = proxied_socket_base;')) {
        const oldSocketExport = `module.exports = proxied_socket_base;\\nmodule.exports.default = proxied_socket_base;`;
        const newSocketExport = `module.exports = proxied_socket_base;\\nmodule.exports.default = proxied_socket_base;\\nif (typeof __webpack_exports__ !== 'undefined') { __webpack_exports__.default = proxied_socket_base; Object.assign(__webpack_exports__, proxied_socket_base); }\\nif (typeof window !== 'undefined') { window.BinarySocket = proxied_socket_base; }`;
        if (codeA.includes(oldSocketExport)) {
            codeA = codeA.replace(oldSocketExport, newSocketExport);
            modA = true;
            console.log('✅ Patched socket_base.js export in core.main~A');
        }
    }

    const patterns = [
        `const BinarySocket = __webpack_require__(/*! ./socket_base */ \\"./_common/base/socket_base.js\\");`,
        `const BinarySocket = __webpack_require__(/*! ./socket_base */ "./_common/base/socket_base.js");`,
        `const BinarySocket = require('./socket_base');`,
        `const BinarySocket = require(\\'./socket_base\\');`,
    ];

    patterns.forEach((pattern, idx) => {
        if (codeA.includes(pattern)) {
            const replacement = `let BinarySocket = __webpack_require__(/*! ./socket_base */ \\"./_common/base/socket_base.js\\"); if (BinarySocket && !BinarySocket.init && BinarySocket.default) BinarySocket = BinarySocket.default; if (!BinarySocket || !BinarySocket.init) BinarySocket = (typeof window !== 'undefined' ? window.BinarySocket : null) || BinarySocket;`;
            codeA = codeA.split(pattern).join(replacement);
            modA = true;
            console.log(`✅ Patched BinarySocket require pattern ${idx} in core.main~A`);
        }
    });

    if (modA) {
        fs.writeFileSync(mainAPath, codeA, 'utf8');
        console.log('🎉 Successfully saved core.main~A changes');
    }
}

// 2. Patch publicPath in all bundles in public/dtrader/js
const files = fs.readdirSync(dtraderJsDir);
files.forEach(file => {
    if (!file.endsWith('.js')) return;
    const fullPath = path.join(dtraderJsDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    let mod = false;

    // Pattern 1: __webpack_require__.p = "/";
    const pPattern1 = '__webpack_require__.p = "/";';
    const pReplacement1 =
        '__webpack_require__.p = (typeof window !== "undefined" && window.__webpack_public_path__) || "/dtrader/";';
    if (content.includes(pPattern1)) {
        content = content.split(pPattern1).join(pReplacement1);
        mod = true;
        console.log(`✅ Patched __webpack_require__.p in ${file}`);
    }

    // Pattern 2: __webpack_require__.p = "";
    const pPattern2 = '__webpack_require__.p = "";';
    if (content.includes(pPattern2)) {
        content = content.split(pPattern2).join(pReplacement1);
        mod = true;
        console.log(`✅ Patched empty __webpack_require__.p in ${file}`);
    }

    if (mod) {
        fs.writeFileSync(fullPath, content, 'utf8');
    }
});

console.log('🎉 Patch script finished successfully.');
