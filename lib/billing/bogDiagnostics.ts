/**
 * lib/billing/bogDiagnostics.ts — "why does Bank of Georgia checkout fail?" answered without a checkout.
 *
 * Four Production checkouts (2026-10-03…06) ended `init_failed` in under two seconds and nobody was charged. The
 * cause sits on the merchant side (credential pair, BOG_ENV, or the merchant not enabled for online payments), and
 * the only way to see it used to be starting a real checkout. This module gives the admin panel two read-only
 * answers instead:
 *
 *   bogReadiness()   what this deployment is configured with — booleans, the environment, the callback URL, the
 *                    schema probe and the recent orders' outcomes. Never a secret, never a user id.
 *   probeBogOAuth()  one OAuth client-credentials request to BOG. It creates no order, moves no money and is free;
 *                    it proves whether BOG accepts this client id + secret in this environment, and says what BOG
 *                    answered (status + the start of the body, the secret scrubbed).
 *   bogMerchantSeen() the merchant name BOG shows the payer, read from the receipt (GET, read-only) of our latest
 *                    paid order. The bank renamed the merchant on 2026-10-15 ("corrected, please check"); this is
 *                    that check without a new payment.
 *
 * The OAuth request mirrors lib/billing/bogClient (same URL, headers and body) rather than reusing its private
 * token function, so the probe never touches — or poisons — the shared token cache.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BOG_PUBLISHED_CALLBACK_KEYS,
  bogCheckoutMode,
  bogConfig,
  bogSubscriptionMode,
  getBogReceipt,
  type BogCheckoutMode,
  type BogConfig,
  type BogFetchDeps,
} from './bogClient';
import { BOG_PAID_STATUSES, bogLimits, type BogLimitScope } from './bogLimits';
import { bogCallbackUrl, bogSandboxBlocked, bogSchemaReady } from './bogSettlement';

type Db = Pick<SupabaseClient, 'from'>;

export interface BogRecentOrder {
  kind: string;
  status: string;
  amountGel: number;
  createdAt: string;
  rejectReason: string | null;
}

export interface BogReadiness {
  configured: boolean;
  environment: 'production' | 'sandbox' | null;
  /** The last 4 characters of BOG_CLIENT_ID — enough to tell which credential pair is deployed, nothing more. */
  clientIdTail: string | null;
  callbackKey: 'published-production' | 'published-sandbox' | 'override' | null;
  callbackIpAllowlist: number;
  callbackUrl: string;
  /** The api.bog.ge host this deployment talks to (an override shows up here). */
  apiBase: string | null;
  schemaReady: boolean;
  cronSecretSet: boolean;
  /** Who may start a BOG checkout (BOG_CHECKOUT_MODE). */
  checkoutMode: BogCheckoutMode;
  /** Who may buy a plan through BOG (BOG_SUBSCRIPTION_MODE; admins only by default — automatic payments not yet proven). */
  subscriptionMode: BogCheckoutMode;
  /** Sandbox credentials on a Vercel deployment (Production database): checkout is closed (bogSandboxBlocked). */
  sandboxBlocked: boolean;
  /** BOG's limits in force (lib/billing/bogLimits — checkout and renewals refuse above them), and the paid ₾ counted. */
  limitsGel: { singleTransaction: number; per24h: number; per30d: number };
  /** merchant: everyone's payments together; customer: each customer separately (BOG_LIMIT_SCOPE). */
  limitScope: BogLimitScope;
  paidGel: { last24h: number; last30d: number; window: 'rolling'; capped: boolean };
  ordersByStatus: Record<string, number>;
  recentOrders: BogRecentOrder[];
}

/**
 * Paid ₾ against BOG's 24 h / 30 day limits, merchant-wide (BOG_PAID_STATUSES). The windows are rolling (the last
 * 24 h / 30 days from now), timed by when the payment was credited, else when the order was made. The bank counts
 * calendar days (2026-10-15); a rolling window always holds at least what its calendar day does (lib/billing/bogLimits).
 */
/** 5,000 ₾ / 30 days at our smallest order (5 ₾) is 1,000 orders; reading more could not change the verdict. */
const PAID_ROWS_MAX = 1_000;
const DAY_MS = 86_400_000;

async function paidAgainstLimits(db: Db, nowMs: number): Promise<BogReadiness['paidGel']> {
  const paid = { last24h: 0, last30d: 0, window: 'rolling' as const, capped: false };
  try {
    const { data } = await db
      .from('bog_orders')
      .select('amount_gel,created_at,credited_at')
      .in('status', [...BOG_PAID_STATUSES])
      // Orders settle within 48 h of being made (the cron expires the rest), so 31 days of orders covers 30 of payments.
      .gte('created_at', new Date(nowMs - 31 * DAY_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(PAID_ROWS_MAX);
    const rows = (data ?? []) as Array<{ amount_gel: number | string; created_at: string; credited_at: string | null }>;
    for (const r of rows) {
      const age = nowMs - Date.parse(r.credited_at || r.created_at);
      const amount = Number(r.amount_gel);
      if (!Number.isFinite(age) || !Number.isFinite(amount)) continue;
      if (age <= 30 * DAY_MS) paid.last30d += amount;
      if (age <= DAY_MS) paid.last24h += amount;
    }
    paid.capped = rows.length >= PAID_ROWS_MAX;
  } catch {
    /* unreadable → zeros; the schema flag says what is wrong */
  }
  return { ...paid, last24h: Math.round(paid.last24h * 100) / 100, last30d: Math.round(paid.last30d * 100) / 100 };
}

function callbackKeyKind(cfg: BogConfig): BogReadiness['callbackKey'] {
  if (cfg.callbackPublicKey === BOG_PUBLISHED_CALLBACK_KEYS.production) return 'published-production';
  if (cfg.callbackPublicKey === BOG_PUBLISHED_CALLBACK_KEYS.sandbox) return 'published-sandbox';
  return 'override';
}

export async function bogReadiness(db: Db, env: NodeJS.ProcessEnv = process.env, nowMs: number = Date.now()): Promise<BogReadiness> {
  const cfg = bogConfig(env);
  const limits = bogLimits(env);
  const schemaReady = await bogSchemaReady(db);
  let recentOrders: BogRecentOrder[] = [];
  const ordersByStatus: Record<string, number> = {};
  let paidGel: BogReadiness['paidGel'] = { last24h: 0, last30d: 0, window: 'rolling', capped: false };
  if (schemaReady) {
    paidGel = await paidAgainstLimits(db, nowMs);
    try {
      const { data } = await db
        .from('bog_orders')
        .select('kind,status,amount_gel,created_at,reject_reason')
        .order('created_at', { ascending: false })
        .limit(200);
      const rows = (data ?? []) as Array<{ kind: string; status: string; amount_gel: number | string; created_at: string; reject_reason: string | null }>;
      for (const r of rows) ordersByStatus[r.status] = (ordersByStatus[r.status] ?? 0) + 1;
      recentOrders = rows.slice(0, 20).map((r) => ({
        kind: r.kind,
        status: r.status,
        amountGel: Number(r.amount_gel),
        createdAt: r.created_at,
        rejectReason: r.reject_reason ? scrub(r.reject_reason, cfg) : null,
      }));
    } catch {
      /* unreadable → empty lists; the schema flag already says what is wrong */
    }
  }
  return {
    configured: cfg !== null,
    environment: cfg?.environment ?? null,
    clientIdTail: cfg ? cfg.clientId.slice(-4) : null,
    callbackKey: cfg ? callbackKeyKind(cfg) : null,
    callbackIpAllowlist: cfg?.callbackIpAllowlist.length ?? 0,
    // A sandbox order's callback is the origin of the request that made it — never the live site.
    callbackUrl: cfg?.environment === 'sandbox' ? bogCallbackUrl('(this deployment)', 'sandbox') : bogCallbackUrl(),
    apiBase: cfg?.apiBase ?? null,
    schemaReady,
    cronSecretSet: Boolean((env.CRON_SECRET || '').trim()),
    checkoutMode: bogCheckoutMode(env),
    subscriptionMode: bogSubscriptionMode(env),
    sandboxBlocked: bogSandboxBlocked(cfg, env),
    limitsGel: { singleTransaction: limits.singleTransaction, per24h: limits.per24h, per30d: limits.per30d },
    limitScope: limits.scope,
    paidGel,
    ordersByStatus,
    recentOrders,
  };
}

/**
 * Belt and braces: a stored reason is already scrubbed at write time; scrub again before it leaves the server — the
 * secret verbatim, JSON-escaped and URL-encoded, the Basic header, and anything shaped like a token.
 */
function scrub(text: string, cfg: BogConfig | null): string {
  let t = text;
  if (cfg?.secretKey) {
    const s = cfg.secretKey;
    const basic = Buffer.from(`${cfg.clientId}:${s}`).toString('base64');
    for (const form of new Set([s, JSON.stringify(s).slice(1, -1), encodeURIComponent(s), basic])) t = t.split(form).join('[redacted]');
  }
  return t
    .replace(/"(access_token|refresh_token|id_token)"\s*:\s*"[^"]*"/g, '"$1":"[hidden]"')
    .replace(/eyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g, '[token]')
    .slice(0, 200);
}

/** A 2xx answer without a token: say what it held (its keys), never its values — one of them may be a token. */
function describeKeys(text: string): string {
  try {
    const j = JSON.parse(text) as unknown;
    if (j && typeof j === 'object' && !Array.isArray(j)) return `JSON keys: ${Object.keys(j).slice(0, 12).join(', ') || '(none)'}`;
    return `JSON ${Array.isArray(j) ? 'array' : typeof j}`;
  } catch {
    return `not JSON (${text.length} bytes)`;
  }
}

export type BogProbeVerdict =
  | 'ok'
  | 'unconfigured'
  | 'credentials_refused'
  | 'forbidden'
  | 'endpoint_not_found'
  | 'bog_error'
  | 'no_answer'
  | 'malformed_answer';

export interface BogProbeResult {
  verdict: BogProbeVerdict;
  environment: 'production' | 'sandbox' | null;
  /** 0 = no HTTP answer. */
  httpStatus: number;
  /** What BOG answered, ≤ 160 chars, secret scrubbed. */
  answer: string | null;
  /** What to do next, in plain words (en). */
  hint: string;
  tookMs: number;
}

const HINTS: Readonly<Record<BogProbeVerdict, string>> = {
  ok:
    'BOG accepts this client id + secret in this environment. If a checkout still fails, the order step is refused: ' +
    'ask BOG to enable online (e-commerce) payments for this merchant, and read the reject reason of the next init_failed order.',
  unconfigured: 'BOG_CLIENT_ID and BOG_SECRET_KEY are not both set on this deployment.',
  credentials_refused:
    'BOG refused the credentials. Either the client id / secret pair is wrong (re-copy both from the business manager, ' +
    'no spaces), or it is a SANDBOX pair used against production (set BOG_ENV=sandbox) or a live pair with BOG_ENV=sandbox.',
  forbidden: 'BOG knows the credentials but refused access: the merchant is not enabled for the Online Payments API yet — ask BOG.',
  endpoint_not_found: 'The OAuth URL answered 404 — a BOG_OAUTH_URL override is wrong, or BOG moved the endpoint.',
  bog_error: 'BOG answered with a server error; try again later, and tell BOG if it persists.',
  no_answer: 'No answer from BOG (network, DNS or timeout) — check that outbound HTTPS to oauth2.bog.ge is allowed.',
  malformed_answer: 'BOG answered 2xx without an access_token — tell BOG, quoting the answer.',
};

/** One OAuth client-credentials request — no order, no money. Never throws. */
export async function probeBogOAuth(
  deps: { fetch: typeof fetch; now?: () => number; timeoutMs?: number },
  env: NodeJS.ProcessEnv = process.env,
): Promise<BogProbeResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const cfg = bogConfig(env);
  const done = (verdict: BogProbeVerdict, httpStatus: number, answer: string | null): BogProbeResult => ({
    verdict,
    environment: cfg?.environment ?? null,
    httpStatus,
    answer,
    hint: HINTS[verdict],
    tookMs: Math.max(0, now() - started),
  });
  if (!cfg) return done('unconfigured', 0, null);
  const basic = Buffer.from(`${cfg.clientId}:${cfg.secretKey}`).toString('base64');
  let res: Response;
  try {
    res = await deps.fetch(cfg.oauthUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
    });
  } catch {
    return done('no_answer', 0, null);
  }
  const text = await res.text().catch(() => '');
  const answer = text ? scrub(text, cfg).replace(/\s+/g, ' ').trim().slice(0, 160) : null;
  if (res.ok) {
    let token: unknown;
    try {
      token = (JSON.parse(text) as { access_token?: unknown }).access_token;
    } catch {
      token = undefined;
    }
    // Never echo the token itself.
    return typeof token === 'string' && token ? done('ok', res.status, null) : done('malformed_answer', res.status, describeKeys(text));
  }
  if (res.status === 400 || res.status === 401) return done('credentials_refused', res.status, answer);
  if (res.status === 403) return done('forbidden', res.status, answer);
  if (res.status === 404) return done('endpoint_not_found', res.status, answer);
  return done(res.status >= 500 ? 'bog_error' : 'credentials_refused', res.status, answer);
}

export interface BogMerchantSeen {
  verdict: 'ok' | 'unconfigured' | 'no_paid_order' | 'no_answer';
  /** client.brand_ka / client.brand_en of the receipt: the name on BOG's payment page and in the bank's records. */
  brandKa: string | null;
  brandEn: string | null;
  /** When the order whose receipt was read was made. */
  orderCreatedAt: string | null;
}

/**
 * The merchant name BOG reports, from the receipt of our latest paid order (one GET; no order, no money). Never
 * throws. no_paid_order when nothing was ever paid through BOG here (the receipt of an unpaid order may carry it too,
 * but a paid one is what the payer saw).
 */
export async function bogMerchantSeen(db: Db, deps: BogFetchDeps, env: NodeJS.ProcessEnv = process.env): Promise<BogMerchantSeen> {
  const none = (verdict: BogMerchantSeen['verdict'], orderCreatedAt: string | null = null): BogMerchantSeen => ({
    verdict,
    brandKa: null,
    brandEn: null,
    orderCreatedAt,
  });
  const cfg = bogConfig(env);
  if (!cfg) return none('unconfigured');
  let latest: { bog_order_id: string; created_at: string } | null = null;
  try {
    const { data } = await db
      .from('bog_orders')
      .select('bog_order_id,created_at')
      .in('status', [...BOG_PAID_STATUSES])
      .not('bog_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    latest = ((data ?? []) as Array<{ bog_order_id: string; created_at: string }>)[0] ?? null;
  } catch {
    latest = null;
  }
  if (!latest) return none('no_paid_order');
  try {
    const receipt = await getBogReceipt(cfg, deps, latest.bog_order_id);
    if (!receipt) return none('no_answer', latest.created_at);
    return { verdict: 'ok', brandKa: receipt.brandKa, brandEn: receipt.brandEn, orderCreatedAt: latest.created_at };
  } catch {
    return none('no_answer', latest.created_at);
  }
}
