import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'lint-report.json');

if (!fs.existsSync(reportPath)) {
  console.error('lint-report.json not found. Run lint with JSON output first.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

function lineColToIndex(text, line, col) {
  const lines = text.split('\n');
  if (line < 1 || line > lines.length) return -1;
  let index = 0;
  for (let i = 0; i < line - 1; i++) index += lines[i].length + 1;
  return index + (col - 1);
}

function isWordChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch || '');
}

function replaceTokenAt(text, line, col, from, to) {
  const idx = lineColToIndex(text, line, col);
  if (idx < 0 || idx + from.length > text.length) return { text, changed: false };

  const direct = text.slice(idx, idx + from.length);
  const startSearch = Math.max(0, idx - 40);
  const endSearch = Math.min(text.length, idx + 120);

  const candidates = [];
  if (direct === from) candidates.push(idx);

  const segment = text.slice(startSearch, endSearch);
  let off = segment.indexOf(from);
  while (off !== -1) {
    candidates.push(startSearch + off);
    off = segment.indexOf(from, off + 1);
  }

  const unique = [...new Set(candidates)].sort((a, b) => Math.abs(a - idx) - Math.abs(b - idx));

  for (const pos of unique) {
    const before = text[pos - 1];
    const after = text[pos + from.length];
    if (isWordChar(before) || isWordChar(after)) continue;
    const nextText = text.slice(0, pos) + to + text.slice(pos + from.length);
    return { text: nextText, changed: true };
  }

  return { text, changed: false };
}

function extractUnusedName(message) {
  const m = message.match(/^'([^']+)' is (?:defined|assigned a value) but never used\./);
  return m ? m[1] : null;
}

let filesChanged = 0;
let fixes = 0;
let misses = 0;

for (const fileResult of report) {
  const rel = path.relative(root, fileResult.filePath);
  if (rel.startsWith('node_modules')) continue;
  const targeted = fileResult.messages.filter((m) =>
    m.ruleId === '@typescript-eslint/no-unused-vars' || m.ruleId === '@typescript-eslint/no-explicit-any'
  );
  if (targeted.length === 0) continue;
  if (!fs.existsSync(fileResult.filePath)) continue;

  let source = fs.readFileSync(fileResult.filePath, 'utf8');
  let changedThisFile = false;

  const sorted = [...targeted].sort((a, b) => b.line - a.line || b.column - a.column);

  for (const m of sorted) {
    if (m.ruleId === '@typescript-eslint/no-explicit-any') {
      const r = replaceTokenAt(source, m.line, m.column, 'any', 'unknown');
      if (r.changed) {
        source = r.text;
        changedThisFile = true;
        fixes++;
      } else {
        misses++;
      }
      continue;
    }

    const name = extractUnusedName(m.message);
    if (!name || name.startsWith('_')) continue;

    const r = replaceTokenAt(source, m.line, m.column, name, `_${name}`);
    if (r.changed) {
      source = r.text;
      changedThisFile = true;
      fixes++;
    } else {
      misses++;
    }
  }

  if (changedThisFile) {
    fs.writeFileSync(fileResult.filePath, source, 'utf8');
    filesChanged++;
  }
}

console.log(`filesChanged=${filesChanged}`);
console.log(`fixesApplied=${fixes}`);
console.log(`misses=${misses}`);
