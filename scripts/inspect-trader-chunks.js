const fs = require('fs');
const path = require('path');

const filePath = path.resolve('public/dtrader/js/core.trader.58b05109c135eb885660.js');
const code = fs.readFileSync(filePath, 'utf8');

console.log('File size:', code.length);

const traderAppMatch = code.match(/trader-app-v2[^\\]*?\\":\\"[a-f0-9]+/g);
console.log('traderAppMatch:', traderAppMatch);

const getJsChunkMatch = code.match(/trader\/js\/trader\.[^;]+/g);
console.log('getJsChunkMatch:', getJsChunkMatch);

const getCssChunkMatch = code.match(/trader\/css\/trader\.[^;]+/g);
console.log('getCssChunkMatch:', getCssChunkMatch);
