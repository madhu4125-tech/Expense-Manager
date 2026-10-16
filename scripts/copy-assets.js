const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
const fa = path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free');

fs.mkdirSync(path.join(www, 'fa', 'css'), { recursive: true });
fs.copyFileSync(path.join(root, 'src', 'index.html'), path.join(www, 'index.html'));
fs.copyFileSync(path.join(fa, 'css', 'all.min.css'), path.join(www, 'fa', 'css', 'all.min.css'));
fs.cpSync(path.join(fa, 'webfonts'), path.join(www, 'fa', 'webfonts'), { recursive: true });
console.log('Assets copied to www/');
