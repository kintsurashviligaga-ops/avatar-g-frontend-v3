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
 *
 * The OAuth request mirrors lib/billing/bogClient (same URL, headers and body) rather than reusing its private
 * token function, so the probe never touches — or poisons — the shared token cache.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BOG_PUBLISHED_CALLBACK_KEYS, bogConfig, type BogConfig } from './bogClient';
import { bogCallbackUrl, bogSchemaReady } from './bogSettlement';

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
  ordersByStatus: Record<string, number>;
  recentOrders: BogRecentOrder[];
}

function callbackKeyKind(cfg: BogConfig): BogReadiness['callbackKey'] {
  if (cfg.callbackPublicKey === BOG_PUBLISHED_CALLBACK_KEYS.production) return 'published-production';
  if (cfg.callbackPublicKey === BOG_PUBLISHED_CALLBACK_KEYS.sandbox) return 'published-sandbox';
  return 'override';
}

export async function bogReadiness(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<BogReadiness> {
  const cfg = bogConfig(env);
  const schemaReady = await bogSchemaReady(db);
  let recentOrders: BogRecentOrder[] = [];
  const ordersByStatus: Record<string, number> = {};
  if (schemaReady) {
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
    callbackUrl: bogCallbackUrl(),
    apiBase: cfg?.apiBase ?? null,
    schemaReady,
    cronSecretSet: Boolean((env.CRON_SECRET || '').trim()),
    ordersByStatus,
    recentOrders,
  };
}

/** Belt and braces: a stored reason is already scrubbed at write time; scrub again before it leaves the server. */
function scrub(text: string, cfg: BogConfig | null): string {
  const t = cfg?.secretKey ? text.split(cfg.secretKey).join('[redacted]') : text;
  return t.slice(0, 200);
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
    return typeof token === 'string' && token ? done('ok', res.status, null) : done('malformed_answer', res.status, answer);
  }
  if (res.status === 400 || res.status === 401) return done('credentials_refused', res.status, answer);
  if (res.status === 403) return done('forbidden', res.status, answer);
  if (res.status === 404) return done('endpoint_not_found', res.status, answer);
  return done(res.status >= 500 ? 'bog_error' : 'credentials_refused', res.status, answer);
}
