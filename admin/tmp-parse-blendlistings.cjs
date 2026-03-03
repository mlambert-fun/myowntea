const fs = require('fs');
const parser = require('@babel/parser');
const src = fs.readFileSync('src/pages/BlendListings.tsx', 'utf8');
parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
console.log('babel_parse_ok');
