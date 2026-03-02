const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

walkDir('c:/Projects/avatar-g-frontend-v3/app', function(filePath) {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('bg-[#050510]')) {
            content = content.replace(/bg-\[#050510\]/g, 'bg-transparent');
            fs.writeFileSync(filePath, content);
            console.log('Updated: ' + filePath);
        }
    }
});
