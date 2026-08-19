const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const smartchartsDist = path.join(rootDir, 'node_modules', '@deriv-com', 'smartcharts-champion', 'dist');

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// 1. Copy smartcharts JS/CSS into dist/js/smartcharts
const smartchartsTarget = path.join(distDir, 'js', 'smartcharts');
if (fs.existsSync(smartchartsDist)) {
    fs.mkdirSync(smartchartsTarget, { recursive: true });
    
    // Copy top-level files from smartcharts dist
    const files = fs.readdirSync(smartchartsDist);
    files.forEach(file => {
        const fullPath = path.join(smartchartsDist, file);
        if (fs.statSync(fullPath).isFile() && !file.endsWith('.LICENSE.txt')) {
            fs.copyFileSync(fullPath, path.join(smartchartsTarget, file));
        }
    });

    // Copy assets/
    const assetsSrc = path.join(smartchartsDist, 'assets');
    const assetsTarget = path.join(distDir, 'assets');
    if (fs.existsSync(assetsSrc)) {
        fs.cpSync(assetsSrc, assetsTarget, { recursive: true });
    }
}

// 2. Copy public/ to dist/
const publicDir = path.join(rootDir, 'public');
if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, distDir, { recursive: true });
}

console.log('✅ Static assets copied successfully to dist/');
