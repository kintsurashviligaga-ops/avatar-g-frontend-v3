#!/usr/bin/env node
/**
 * scripts/bog-sandbox-smoke.mjs — the first contact with Bank of Georgia's SANDBOX, step by step, from a terminal.
 * SANDBOX ONLY: it refuses to run unless BOG_ENV=sandbox, and it only ever talks to the *-sandbox.bog.ge hosts, so
 * no real card can be charged. Nothing touches our database.
 *
 *   BOG_ENV=sandbox BOG_CLIENT_ID=… BOG_SECRET_KEY=… node scripts/bog-sandbox-smoke.mjs [oauth|order|receipt <id>]
 *
 *   oauth    (default) one token request — proves the sandbox credential pair
 *   order    creates a 1.00 ₾ sandbox order and prints the payment-page URL; pay it with a test card from
 *            https://api.bog.ge/docs/en/sandbox/payments/test-cards, then run `receipt <id>`
 *   receipt  prints the order's state as our settlement code would read it
 *
 * Credentials come from the environment only and are never printed.
 */
const OAUTH = 'https://oauth2-sandbox.bog.ge/auth/realms/bog/protocol/openid-connect/token';
const API = 'https://api-sandbox.bog.ge/payments/v1';

if ((process.env.BOG_ENV || '').trim().toLowerCase() !== 'sandbox') {
  console.error('Refusing: set BOG_ENV=sandbox (this script never talks to the live BOG API).');
  process.exit(2);
}
const id = (process.env.BOG_CLIENT_ID || '').trim();
const secret = (process.env.BOG_SECRET_KEY || '').trim();
if (!id || !secret) {
  console.error('Set BOG_CLIENT_ID and BOG_SECRET_KEY (the SANDBOX pair from BOG).');
  process.exit(2);
}
const scrub = (t) => String(t).split(secret).join('[redacted]').replace(/\s+/g, ' ').slice(0, 300);

async function token() {
  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OAuth refused: HTTP ${res.status} ${scrub(text)}`);
  const j = JSON.parse(text);
  if (!j.access_token) throw new Error('OAuth answered without access_token');
  return j.access_token;
}

const [cmd = 'oauth', arg] = process.argv.slice(2);
try {
  const tok = await token();
  console.log('✓ OAuth: BOG sandbox accepts this client id + secret.');
  if (cmd === 'order') {
    const external = `myavatar-topup-sbx${Date.now().toString(16)}`;
    const res = await fetch(`${API}/ecommerce/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': 'ka', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        callback_url: 'https://myavatar.ge/api/billing/bog/webhook',
        external_order_id: external,
        capture: 'automatic',
        purchase_units: { currency: 'GEL', total_amount: 1, basket: [{ product_id: 'sandbox-smoke', description: 'MyAvatar sandbox smoke', quantity: 1, unit_price: 1 }] },
        redirect_urls: { success: 'https://myavatar.ge/ka/dashboard?bog=sandbox&pay=success', fail: 'https://myavatar.ge/ka/dashboard?bog=sandbox&pay=failed' },
        ttl: 30,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Order refused: HTTP ${res.status} ${scrub(text)}`);
    const j = JSON.parse(text);
    console.log(`✓ Order created: ${j.id} (ours: ${external})`);
    console.log(`  Pay with a sandbox test card: ${j._links?.redirect?.href}`);
    console.log(`  Then: node scripts/bog-sandbox-smoke.mjs receipt ${j.id}`);
  } else if (cmd === 'receipt') {
    if (!arg) throw new Error('usage: receipt <bog order id>');
    const res = await fetch(`${API}/receipt/${encodeURIComponent(arg)}`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Receipt refused: HTTP ${res.status} ${scrub(text)}`);
    const j = JSON.parse(text);
    console.log(`✓ status=${j.order_status?.key} amount=${j.purchase_units?.request_amount}/${j.purchase_units?.transfer_amount} ${j.purchase_units?.currency_code} method=${j.payment_detail?.transfer_method?.key ?? '-'} code=${j.payment_detail?.code ?? '-'}`);
  }
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
