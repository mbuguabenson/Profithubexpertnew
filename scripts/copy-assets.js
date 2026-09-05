const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');
const smartchartsDist = path.join(rootDir, 'node_modules', '@deriv-com', 'smartcharts-champion', 'dist');

function copySmartCharts(destBase) {
    if (!fs.existsSync(smartchartsDist)) {
        console.warn('⚠️ smartcharts-champion dist folder not found in node_modules');
        return;
    }
    const smartchartsTarget = path.join(destBase, 'js', 'smartcharts');
    fs.mkdirSync(smartchartsTarget, { recursive: true });

    // Copy entire smartcharts dist directory to js/smartcharts (including chart/, assets/, and all chunk files)
    fs.cpSync(smartchartsDist, smartchartsTarget, { recursive: true });

    // The Flutter adapter resolves its async chunks from the bundle root in
    // RSBuild builds, so expose the generated SmartCharts chunks there too.
    for (const file of fs.readdirSync(smartchartsDist)) {
        if (file.endsWith('.smartcharts.js') || file.endsWith('.smartcharts.js.map')) {
            fs.copyFileSync(path.join(smartchartsDist, file), path.join(destBase, file));
        }
    }

    // Also ensure top-level assets directory has smartcharts assets
    const assetsSrc = path.join(smartchartsDist, 'assets');
    const assetsTarget = path.join(destBase, 'assets');
    if (fs.existsSync(assetsSrc)) {
        fs.mkdirSync(assetsTarget, { recursive: true });
        fs.cpSync(assetsSrc, assetsTarget, { recursive: true });
    }
}

// 1. Copy smartcharts
copySmartCharts(publicDir);
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}
copySmartCharts(distDir);

// 2. Copy public/ to dist/
if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, distDir, { recursive: true });
}

console.log('✅ All static assets and smartcharts copied successfully.');
