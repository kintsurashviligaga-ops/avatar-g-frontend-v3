/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-nocheck

const fs = require('node:fs');
const path = require('node:path');

const locales = ['ka', 'en', 'ru'];
const files = locales.map((locale) => ({
  locale,
  filePath: path.join(process.cwd(), 'messages', `${locale}.json`),
}));

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function collectLeafPaths(obj, prefix = '', output = new Set()) {
  if (Array.isArray(obj)) {
    obj.forEach((value, index) => {
      collectLeafPaths(value, `${prefix}[${index}]`, output);
    });
    return output;
  }

  if (obj && typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      collectLeafPaths(value, next, output);
    });
    return output;
  }

  output.add(prefix);
  return output;
}

function setDifference(left, right) {
  const out = [];
  left.forEach((value) => {
    if (!right.has(value)) {
      out.push(value);
    }
  });
  return out;
}

function main() {
  const maps = files.map(({ locale, filePath }) => ({
    locale,
    filePath,
    json: readJson(filePath),
  }));

  const base = maps[0];
  if (!base) {
    throw new Error('No locale files configured for parity check');
  }

  const basePaths = collectLeafPaths(base.json);

  let hasErrors = false;

  maps.forEach(({ locale, json }) => {
    const currentPaths = collectLeafPaths(json);
    const missingFromCurrent = setDifference(basePaths, currentPaths);
    const extraInCurrent = setDifference(currentPaths, basePaths);

    if (missingFromCurrent.length || extraInCurrent.length) {
      hasErrors = true;
      console.error(`\n[i18n-parity] ${locale} mismatches:`);

      if (missingFromCurrent.length) {
        console.error('  Missing keys:');
        missingFromCurrent.sort().forEach((key) => console.error(`    - ${key}`));
      }

      if (extraInCurrent.length) {
        console.error('  Extra keys:');
        extraInCurrent.sort().forEach((key) => console.error(`    - ${key}`));
      }
    }
  });

  if (hasErrors) {
    process.exitCode = 1;
    return;
  }

  console.log('[i18n-parity] OK');
}

main();
