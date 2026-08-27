const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');
const smartchartsDist = path.join(rootDir, 'node_modules', '@deriv-com', 'smartcharts-champion', 'dist');

const templateTraderDist = path.resolve('e:/Backup/dtrader-template/packages/trader/dist/trader');
const templateReportsDist = path.resolve('e:/Backup/dtrader-template/packages/reports/dist/reports');

function copySmartCharts(destBase) {
    if (!fs.existsSync(smartchartsDist)) {
        console.warn('⚠️ smartcharts-champion dist folder not found in node_modules');
        return;
    }
    const smartchartsTarget = path.join(destBase, 'js', 'smartcharts');
    fs.mkdirSync(smartchartsTarget, { recursive: true });

    // Copy entire smartcharts dist directory to js/smartcharts (including chart/, assets/, and all chunk files)
    fs.cpSync(smartchartsDist, smartchartsTarget, { recursive: true });

    // Also ensure top-level assets directory has smartcharts assets
    const assetsSrc = path.join(smartchartsDist, 'assets');
    const assetsTarget = path.join(destBase, 'assets');
    if (fs.existsSync(assetsSrc)) {
        fs.mkdirSync(assetsTarget, { recursive: true });
        fs.cpSync(assetsSrc, assetsTarget, { recursive: true });
    }
}

function copyModuleDist(srcPath, moduleName) {
    if (!fs.existsSync(srcPath)) {
        console.warn(`⚠️ ${moduleName} dist not found at:`, srcPath);
        return;
    }

    const targets = [
        path.join(publicDir, moduleName),
        path.join(publicDir, 'dtrader', moduleName),
        path.join(distDir, moduleName),
        path.join(distDir, 'dtrader', moduleName)
    ];

    targets.forEach(target => {
        fs.mkdirSync(target, { recursive: true });
        fs.cpSync(srcPath, target, { recursive: true });
    });
    console.log(`✅ Copied ${moduleName} chunks to all targets.`);
}

// 1. Copy smartcharts
copySmartCharts(publicDir);
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}
copySmartCharts(distDir);

// 2. Copy trader and reports module chunks
copyModuleDist(templateTraderDist, 'trader');
copyModuleDist(templateReportsDist, 'reports');

// 3. Ensure public/ bundle is patched
try {
    require('./patch-dtrader-bundle');
} catch (e) {
    console.warn('⚠️ Could not run patch-dtrader-bundle:', e);
}

// 4. Ensure all trader chunk aliases are in place
try {
    require('./align-trader-chunks');
} catch (e) {
    console.warn('⚠️ Could not run align-trader-chunks:', e);
}

// 5. Copy public/ (including dtrader static suite) to dist/
if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, distDir, { recursive: true });
}

console.log('✅ All static assets, trader chunks, and smartcharts copied successfully.');
