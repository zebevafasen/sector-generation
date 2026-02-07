const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIRS = ['js', 'names/system_names'];

function listJsFiles(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...listJsFiles(fullPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

function collectExportedSymbols(text) {
    const symbols = new Set();
    const namedExportDecl = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
    let match;
    while ((match = namedExportDecl.exec(text))) {
        symbols.add(match[1]);
    }

    const exportList = /export\s*\{([^}]+)\}/g;
    while ((match = exportList.exec(text))) {
        const names = match[1].split(',').map(part => part.trim()).filter(Boolean);
        for (const raw of names) {
            const [left] = raw.split(/\s+as\s+/);
            if (left) symbols.add(left.trim());
        }
    }

    return [...symbols];
}

const filePaths = TARGET_DIRS
    .map((dir) => path.join(ROOT, dir))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => listJsFiles(dir));

const files = filePaths.map((fullPath) => ({
    fullPath,
    relPath: path.relative(ROOT, fullPath).replace(/\\/g, '/'),
    text: fs.readFileSync(fullPath, 'utf8')
}));

const exported = [];
for (const file of files) {
    const names = collectExportedSymbols(file.text);
    for (const name of names) {
        exported.push({ file: file.relPath, name });
    }
}

function countReferences(symbolName) {
    const escaped = symbolName.replace(/[$]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
    let count = 0;
    for (const file of files) {
        const matches = file.text.match(pattern);
        if (matches) count += matches.length;
    }
    return count;
}

const unused = exported.filter((entry) => countReferences(entry.name) <= 1);

if (unused.length) {
    console.error('Unused exports found:');
    for (const item of unused.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))) {
        console.error(`- ${item.file}: ${item.name}`);
    }
    process.exit(1);
}

console.log('No unused exports found.');
