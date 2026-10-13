#!/usr/bin/env node
/**
 * scripts/bog-production-smoke.mjs — read-only smoke of the Bank of Georgia surface on a deployed site, right after a
 * deploy (docs/handoffs/bog-payments/BOG_PAYMENT_RELEASE_CHECKLIST.md, "Production Smoke").
 *
 * Every request is anonymous: no cookie, no credential, no Callback-Signature. So nothing is bought, no order row is
 * created and nothing is written (the checkout refuses before reading the body, the unsigned callback is refused
 * before it is parsed). One line per check; exit 1 if any check fails.
 *
 *   node scripts/bog-production-smoke.mjs [base_url] [--expect-bog=false|true]
 *
 *   base_url      default https://myavatar.ge. Only https on myavatar.ge, www.myavatar.ge or *.vercel.app, or http on
 *                 this machine (tests), is accepted.
 *   --expect-bog  what anonymous /api/checkout/capabilities must answer for `bog`: false (default) while
 *                 BOG_CHECKOUT_MODE=admin or off; true only once BOG checkout is public.
 *
 * In GitHub Actions: .github/workflows/bog-production-smoke.yml (manual run, no secrets).
 */
export const DEFAULT_BASE = 'https://myavatar.ge';
const TIMEOUT_MS = 20_000;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The base URL, or a thrown Error saying why it is refused. Never a path, query or credentials. */
export function smokeBase(raw = DEFAULT_BASE) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new Error(`not a URL: ${raw}`);
  }
  if (u.username || u.password) throw new Error('credentials in the URL are refused');
  const host = u.hostname.toLowerCase();
  const allowed =
    (u.protocol === 'https:' && (host === 'myavatar.ge' || host === 'www.myavatar.ge' || /^[a-z0-9-]+\.vercel\.app$/.test(host))) ||
    (u.protocol === 'http:' && LOOPBACK.has(host));
  if (!allowed) throw new Error(`refused base ${u.origin}: https on myavatar.ge / *.vercel.app, or http on this machine only`);
  return u.origin;
}

export function parseArgs(argv) {
  let base = DEFAULT_BASE;
  let expectBog = false;
  for (const a of argv) {
    if (a.startsWith('--expect-bog=')) {
      const v = a.slice('--expect-bog='.length).trim().toLowerCase();
      if (v !== 'true' && v !== 'false') throw new Error('--expect-bog must be true or false');
      expectBog = v === 'true';
    } else if (a.startsWith('--')) {
      throw new Error(`unknown option ${a}`);
    } else {
      base = a;
    }
  }
  return { base: smokeBase(base), expectBog };
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** Each check: one anonymous request and the statuses that mean "refused / healthy". */
export const CHECKS = [
  { name: 'home KA', method: 'GET', path: '/ka', expect: [200] },
  { name: 'home EN', method: 'GET', path: '/en', expect: [200] },
  { name: 'home RU', method: 'GET', path: '/ru', expect: [200] },
  {
    name: 'capabilities, anonymous',
    method: 'GET',
    path: '/api/checkout/capabilities',
    expect: [200],
    verify: (json, { expectBog }) =>
      json && typeof json.bog === 'boolean' ? (json.bog === expectBog ? null : `bog is ${json.bog}, expected ${expectBog}`) : 'no boolean `bog` in the answer',
  },
  // An empty body: even if authentication ever failed open, there is nothing to price and no order to create.
  { name: 'checkout, anonymous', method: 'POST', path: '/api/billing/bog/checkout', body: '{}', expect: [401] },
  // 503 here means the deployment has no BOG credentials (BOG_UNCONFIGURED), which is a failure after a release.
  { name: 'callback, unsigned', method: 'POST', path: '/api/billing/bog/webhook', body: '{}', expect: [401] },
  { name: 'order status, anonymous', method: 'GET', path: `/api/billing/bog/orders/${ZERO_UUID}`, expect: [401] },
  { name: 'admin readiness, anonymous', method: 'GET', path: '/api/admin/billing/bog', expect: [401, 403] },
  { name: 'cron, no CRON_SECRET', method: 'GET', path: '/api/cron/bog-billing', expect: [401, 403] },
];

function snippet(text, contentType) {
  if (/json/i.test(contentType || '')) return text.replace(/\s+/g, ' ').slice(0, 160);
  return `${(contentType || 'body').split(';')[0]} (${Buffer.byteLength(text)} bytes)`;
}

/** Runs every check in order against `base`. Never throws: a network error is a failed check. */
export async function runSmoke(base, { expectBog = false, fetchImpl = fetch, checks = CHECKS } = {}) {
  const results = [];
  for (const c of checks) {
    const headers = { Accept: c.method === 'GET' && !c.path.startsWith('/api/') ? 'text/html' : 'application/json' };
    if (c.body !== undefined) headers['Content-Type'] = 'application/json';
    let status = 0;
    let detail = '';
    let problem = null;
    try {
      const res = await fetchImpl(`${base}${c.path}`, {
        method: c.method,
        headers,
        body: c.body,
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      const text = await res.text();
      const contentType = res.headers.get('content-type') || '';
      detail = snippet(text, contentType);
      if (!c.expect.includes(status)) problem = `HTTP ${status}, expected ${c.expect.join(' or ')}`;
      else if (c.verify) {
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* verify reports the missing field */
        }
        problem = c.verify(json, { expectBog });
      }
    } catch (e) {
      problem = `no answer (${e instanceof Error ? e.name : 'error'})`;
    }
    results.push({ name: c.name, method: c.method, path: c.path, status, ok: problem === null, problem, detail });
  }
  return results;
}

export function formatResults(base, results, { expectBog }) {
  const lines = [`BOG smoke · ${base} · ${new Date().toISOString()} · expect bog=${expectBog}`];
  for (const r of results) {
    lines.push(`${r.ok ? 'PASS' : 'FAIL'}  ${r.method.padEnd(4)} ${r.path}  ${r.status || '---'}  ${r.problem ? `${r.problem} · ` : ''}${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  lines.push(failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed`);
  return lines.join('\n');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : e}`);
    return 2;
  }
  const results = await runSmoke(opts.base, { expectBog: opts.expectBog });
  console.log(formatResults(opts.base, results, opts));
  return results.every((r) => r.ok) ? 0 : 1;
}

if (/bog-production-smoke\.mjs$/.test(process.argv[1] || '')) {
  main().then((code) => process.exit(code));
}
