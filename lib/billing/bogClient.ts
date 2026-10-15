/**
 * Bank of Georgia — Online Payments API client (api.bog.ge, the current generation).
 *
 * Everything the billing routes need, as small functions over an INJECTABLE fetch, so every flow is unit-testable
 * with zero network and zero secrets:
 *
 *   getBogAccessToken              OAuth2 client-credentials, cached until shortly before it expires
 *   createBogOrder                 POST /ecommerce/orders → the hosted payment page (currency is always GEL)
 *   saveCardForAutomaticPayments   PUT  /orders/:id/subscriptions — BEFORE the redirect; BOG saves the card on success
 *   chargeSavedCard                POST /ecommerce/orders/:parent/subscribe — a renewal; the amount is the parent's
 *   getBogReceipt                  GET  /receipt/:id — the authoritative order state (reconciles a lost callback)
 *   deleteSavedCard                DELETE /charges/card/:id — when a plan stops renewing
 *   verifyBogCallbackSignature     SHA256withRSA over the RAW callback body, against BOG's published key
 *
 * Verified against https://api.bog.ge/docs/en/payments on 2026-10-02 (append `.md` to any page for its source).
 * BOG_ENV=sandbox switches every host AND the callback key to the sandbox ones — test cards are listed at
 * /docs/en/sandbox/payments/test-cards.
 *
 * ⚠️ THIS FILE USED TO TARGET THE LEGACY iPay API (ipay.ge/opay … `intent: CAPTURE`, `shop_order_id`). Those
 * endpoints and that envelope are not what api.bog.ge accepts; nothing here is guessed any more.
 */
import 'server-only';
import { createHash, createVerify } from 'node:crypto';

export type BogEnvironment = 'production' | 'sandbox';

const HOSTS: Readonly<Record<BogEnvironment, { oauth: string; api: string }>> = {
  production: {
    oauth: 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token',
    api: 'https://api.bog.ge/payments/v1',
  },
  sandbox: {
    oauth: 'https://oauth2-sandbox.bog.ge/auth/realms/bog/protocol/openid-connect/token',
    api: 'https://api-sandbox.bog.ge/payments/v1',
  },
};

/**
 * BOG's PUBLISHED callback-signing keys (the docs' "Callback" page, live and sandbox). Public keys, not secrets —
 * shipping them means a deployment with only client id + secret can already verify callbacks, so there is no
 * "creds set, key forgotten → money in, never credited" state. BOG_CALLBACK_PUBLIC_KEY still overrides (rotation).
 */
export const BOG_PUBLISHED_CALLBACK_KEYS: Readonly<Record<BogEnvironment, string>> = {
  production: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQh
zHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0Q
1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTrr
TYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvhx
tcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/g
4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhPn
PwIDAQAB
-----END PUBLIC KEY-----`,
  sandbox: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqczfAuhtxw2iF68kS0Hy
bGSv0ZlDAjsXh6VC8avDl3Vxa9qCn6Pzl37Tl2Z21WodiISLeXdhCtOMTeLNUBeb
CYD31y2/MwnhLYqlCk2bOh29fyPc1iT5Eu/k/1IaNRrK9/UVZaTkhOMeEm+aL4y8
5XsE4UjqftEmwrAdbO2G4cCpuoMC9ZXG9gAdr2BFN6i2Vt9eCen5Poj7E1ik7s8T
GyzploVV0NflhwBGeWnvQANUQGr87gsP5k2JG1z5EwnMybJQ7i3XT726rJMaV6QW
sY5hP72Mtv1I1zL2d9FXm9FWOzbpcXCyxuEBXvqqOHzogri8C7KRRYKyk97Ri7D6
8wIDAQAB
-----END PUBLIC KEY-----`,
};

export interface BogConfig {
  readonly environment: BogEnvironment;
  readonly clientId: string;
  readonly secretKey: string;
  readonly oauthUrl: string;
  /** e.g. https://api.bog.ge/payments/v1 — no trailing slash. */
  readonly apiBase: string;
  /** PEM RSA public key BOG signs callbacks with. */
  readonly callbackPublicKey: string;
  /** Optional source-IP allowlist — an extra AND-gate on a signature-verified callback, never a substitute. */
  readonly callbackIpAllowlist: readonly string[];
}

/**
 * The BOG config from env, or null when the merchant credentials are absent — every caller then degrades cleanly
 * (checkout answers 503, the webhook refuses, nothing is charged).
 *
 *   BOG_CLIENT_ID, BOG_SECRET_KEY   required — from BOG's business manager
 *   BOG_ENV                         'production' (default) | 'sandbox'
 *   BOG_CALLBACK_PUBLIC_KEY         optional override of the published key (`\n`-escaped single line is fine)
 *   BOG_CALLBACK_IP_ALLOWLIST       optional, comma-separated
 *   BOG_API_BASE, BOG_OAUTH_URL     optional host overrides (tests, a BOG-announced migration)
 */
export function bogConfig(env: NodeJS.ProcessEnv = process.env): BogConfig | null {
  const clientId = env.BOG_CLIENT_ID?.trim();
  const secretKey = env.BOG_SECRET_KEY?.trim();
  if (!clientId || !secretKey) return null;
  const environment: BogEnvironment = env.BOG_ENV?.trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  const override = env.BOG_CALLBACK_PUBLIC_KEY?.trim();
  return {
    environment,
    clientId,
    secretKey,
    oauthUrl: env.BOG_OAUTH_URL?.trim() || HOSTS[environment].oauth,
    apiBase: (env.BOG_API_BASE?.trim() || HOSTS[environment].api).replace(/\/+$/, ''),
    callbackPublicKey: override ? override.replace(/\\n/g, '\n') : BOG_PUBLISHED_CALLBACK_KEYS[environment],
    callbackIpAllowlist: (env.BOG_CALLBACK_IP_ALLOWLIST || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * True when BOG can take a payment AND credit it: creds present (an order can be created). The callback key is
 * always available (published default), so creds are the whole condition. The checkout UI gates its "Pay with Bank
 * of Georgia" button on this, through the secretless /api/checkout/capabilities.
 */
export function bogFullyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return bogConfig(env) !== null;
}

/**
 * Who may START a BOG checkout on this deployment (BOG_CHECKOUT_MODE). Settling stays on in every mode: callbacks,
 * the return page and the cron (pending orders, renewals of plans already sold) never look at it.
 *
 *   unset / ''   'public'  everyone signed in — what Production did before the switch existed
 *   'public'     'public'
 *   'admin'      admins only: the owner's controlled live test while customers see no BOG button
 *   'off'        nobody: no new BOG orders
 *   anything else → 'off'. A typo must close the rail, never open it.
 *
 * A Vercel Preview or Development deployment is always 'off': it writes to the Production database, so the live
 * pair must never take a payment there, whatever its env scope holds (VERCEL_ENV unset = local / CI, unaffected).
 */
export type BogCheckoutMode = 'off' | 'admin' | 'public';
export function bogCheckoutMode(env: NodeJS.ProcessEnv = process.env): BogCheckoutMode {
  const vercelEnv = (env.VERCEL_ENV || '').trim().toLowerCase();
  if (vercelEnv && vercelEnv !== 'production') return 'off';
  const raw = (env.BOG_CHECKOUT_MODE || '').trim().toLowerCase();
  if (!raw || raw === 'public') return 'public';
  return raw === 'admin' ? 'admin' : 'off';
}

/**
 * Who may BUY A PLAN through BOG (BOG_SUBSCRIPTION_MODE) — on top of bogCheckoutMode, which still decides who may
 * start any BOG checkout. A plan saves the card for monthly automatic charges, and whether the bank has enabled
 * automatic payments for this merchant is not confirmed (bank question 3). So opening BOG checkout to everyone must
 * not open plans with it:
 *
 *   unset / ''   'admin'   admins only — the safe default: plans open only when the owner says so
 *   'admin'      'admin'
 *   'public'     'public'  everyone bogCheckoutMode lets in
 *   'off'        nobody
 *   anything else → 'off'.
 *
 * Plans already sold keep renewing and can always be cancelled; this gates new plan checkouts only.
 */
export function bogSubscriptionMode(env: NodeJS.ProcessEnv = process.env): BogCheckoutMode {
  const checkout = bogCheckoutMode(env);
  if (checkout === 'off') return 'off';
  const raw = (env.BOG_SUBSCRIPTION_MODE || '').trim().toLowerCase();
  const plans: BogCheckoutMode = !raw || raw === 'admin' ? 'admin' : raw === 'public' ? 'public' : 'off';
  // Never wider than the checkout itself: checkout=admin keeps plans admin-only whatever this says.
  return checkout === 'admin' && plans === 'public' ? 'admin' : plans;
}

export interface BogFetchDeps {
  readonly fetch: typeof fetch;
  /** Per-request timeout (ms). */
  readonly timeoutMs?: number;
  /** Clock (ms) — injectable for the token cache tests. */
  readonly now?: () => number;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Test hook: forget every cached token. */
export function resetBogTokenCache(): void {
  tokenCache.clear();
}

/**
 * How long a token may be reused. OAuth2 says `expires_in` is seconds, but BOG's own example shows an epoch-ms
 * value (1634719923245) — so both readings are handled. Refreshed a minute early, never trusted beyond an hour.
 */
export function tokenLifetimeMs(expiresIn: unknown, nowMs: number): number {
  const n = Number(expiresIn);
  let ms: number;
  if (!Number.isFinite(n) || n <= 0) ms = 5 * 60_000;
  else if (n > 1e12) ms = n - nowMs; // epoch milliseconds
  else if (n > 1e9) ms = n * 1000 - nowMs; // epoch seconds
  else ms = n * 1000; // seconds
  return Math.min(Math.max(ms - 60_000, 30_000), 60 * 60_000);
}

/**
 * A short, storable account of what BOG answered: HTTP status + the start of the body, whitespace collapsed, the
 * secret scrubbed in case anything ever echoes it. Goes into bog_orders.reject_reason and the logs — never to the
 * browser.
 */
function describeAnswer(cfg: BogConfig, status: number, text: string): string {
  const body = text.split(cfg.secretKey).join('[redacted]').replace(/\s+/g, ' ').trim().slice(0, 140);
  return body ? `HTTP ${status} ${body}` : `HTTP ${status}`;
}

async function requestBogToken(cfg: BogConfig, deps: BogFetchDeps, forceRefresh: boolean): Promise<{ token: string } | { failure: string }> {
  const now = deps.now ? deps.now() : Date.now();
  const key = `${cfg.environment}:${cfg.clientId}:${cfg.oauthUrl}`;
  const hit = tokenCache.get(key);
  if (!forceRefresh && hit && hit.expiresAt > now) return { token: hit.token };
  const basic = Buffer.from(`${cfg.clientId}:${cfg.secretKey}`).toString('base64');
  try {
    const res = await deps.fetch(cfg.oauthUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
    });
    if (!res.ok) {
      tokenCache.delete(key);
      return { failure: `oauth ${describeAnswer(cfg, res.status, await res.text().catch(() => ''))}` };
    }
    const json = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof json.access_token !== 'string' || !json.access_token) return { failure: 'oauth answer had no access_token' };
    tokenCache.set(key, { token: json.access_token, expiresAt: now + tokenLifetimeMs(json.expires_in, now) });
    return { token: json.access_token };
  } catch {
    return { failure: 'oauth: no usable answer (network, timeout or not JSON)' };
  }
}

/** A bearer token, from cache unless `forceRefresh`. null on any failure (fail closed: no token, no order). */
export async function getBogAccessToken(cfg: BogConfig, deps: BogFetchDeps, forceRefresh = false): Promise<string | null> {
  const r = await requestBogToken(cfg, deps, forceRefresh);
  return 'token' in r ? r.token : null;
}

// ─── Requests ────────────────────────────────────────────────────────────────────────────────────────────────

interface BogCall {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  acceptLanguage?: 'ka' | 'en';
  theme?: 'light' | 'dark';
}

export interface BogResponse {
  ok: boolean;
  /** 0 = no response (network/timeout/no token). */
  status: number;
  json: unknown;
  /** When !ok: what went wrong, in words safe to store (see describeAnswer). */
  failure?: string;
}

async function bogCall(cfg: BogConfig, deps: BogFetchDeps, call: BogCall): Promise<BogResponse> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const auth = await requestBogToken(cfg, deps, attempt > 0);
    if (!('token' in auth)) return { ok: false, status: 0, json: null, failure: auth.failure };
    const token = auth.token;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (call.body !== undefined) headers['Content-Type'] = 'application/json';
    if (call.idempotencyKey) headers['Idempotency-Key'] = call.idempotencyKey;
    if (call.acceptLanguage) headers['Accept-Language'] = call.acceptLanguage;
    if (call.theme) headers.Theme = call.theme;
    let res: Response;
    try {
      res = await deps.fetch(`${cfg.apiBase}${call.path}`, {
        method: call.method,
        headers,
        body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
        signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
        redirect: 'manual',
      });
    } catch {
      return { ok: false, status: 0, json: null, failure: `${call.method} ${call.path}: no answer (network or timeout)` };
    }
    // An expired/revoked token: one retry with a fresh one. Safe for POSTs — a 401 is refused before processing,
    // and every money-moving call carries an Idempotency-Key anyway.
    if (res.status === 401 && attempt === 0) continue;
    const text = await res.text().catch(() => '');
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return res.ok
      ? { ok: true, status: res.status, json }
      : { ok: false, status: res.status, json, failure: `${call.method} ${call.path} ${describeAnswer(cfg, res.status, text)}` };
  }
  return { ok: false, status: 401, json: null, failure: `${call.method} ${call.path} HTTP 401 twice (a fresh token was refused too)` };
}

/**
 * A deterministic UUID-v4-shaped Idempotency-Key from a seed (our order id). BOG requires a UUID v4; deriving it
 * from the order means a retried request — a crashed cron tick, a double click — repeats the SAME key, so BOG
 * answers with the first result instead of charging twice.
 */
export function bogIdempotencyKey(seed: string): string {
  const b = createHash('sha256').update(`bog-idem:${seed}`).digest().subarray(0, 16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const money = (n: number) => Number(n.toFixed(2));
const bogLang = (locale: string | null | undefined): 'ka' | 'en' => (locale === 'ka' ? 'ka' : 'en');

export interface BogOrderParams {
  /** OUR id (bog_orders.shop_order_id). The first 25 characters appear on the payer's bank statement. */
  readonly externalOrderId: string;
  /** Charge amount. The currency is ALWAYS GEL — never taken from a caller. */
  readonly amountGel: number;
  readonly productId: string;
  readonly description: string;
  readonly callbackUrl: string;
  readonly successUrl: string;
  readonly failUrl: string;
  /** Payment page language: ka → Georgian, anything else → English (BOG has no Russian page). */
  readonly locale: string;
  /** Minutes the payment page stays valid (BOG: 2…1440, default 15). */
  readonly ttlMinutes?: number;
  /** Card only — a plan's first payment must be a card, or there is nothing to save for renewals. */
  readonly cardOnly?: boolean;
}

/**
 * Create an order. Returns BOG's order id + the hosted page URL, or null on any failure — and then tells `report`
 * why (the OAuth answer, BOG's error body, or no answer at all), so a refused checkout is not a silent mystery.
 */
export async function createBogOrder(
  cfg: BogConfig,
  deps: BogFetchDeps,
  p: BogOrderParams,
  report: (failure: string) => void = () => undefined,
): Promise<{ orderId: string; redirectUrl: string } | null> {
  if (!Number.isFinite(p.amountGel) || p.amountGel <= 0 || !p.externalOrderId) {
    report('invalid amount or order id');
    return null;
  }
  const amount = money(p.amountGel);
  const res = await bogCall(cfg, deps, {
    method: 'POST',
    path: '/ecommerce/orders',
    idempotencyKey: bogIdempotencyKey(`order:${p.externalOrderId}`),
    acceptLanguage: bogLang(p.locale),
    theme: 'dark',
    body: {
      callback_url: p.callbackUrl,
      external_order_id: p.externalOrderId,
      capture: 'automatic',
      purchase_units: {
        currency: 'GEL',
        total_amount: amount,
        basket: [{ product_id: p.productId.slice(0, 64), description: p.description.slice(0, 120), quantity: 1, unit_price: amount }],
      },
      redirect_urls: { success: p.successUrl, fail: p.failUrl },
      ttl: Math.min(Math.max(Math.round(p.ttlMinutes ?? 30), 2), 1440),
      ...(p.cardOnly ? { payment_method: ['card'] } : {}),
    },
  });
  if (!res.ok) {
    report(res.failure ?? `HTTP ${res.status}`);
    return null;
  }
  const j = (res.json && typeof res.json === 'object' ? res.json : {}) as { id?: unknown; _links?: { redirect?: { href?: unknown } } };
  const orderId = typeof j.id === 'string' ? j.id : null;
  const href = j._links?.redirect?.href;
  const redirectUrl = typeof href === 'string' && /^https:\/\//i.test(href) ? href : null;
  if (!orderId || !redirectUrl) {
    report(`POST /ecommerce/orders HTTP ${res.status} without an order id or an https redirect`);
    return null;
  }
  return { orderId, redirectUrl };
}

/**
 * Ask BOG to save the card of this (not yet paid) order for AUTOMATIC payments. Must run after createBogOrder and
 * before the customer is redirected; the card is saved only if the payment then succeeds. 202 = accepted.
 * false when the merchant has no automatic-payments permission (BOG enables it per merchant) — the plan is then
 * sold as one non-renewing month rather than refused.
 */
export async function saveCardForAutomaticPayments(cfg: BogConfig, deps: BogFetchDeps, orderId: string): Promise<boolean> {
  const res = await bogCall(cfg, deps, {
    method: 'PUT',
    path: `/orders/${encodeURIComponent(orderId)}/subscriptions`,
    idempotencyKey: bogIdempotencyKey(`save-card:${orderId}`),
  });
  return res.ok;
}

export type BogChargeResult =
  | { ok: true; orderId: string }
  /** BOG refused the request itself (4xx) — e.g. the saved card is gone. Retrying the same request will not help. */
  | { ok: false; error: 'refused'; status: number }
  /** No answer / 5xx — the charge may or may not exist; retry with the SAME external id (same Idempotency-Key). */
  | { ok: false; error: 'unavailable'; status: number };

/** Charge a saved card again (a renewal). Amount, currency and buyer are inherited from the parent order. */
export async function chargeSavedCard(
  cfg: BogConfig,
  deps: BogFetchDeps,
  p: { parentOrderId: string; externalOrderId: string; callbackUrl: string },
): Promise<BogChargeResult> {
  const res = await bogCall(cfg, deps, {
    method: 'POST',
    path: `/ecommerce/orders/${encodeURIComponent(p.parentOrderId)}/subscribe`,
    idempotencyKey: bogIdempotencyKey(`charge:${p.externalOrderId}`),
    body: { callback_url: p.callbackUrl, external_order_id: p.externalOrderId },
  });
  if (res.ok && res.json && typeof (res.json as { id?: unknown }).id === 'string') {
    return { ok: true, orderId: (res.json as { id: string }).id };
  }
  if (res.status >= 400 && res.status < 500) return { ok: false, error: 'refused', status: res.status };
  return { ok: false, error: 'unavailable', status: res.status };
}

/** Delete a saved card. true on 2xx, and on 404 (already gone). */
export async function deleteSavedCard(cfg: BogConfig, deps: BogFetchDeps, parentOrderId: string): Promise<boolean> {
  const res = await bogCall(cfg, deps, {
    method: 'DELETE',
    path: `/charges/card/${encodeURIComponent(parentOrderId)}`,
    idempotencyKey: bogIdempotencyKey(`delete-card:${parentOrderId}`),
  });
  return res.ok || res.status === 404;
}

// ─── Receipts + callbacks ────────────────────────────────────────────────────────────────────────────────────

/**
 * Our reading of an order's state. BOG's three refund statuses stay apart (docs, "order_status.key"):
 *   refund_requested    a refund was asked for and is not done yet — the money has not moved back
 *   refunded_partially  part of the payment went back (purchase_units.refund_amount says how much)
 *   refunded            all of it went back
 */
export type BogOrderState = 'completed' | 'rejected' | 'pending' | 'refund_requested' | 'refunded_partially' | 'refunded' | 'other';

/** One refund asked for on an order (receipt `actions[]`, action refund / partial_refund), as BOG lists it. */
export interface BogRefundAction {
  /** completed | rejected */
  readonly status: string | null;
  /** BOG's action response code (161–179 for a failed refund) and its description. */
  readonly code: string | null;
  readonly codeDescription: string | null;
  readonly amount: number | null;
  /** public_api | business_manager | support */
  readonly channel: string | null;
}

export interface BogReceipt {
  readonly orderId: string;
  readonly externalOrderId: string | null;
  /** BOG's raw order_status.key, lower-cased. */
  readonly statusKey: string | null;
  readonly state: BogOrderState;
  readonly requestAmount: number | null;
  readonly transferAmount: number | null;
  /** GEL already returned to the payer (purchase_units.refund_amount); null when BOG does not say. */
  readonly refundAmount: number | null;
  readonly currency: string | null;
  /** card | google_pay | apple_pay | bog_p2p | bog_loyalty | bnpl | bog_loan … */
  readonly transferMethod: string | null;
  /** 'subscription' when the card was saved for automatic payments on this order. */
  readonly savedCardType: string | null;
  readonly parentOrderId: string | null;
  readonly paymentOption: string | null;
  /** The masked PAN (548888xxxxxx9893) for card payments; null otherwise. */
  readonly cardMask: string | null;
  readonly cardExpiry: string | null;
  readonly code: string | null;
  /** BOG's transaction id (payment_detail.transaction_id): what the bank asks for about a code it does not document. */
  readonly transactionId: string | null;
  /**
   * Why a payment was declined: BOG's code, its description (or the documented one) and reject_reason, e.g.
   * "107 Payment declined due to insufficient funds in the account". An undocumented code also carries
   * "· tx <transaction id>" — the bank's instruction (2026-10-15) is to send it that id.
   */
  readonly rejectReason: string | null;
  /** The merchant's name as BOG shows it to the payer (client.brand_ka / client.brand_en). */
  readonly brandKa: string | null;
  readonly brandEn: string | null;
  /** The refunds asked for on this order, in BOG's order (oldest first); empty when none. */
  readonly refundActions: readonly BogRefundAction[];
}

/**
 * BOG's documented response codes, verbatim (https://api.bog.ge/docs/payments/response-codes, read 2026-10-15).
 * 1xx/200: payments; 161–179: refunds and other actions. Used only to name a decline the receipt leaves undescribed.
 */
export const BOG_RESPONSE_CODES: Readonly<Record<string, string>> = {
  '100': 'Successful payment',
  '101': 'Payment declined because card usage is limited. For detailed information, contact the card issuer bank',
  '102': "Saved card wasn't found",
  '103': 'Payment declined due to invalid card',
  '104': 'Payment declined due to exceeding transaction limit',
  '105': 'Payment declined because the card has expired',
  '106': 'Payment declined due to exceeding the limit of the amount',
  '107': 'Payment declined due to insufficient funds in the account',
  '108': 'Authentication Declined',
  '109': 'Technical Issue',
  '110': 'Transaction Expired',
  '111': 'Authentication timeout',
  '112': 'General Error',
  '122': 'Payment declined by the acquirer bank',
  '199': 'Unknown Response',
  '200': 'Successful preauthorization',
  '161': 'Refund could not be completed. Please contact the card issuing bank for more details.',
  '162': 'The card issuing bank declined the refund.',
  '163': 'Not enough funds available in the account',
  '164': 'Refund could not be completed. Please contact the card issuing bank for more details.',
  '165': 'Refund could not be completed. Please contact the card issuing bank for more details.',
  '166': 'Refund could not be completed. Please contact the card issuing bank for more details.',
  '167': 'Card expired. Contact the customer and refund the amount to an active card.',
  '168': 'Refund could not be completed. Please contact the card issuing bank for more details.',
  '169': 'The card is expired or the details are incorrect. Please verify the information with the customer and try again.',
  '179': 'Unknown Response',
};

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const STATE_BY_KEY: Readonly<Record<string, BogOrderState>> = {
  completed: 'completed',
  rejected: 'rejected',
  refund_requested: 'refund_requested',
  refunded_partially: 'refunded_partially',
  refunded: 'refunded',
  created: 'pending',
  processing: 'pending',
  auth_requested: 'pending',
};

/** Parse a receipt (GET /receipt/:id, or a callback's `body`). null when it carries no order id. */
export function parseBogReceipt(json: unknown): BogReceipt | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const orderId = str(o.order_id) ?? str(o.id);
  if (!orderId) return null;
  const status = o.order_status as { key?: unknown } | string | undefined;
  const statusKey = (typeof status === 'string' ? str(status) : str(status?.key))?.toLowerCase() ?? null;
  const pu = (o.purchase_units ?? {}) as Record<string, unknown>;
  const pd = (o.payment_detail ?? {}) as Record<string, unknown>;
  const tm = pd.transfer_method as { key?: unknown } | string | undefined;
  const transferMethod = (typeof tm === 'string' ? str(tm) : str(tm?.key))?.toLowerCase() ?? null;
  const isCard = transferMethod === 'card' || transferMethod === 'google_pay';
  const client = (o.client ?? {}) as Record<string, unknown>;
  const code = str(pd.code, 8);
  const transactionId = str(pd.transaction_id, 64);
  return {
    orderId,
    externalOrderId: str(o.external_order_id),
    statusKey,
    state: statusKey ? (STATE_BY_KEY[statusKey] ?? 'other') : 'other',
    requestAmount: num(pu.request_amount),
    transferAmount: num(pu.transfer_amount),
    refundAmount: num(pu.refund_amount),
    currency: str(pu.currency_code ?? pu.currency)?.toUpperCase() ?? null,
    transferMethod,
    savedCardType: str(pd.saved_card_type)?.toLowerCase() ?? null,
    parentOrderId: str(pd.parent_order_id),
    paymentOption: str(pd.payment_option)?.toLowerCase() ?? null,
    cardMask: isCard ? str(pd.payer_identifier, 32) : null,
    cardExpiry: str(pd.card_expiry_date, 8),
    code,
    transactionId,
    rejectReason: statusKey === 'rejected' ? declineReason(code, str(pd.code_description, 120), str(o.reject_reason, 60), transactionId) : str(o.reject_reason),
    brandKa: str(client.brand_ka, 120),
    brandEn: str(client.brand_en, 120),
    refundActions: parseRefundActions(o.actions),
  };
}

function parseRefundActions(actions: unknown): BogRefundAction[] {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .filter((a) => ['refund', 'partial_refund'].includes(str(a.action)?.toLowerCase() ?? ''))
    .map((a) => ({
      status: str(a.status)?.toLowerCase() ?? null,
      code: str(a.code, 8),
      codeDescription: str(a.code_description, 120),
      amount: num(a.amount),
      channel: str(a.request_channel, 40)?.toLowerCase() ?? null,
    }));
}

/** "107 Payment declined due to insufficient funds in the account (expiration)"; an undocumented code adds "· tx <id>". */
function declineReason(code: string | null, description: string | null, rejectReason: string | null, transactionId: string | null): string | null {
  const documented = code ? BOG_RESPONSE_CODES[code] : undefined;
  const base = [code, description ?? documented ?? null].filter(Boolean).join(' ');
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  let reason = base;
  if (rejectReason && !(description && same(description, rejectReason))) reason = base ? `${base} (${rejectReason})` : rejectReason;
  if (!documented && transactionId) reason = reason ? `${reason} · tx ${transactionId}` : `tx ${transactionId}`;
  return reason ? reason.slice(0, 200) : null;
}

/** Parse a callback: `{ event: 'order_payment', zoned_request_time, body: <receipt> }`. */
export function parseBogCallback(payload: unknown): { event: string | null; receipt: BogReceipt | null } {
  const p = (payload ?? {}) as Record<string, unknown>;
  return { event: str(p.event), receipt: parseBogReceipt(p.body ?? p) };
}

/** The authoritative state of an order. null when BOG did not answer (try again later). */
export async function getBogReceipt(cfg: BogConfig, deps: BogFetchDeps, orderId: string): Promise<BogReceipt | null> {
  const res = await bogCall(cfg, deps, { method: 'GET', path: `/receipt/${encodeURIComponent(orderId)}` });
  if (!res.ok) return null;
  return parseBogReceipt(res.json);
}

/**
 * Verify BOG's SHA256withRSA callback signature over the RAW body (BOG: verify BEFORE deserialising — field order
 * matters). false on any missing input, malformed key or mismatch; the caller must not credit on false.
 */
export function verifyBogCallbackSignature(
  rawBody: string,
  signatureB64: string | null | undefined,
  publicKeyPem: string | null | undefined,
): boolean {
  if (!rawBody || !signatureB64 || !publicKeyPem) return false;
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(rawBody, 'utf8');
    verifier.end();
    return verifier.verify(publicKeyPem, signatureB64.trim(), 'base64');
  } catch {
    return false;
  }
}

/** The caller IP from an X-Forwarded-For chain (first hop) or a direct value. Only ever an extra AND-gate. */
export function callbackSourceIp(forwardedFor: string | null, directIp?: string | null): string | null {
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return directIp?.trim() || null;
}

/** True when the allowlist is empty (not enforced) or the IP is explicitly allowed. */
export function isAllowedBogCallbackIp(ip: string | null, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  return allowlist.includes(ip.trim());
}

/**
 * The credit_wallet_gel ref of a BOG top-up: `bog:<our order id>` — wallet_topups.ref is its PRIMARY KEY, so a
 * re-delivered callback, a reconcile and the cron can all settle the same order and only one credits.
 */
export function bogCreditRef(shopOrderId: string): string {
  return `bog:${shopOrderId}`;
}
