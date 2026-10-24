#!/usr/bin/env node
/**
 * perf/report.mjs — prints perf-results/*.json as one markdown table (MASTER TASK v3.1 §4.1).
 *
 * Every row carries its environment, commit, payload, network, cache state and sample count beside p50/p95. A p95 from
 * fewer than 30 samples is marked, and so is every mock row: it is the app's own overhead, not a provider or
 * production number. Usage: node perf/report.mjs [results-dir]
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_P95_SAMPLES = 30;
const dir = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'perf-results');

let files = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
} catch {
  console.error(`No results in ${dir}. Run npm run perf:mock first.`);
  process.exit(1);
}

const results = files.flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');
const value = (r, v) => (r.unit === 'ms' ? `${v} ms` : String(v));
const spans = (s) => (s ? Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', ') : '');

const lines = [
  '| Interaction | Env | Commit | Payload | Network | Cache | n | p50 | p95 | Server spans (median ms) | Note |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((r) => {
    const p95 = r.samples < MIN_P95_SAMPLES ? `${value(r, r.p95)} (n<${MIN_P95_SAMPLES}, indicative)` : value(r, r.p95);
    return `| ${cell(r.interaction)} | ${cell(r.environment)} | ${cell(r.commit)} | ${cell(r.payload)} | ${cell(r.network)} | ${cell(r.cache)} | ${r.samples} | ${value(r, r.p50)} | ${cell(p95)} | ${cell(spans(r.spans))} | ${cell(r.note)} |`;
  }),
];
if (results.some((r) => r.environment === 'mock')) {
  lines.push('', '_mock: local server, stubbed provider and API latencies. App overhead only; not a provider or production number._');
}
console.log(lines.join('\n'));
