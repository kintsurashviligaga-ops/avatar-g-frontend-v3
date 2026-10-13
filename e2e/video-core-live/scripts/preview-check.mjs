#!/usr/bin/env node
/**
 * FAIL-CLOSED check of the Vercel Preview before the Preview E2E writes anything through it
 * (.github/workflows/video-core-preview-e2e.yml). Exits non-zero unless all of these hold:
 *   1. the deployment answers on its per-run alias and is served by Vercel;
 *   2. its browser code names THIS run's tunnel as the Supabase URL and never names the Production project;
 *   3. its server accepts a token that only this run's stack can have signed (GET /api/credits/balance → 200) and
 *      refuses the same call without one (401): the server talks to this run's stack, not to Production.
 * Prints and writes booleans and counts only: never a key, a token or the tunnel's address.
 * env: PREVIEW_URL, TUNNEL_URL, PROBE_TOKEN, EVIDENCE_FILE (optional)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PRODUCTION_REF = 'zwksnayknzggdcenqqxy';
const base = (process.env.PREVIEW_URL ?? '').replace(/\/$/, '');
const tunnelHost = (() => { try { return new URL(process.env.TUNNEL_URL ?? '').host; } catch { return ''; } })();
const token = process.env.PROBE_TOKEN ?? '';
if (!/^https:\/\/vcore-e2e-[0-9a-f]{12}\.vercel\.app$/.test(base) || !tunnelHost.endsWith('.trycloudflare.com') || !token) {
  console.error('preview-check: PREVIEW_URL, TUNNEL_URL and PROBE_TOKEN are required');
  process.exit(64);
}

const fail = (why) => { console.error(`preview-check: REFUSED — ${why}`); process.exit(1); };
const get = async (path, init) => fetch(`${base}${path}`, { redirect: 'manual', ...init, signal: AbortSignal.timeout(30_000) });

const evidence = { servedByVercel: false, pagesChecked: 0, chunksChecked: 0, tunnelInBrowserCode: false, productionRefInBrowserCode: false, balanceWithoutToken: 0, balanceWithRunToken: 0 };

for (const page of ['/en', '/en/studio']) {
  const res = await get(page, { redirect: 'follow' });
  if (res.status !== 200) fail(`${page} answered HTTP ${res.status}`);
  if (res.headers.get('x-vercel-id')) evidence.servedByVercel = true;
  const html = await res.text();
  evidence.pagesChecked += 1;
  if (html.includes(PRODUCTION_REF)) evidence.productionRefInBrowserCode = true;
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s)]+?\.js/g)].map((m) => m[0]))];
  for (const chunk of chunks) {
    const js = await (await get(chunk)).text();
    evidence.chunksChecked += 1;
    if (js.includes(tunnelHost)) evidence.tunnelInBrowserCode = true;
    if (js.includes(PRODUCTION_REF)) evidence.productionRefInBrowserCode = true;
  }
}

evidence.balanceWithoutToken = (await get('/api/credits/balance')).status;
evidence.balanceWithRunToken = (await get('/api/credits/balance', { headers: { Authorization: `Bearer ${token}` } })).status;

console.log(`preview-check: ${JSON.stringify(evidence)}`);
if (process.env.EVIDENCE_FILE) {
  mkdirSync(dirname(process.env.EVIDENCE_FILE), { recursive: true });
  writeFileSync(process.env.EVIDENCE_FILE, `${JSON.stringify({ ...evidence, checkedAt: new Date().toISOString() }, null, 2)}\n`);
}
if (!evidence.servedByVercel) fail('the alias is not served by Vercel');
if (evidence.productionRefInBrowserCode) fail('the browser code names the Production project');
if (!evidence.tunnelInBrowserCode) fail('the browser code does not name this run\'s tunnel');
if (evidence.balanceWithoutToken !== 401) fail(`an anonymous balance read answered ${evidence.balanceWithoutToken}, not 401`);
if (evidence.balanceWithRunToken !== 200) fail(`a token of this run's stack was not accepted (${evidence.balanceWithRunToken}); the server is not on this stack`);
console.log('preview-check: the Preview runs on this run\'s isolated stack only');
