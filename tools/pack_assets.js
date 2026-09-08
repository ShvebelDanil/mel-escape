// Regenerates js/assets.js with the bottle texture as base64
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const b64 = fs.readFileSync(path.join(__dirname, 'bottle_trim.png')).toString('base64');
const out = "window.ASSETS = {\n  bottle: 'data:image/png;base64," + b64 + "'\n};\n";
fs.writeFileSync(path.join(root, 'js', 'assets.js'), out);
console.log('assets.js written:', out.length, 'bytes');
