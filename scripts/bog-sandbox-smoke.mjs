#!/usr/bin/env node
/**
 * scripts/bog-sandbox-smoke.mjs — the first contact with Bank of Georgia's SANDBOX, step by step, from a terminal.
 * SANDBOX ONLY: it refuses to run unless BOG_ENV=sandbox, and it only ever talks to the *-sandbox.bog.ge hosts, so
 * no real card can be charged. Nothing touches our database.
 *
 *   node --env-file=.env.sandbox.local scripts/bog-sandbox-smoke.mjs [oauth|order|receipt <id>]
 *   (.env.sandbox.local: BOG_ENV=sandbox, BOG_CLIENT_ID, BOG_SECRET_KEY = the SANDBOX pair; gitignored. A secret typed on
 *   the command line lands in shell history.)
 *
 *   oauth    (default) one token request — proves the sandbox credential pair
 *   order    creates a 1.00 ₾ sandbox order and prints the payment-page URL; pay it with a test card from
 *            https://api.bog.ge/docs/en/sandbox/payments/test-cards, then run `receipt <id>`
 *   receipt  prints the order's state as our settlement code would read it
 *
 * ⚠️ A SANDBOX ORDER NEVER POINTS AT PRODUCTION. Every deployment of ours — myavatar.ge and every *.vercel.app
 * Preview — writes to the Production database, so none of them may receive a sandbox callback or return. The order's
 * callback and return links go to https://bog-sandbox-smoke.invalid (a reserved name that never resolves: BOG's
 * callback goes nowhere, and after paying the browser lands on a page that does not open — run `receipt <id>`), its
 * id starts with `sandbox-smoke-` (isBogOrderId never accepts it), and anything that would point at production is
 * refused before the first request.
 *
 *   BOG_SANDBOX_RETURN_BASE   another https origin for the callback + return links (e.g. a tunnel to a local dev
 *                             server that runs on its own database); refused for myavatar.ge, *.myavatar.ge,
 *                             *.vercel.app and the host of NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL / VERCEL_URL.
 *   BOG_SANDBOX_OAUTH_URL,    loopback-only overrides of the sandbox hosts, for this script's own tests.
 *   BOG_SANDBOX_API_URL
 *
 * Credentials come from the environment only and are never printed. Exit code: 0 ok, 1 BOG refused, 2 usage/refused.
 */
import { randomBytes, randomUUID } from 'node:crypto';

export const SANDBOX_OAUTH_URL = 'https://oauth2-sandbox.bog.ge/auth/realms/bog/protocol/openid-connect/token';
export const SANDBOX_API_URL = 'https://api-sandbox.bog.ge/payments/v1';
export const DEFAULT_RETURN_BASE = 'https://bog-sandbox-smoke.invalid';
export const SANDBOX_ORDER_PREFIX = 'sandbox-smoke-';

class UsageError extends Error {}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export const isLoopback = (hostname) => LOOPBACK.has(String(hostname).toLowerCase());

function hostOf(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

/** Is this a host whose deployment writes to the Production database? */
export function isProductionHost(hostname, env = process.env) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (h === 'myavatar.ge' || h.endsWith('.myavatar.ge') || h === 'vercel.app' || h.endsWith('.vercel.app')) return true;
  const ours = [env.NEXT_PUBLIC_SITE_URL, env.NEXT_PUBLIC_APP_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL].map(hostOf);
  return ours.includes(h);
}

function loopbackOverride(raw, fallback, name) {
  const v = String(raw || '').trim();
  if (!v) return fallback;
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new UsageError(`${name} is not a URL.`);
  }
  if (!isLoopback(u.hostname)) {
    throw new UsageError(`Refusing: ${name} may only point at this machine (tests). This script talks to BOG's sandbox hosts only.`);
  }
  return u.href.replace(/\/+$/, '');
}

function returnBase(raw, env) {
  const v = String(raw || '').trim();
  if (!v) return DEFAULT_RETURN_BASE;
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new UsageError('BOG_SANDBOX_RETURN_BASE is not a URL.');
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLoopback(u.hostname))) {
    throw new UsageError('BOG_SANDBOX_RETURN_BASE must be https (http only for localhost).');
  }
  if (isProductionHost(u.hostname, env)) {
    throw new UsageError(
      `Refusing: ${u.hostname} runs on the Production database — a sandbox order must not call it. ` +
        'Leave BOG_SANDBOX_RETURN_BASE unset (callbacks then go nowhere) or use a server with its own database.',
    );
  }
  return u.origin;
}

/** Where the script may talk and what its orders may point at. Throws (exit 2) before any request. */
export function sandboxTargets(env = process.env) {
  if (String(env.BOG_ENV || '').trim().toLowerCase() !== 'sandbox') {
    throw new UsageError('Refusing: set BOG_ENV=sandbox (this script never talks to the live BOG API).');
  }
  return {
    oauthUrl: loopbackOverride(env.BOG_SANDBOX_OAUTH_URL, SANDBOX_OAUTH_URL, 'BOG_SANDBOX_OAUTH_URL'),
    apiUrl: loopbackOverride(env.BOG_SANDBOX_API_URL, SANDBOX_API_URL, 'BOG_SANDBOX_API_URL'),
    returnBase: returnBase(env.BOG_SANDBOX_RETURN_BASE, env),
  };
}

/** Our id for a sandbox order: never `myavatar-…`, so no settlement code of ours would ever look it up. */
export const newSandboxOrderId = () => `${SANDBOX_ORDER_PREFIX}${Date.now().toString(16)}${randomBytes(3).toString('hex')}`;

/** The 1 ₾ order body. Re-checks every link it carries, so nothing that points at production is ever sent. */
export function sandboxOrderBody(base, externalOrderId, env = process.env) {
  const body = {
    callback_url: `${base}/api/billing/bog/webhook`,
    external_order_id: externalOrderId,
    capture: 'automatic',
    purchase_units: {
      currency: 'GEL',
      total_amount: 1,
      basket: [{ product_id: 'sandbox-smoke', description: 'MyAvatar sandbox smoke', quantity: 1, unit_price: 1 }],
    },
    redirect_urls: { success: `${base}/ka/dashboard?bog=sandbox&pay=success`, fail: `${base}/ka/dashboard?bog=sandbox&pay=failed` },
    ttl: 30,
  };
  for (const link of [body.callback_url, body.redirect_urls.success, body.redirect_urls.fail]) {
    if (isProductionHost(hostOf(link), env)) throw new UsageError(`Refusing: ${link} points at production.`);
  }
  if (!externalOrderId.startsWith(SANDBOX_ORDER_PREFIX)) throw new UsageError('Refusing: sandbox order ids start with sandbox-smoke-.');
  return body;
}

/**
 * Remove every form a secret can come back in — verbatim, JSON-escaped, URL-encoded, base64 (an echoed Basic header) —
 * plus anything shaped like a token, then flatten whitespace.
 */
export function scrubSecrets(text, secrets) {
  let t = String(text);
  for (const s of secrets) {
    if (!s) continue;
    for (const form of new Set([s, JSON.stringify(s).slice(1, -1), encodeURIComponent(s), Buffer.from(s).toString('base64')])) {
      t = t.split(form).join('[redacted]');
    }
  }
  return t
    .replace(/"(access_token|refresh_token|id_token)"\s*:\s*"[^"]*"/g, '"$1":"[hidden]"')
    .replace(/eyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g, '[token]')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function main(argv = process.argv.slice(2), env = process.env, out = console) {
  let t;
  try {
    t = sandboxTargets(env);
  } catch (e) {
    out.error(e.message);
    return 2;
  }
  const [cmd = 'oauth', arg] = argv;
  if (!['oauth', 'order', 'receipt'].includes(cmd) || (cmd === 'receipt' && !arg)) {
    out.error('usage: node scripts/bog-sandbox-smoke.mjs [oauth | order | receipt <bog order id>]');
    return 2;
  }
  const id = String(env.BOG_CLIENT_ID || '').trim();
  const secret = String(env.BOG_SECRET_KEY || '').trim();
  if (!id || !secret) {
    out.error('Set BOG_CLIENT_ID and BOG_SECRET_KEY (the SANDBOX pair from BOG).');
    return 2;
  }
  const scrub = (text) => scrubSecrets(text, [secret, `${id}:${secret}`]).slice(0, 300);

  try {
    const res = await fetch(t.oauthUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`OAuth refused: HTTP ${res.status} ${scrub(text)}`);
    const tok = JSON.parse(text).access_token;
    if (!tok) throw new Error('OAuth answered without access_token');
    out.log('✓ OAuth: BOG sandbox accepts this client id + secret.');

    if (cmd === 'order') {
      const external = newSandboxOrderId();
      const body = sandboxOrderBody(t.returnBase, external, env);
      const r = await fetch(`${t.apiUrl}/ecommerce/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tok}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Language': 'ka',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const rt = await r.text();
      if (!r.ok) throw new Error(`Order refused: HTTP ${r.status} ${scrub(rt)}`);
      const j = JSON.parse(rt);
      out.log(`✓ Order created: ${j.id} (ours: ${external})`);
      out.log(`  Callback + return links: ${t.returnBase} (never our Production site)`);
      out.log(`  Pay with a sandbox test card: ${j._links?.redirect?.href}`);
      if (t.returnBase === DEFAULT_RETURN_BASE) out.log('  After paying, the browser lands on a page that does not open — that is expected.');
      out.log(`  Then: node scripts/bog-sandbox-smoke.mjs receipt ${j.id}`);
    } else if (cmd === 'receipt') {
      const r = await fetch(`${t.apiUrl}/receipt/${encodeURIComponent(arg)}`, {
        headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      const rt = await r.text();
      if (!r.ok) throw new Error(`Receipt refused: HTTP ${r.status} ${scrub(rt)}`);
      const j = JSON.parse(rt);
      const pu = j.purchase_units ?? {};
      out.log(
        `✓ status=${j.order_status?.key} amount=${pu.request_amount}/${pu.transfer_amount} refund=${pu.refund_amount ?? '-'} ` +
          `${pu.currency_code} method=${j.payment_detail?.transfer_method?.key ?? '-'} code=${j.payment_detail?.code ?? '-'}`,
      );
    }
    return 0;
  } catch (e) {
    out.error(`✗ ${e instanceof UsageError ? e.message : scrub(e instanceof Error ? e.message : e)}`);
    return e instanceof UsageError ? 2 : 1;
  }
}

if (/bog-sandbox-smoke\.mjs$/.test(process.argv[1] || '')) {
  main().then((code) => process.exit(code));
}
