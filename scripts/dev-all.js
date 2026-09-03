const { spawn } = require('child_process');
const path = require('path');

// 1. Run build helpers synchronously first
try {
    require('./generate-manifest.js');
    require('./copy-assets.js');
} catch (err) {
    console.error('[Build Script Warning]', err.message);
}

console.log('🚀 Starting ProfitHub Backend API Server on port 4000...');
const backendProcess = spawn('node', [path.join(__dirname, '../api/server.js')], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: '4000' },
});

console.log('⚡ Starting ProfitHub Frontend Dev Server on port 8443...');
const frontendProcess = spawn('npx', ['rsbuild', 'dev', '-o'], {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(__dirname, '..'),
});

const terminate = () => {
    try {
        backendProcess.kill();
    } catch {}
    try {
        frontendProcess.kill();
    } catch {}
    process.exit();
};

process.on('SIGINT', terminate);
process.on('SIGTERM', terminate);
process.on('exit', terminate);
