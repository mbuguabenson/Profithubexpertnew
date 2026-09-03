const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const mappings = {
    'trader-app-v2': {
        from: 'trader.trader-app-v2.785c684e870d9f2e8cb9.js',
        to: 'trader.trader-app-v2.b800b64de835a4ec4d38.js',
    },
    'default-src_Modules_Contract_Components_ContractAudit_positions-helper_ts-src_Modules_SmartCh-142c9a': {
        from: 'trader.default-src_Modules_Contract_Components_ContractAudit_positions-helper_ts-src_Modules_SmartCh-142c9a.0d4c038ac64fd936a64e.js',
        to: 'trader.default-src_Modules_Contract_Components_ContractAudit_positions-helper_ts-src_Modules_SmartCh-142c9a.911c112b71dfd24cd92d.js',
    },
    'trader-trade-api-v2_src_A': {
        from: 'trader.trader-trade-api-v2_src_A.007ef2da6bc0fa0d425b.js',
        to: 'trader.trader-trade-api-v2_src_A.8995bd7ea32a7726e8a8.js',
    },
    'trader-trade-c': {
        from: 'trader.trader-trade-c.4018a287fe9ce4a9f4f1.js',
        to: 'trader.trader-trade-c.fda33a8c78e5d9fda209.js',
    },
    'trader-positions': {
        from: 'trader.trader-positions.68da801bc5c6adfc4a53.js',
        to: 'trader.trader-positions.88b9f3c103650836c9e2.js',
    },
    'trader-contract-v1': {
        from: 'trader.trader-contract-v1.daf03c83716a8d0bf2c5.js',
        to: 'trader.trader-contract-v1.20e279c2415cfa6604d9.js',
    },
    'trader-contract-details': {
        from: 'trader.trader-contract-details.3270fbb56681ff9942fa.js',
        to: 'trader.trader-contract-details.ae54ad44c583fa867b69.js',
    },
    'accumulators-trade-description': {
        from: 'trader.accumulators-trade-description.9f197a4eac31a2e7fdda.js',
        to: 'trader.accumulators-trade-description.1e03c610064436cbb83f.js',
    },
    'multipliers-trade-description': {
        from: 'trader.multipliers-trade-description.64a857d20042577b411f.js',
        to: 'trader.multipliers-trade-description.380fd82377d6d61f90ee.js',
    },
    'vanillas-trade-description': {
        from: 'trader.vanillas-trade-description.0cfa71193f03102af392.js',
        to: 'trader.vanillas-trade-description.217bc120c77947fa994a.js',
    },
    'turbos-trade-description': {
        from: 'trader.turbos-trade-description.8c77b8fe07f59c715f25.js',
        to: 'trader.turbos-trade-description.06fd394d70c4249e47a8.js',
    },
    'rise-fall-trade-description': {
        from: 'trader.rise-fall-trade-description.15327d16d08bb9672b60.js',
        to: 'trader.rise-fall-trade-description.6a39aefa7edd6720644b.js',
    },
    'higher-lower-trade-description': {
        from: 'trader.higher-lower-trade-description.450bc88a6ae06cee8323.js',
        to: 'trader.higher-lower-trade-description.44477b68e131816c25c9.js',
    },
    'touch-no-touch-trade-description': {
        from: 'trader.touch-no-touch-trade-description.93e7bdcf1965323c3c25.js',
        to: 'trader.touch-no-touch-trade-description.ad0a740d9b737e4815a9.js',
    },
    'matches-differs-trade-description': {
        from: 'trader.matches-differs-trade-description.0926645791a5af5980cc.js',
        to: 'trader.matches-differs-trade-description.76a81237b283ce72661e.js',
    },
    'even-odd-trade-description': {
        from: 'trader.even-odd-trade-description.149d4a338ba5dfbf5256.js',
        to: 'trader.even-odd-trade-description.a1f818c6748587c1911a.js',
    },
    'over-under-trade-description': {
        from: 'trader.over-under-trade-description.0bff87fb3a8defb99d0d.js',
        to: 'trader.over-under-trade-description.016c71b06210a375493f.js',
    },
};

const traderDirs = [
    path.join(rootDir, 'public', 'trader', 'js'),
    path.join(rootDir, 'public', 'dtrader', 'trader', 'js'),
    path.join(rootDir, 'dist', 'trader', 'js'),
    path.join(rootDir, 'dist', 'dtrader', 'trader', 'js'),
];

traderDirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;

    Object.values(mappings).forEach(({ from, to }) => {
        const srcFile = path.join(dir, from);
        const destFile = path.join(dir, to);

        if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
            fs.copyFileSync(srcFile, destFile);
            console.log(`✅ Created alias: ${to}`);
        } else if (!fs.existsSync(srcFile) && fs.existsSync(destFile)) {
            fs.copyFileSync(destFile, srcFile);
            console.log(`✅ Created reverse alias: ${from}`);
        }
    });
});

console.log('🎉 All chunk aliases created successfully.');
