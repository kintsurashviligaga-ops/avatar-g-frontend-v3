/**
 * Bank of Georgia (BOG / iPay) — native GEL e-commerce payment client.
 *
 * A dedicated, fully-typed handler for card + Apple Pay checkout settled strictly in GEL. It follows
 * the same testable-client pattern used across the codebase: small pure helpers + an INJECTABLE `fetch`
 * so the whole submit → callback → verify flow is unit-testable with zero network and zero secrets.
 *
 * ── ENDPOINT / SIGNATURE CAVEAT — READ BEFORE LIVE TRAFFIC ────────────────────────────────────
 * BOG has shipped more than one generation of this API (legacy `ipay.ge/opay/...` and the newer
 * `api.bog.ge/payments/...`); the exact order URL, response envelope, and callback-signature header
 * differ between them. Every URL and the callback public key are therefore ENV-CONFIGURABLE and are
 * NEVER hardcoded as verified fact. The defaults below reflect the endpoint supplied at build time
 * and MUST be confirmed against your current BOG merchant dashboard before real traffic. The client
 * parses order-id / redirect-url / status DEFENSIVELY across the known envelope shapes for that reason.
 *
 * Security: callbacks are authenticated with BOG's ASYMMETRIC RSA-SHA256 signature (verified against
 * BOG's published public key — a caller cannot forge it without BOG's private key), with an optional
 * source-IP allowlist as defense-in-depth. There is NO shared HMAC secret in this scheme.
 */
import 'server-only';
import { createVerify } from 'node:crypto';

export interface BogConfig {
  readonly clientId: string;
  readonly secretKey: string;
  readonly oauthUrl: string;
  readonly orderUrl: string;
  /** PEM RSA public key BOG signs callbacks with. null → callbacks cannot be signature-verified. */
  readonly callbackPublicKey: string | null;
  /** Header the signature arrives in (BOG generations differ; configurable). */
  readonly callbackSignatureHeader: string;
  /** Optional source-IP allowlist (defense-in-depth alongside the signature). Empty → not enforced. */
  readonly callbackIpAllowlist: readonly string[];
}

/**
 * Resolve the BOG config from env. Returns null when merchant credentials are absent so every
 * caller degrades cleanly (routes return 503; nothing is charged) — a missing key can never
 * silently credit or half-configure a live payment path.
 */
export function bogConfig(env: NodeJS.ProcessEnv = process.env): BogConfig | null {
  const clientId = env.BOG_CLIENT_ID?.trim();
  const secretKey = env.BOG_SECRET_KEY?.trim();
  if (!clientId || !secretKey) return null;
  return {
    clientId,
    secretKey,
    // Defaults: verify against current BOG docs. Override via env for the api.bog.ge generation.
    oauthUrl: env.BOG_OAUTH_URL?.trim() || 'https://ipay.ge/opay/api/v1/oauth2/token',
    orderUrl: env.BOG_ORDER_URL?.trim() || 'https://ipay.ge/sso/api/v1/ecommerce/orders',
    // `\n`-escaped single-line PEMs (the usual env encoding) are un-escaped to real newlines.
    callbackPublicKey: env.BOG_CALLBACK_PUBLIC_KEY ? env.BOG_CALLBACK_PUBLIC_KEY.replace(/\\n/g, '\n') : null,
    callbackSignatureHeader: env.BOG_CALLBACK_SIGNATURE_HEADER?.trim() || 'Callback-Signature',
    callbackIpAllowlist: (env.BOG_CALLBACK_IP_ALLOWLIST || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * True only when the FULL native GEL path is live: merchant creds present (an order can be created) AND
 * the callback public key present (the settlement callback can be RSA-verified and credited). The wallet
 * UI gates its "Pay with BOG" affordance on THIS, not bogConfig() alone — client creds without the
 * callback public key would let a user PAY while app/api/billing/bog/webhook 401s every callback (no
 * public key → line ~60), i.e. money in, never credited. Kept here so the capability endpoint and its
 * test share one definition of "BOG is safe to offer".
 */
export function bogFullyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = bogConfig(env);
  return cfg !== null && cfg.callbackPublicKey !== null;
}

export interface BogFetchDeps {
  readonly fetch: typeof fetch;
  /** Per-request timeout (ms). */
  readonly timeoutMs?: number;
}

export interface BogToken {
  readonly accessToken: string;
  readonly expiresInSec: number;
}

/**
 * OAuth2 client-credentials grant. Basic-auth `client_id:secret_key`, `grant_type=client_credentials`.
 * Returns null on any non-2xx / malformed / timeout (fail-closed — no token, no order).
 */
export async function getBogAccessToken(cfg: BogConfig, deps: BogFetchDeps): Promise<BogToken | null> {
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
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    return { accessToken: json.access_token, expiresInSec: Number(json.expires_in) || 3600 };
  } catch {
    return null;
  }
}

export interface BogOrderParams {
  /** Charge amount. Currency is ALWAYS forced to GEL — never taken from the caller. */
  readonly amountGel: number;
  /** Our internal id; echoed back in the callback so we can map it to the paying user. */
  readonly shopOrderId: string;
  readonly redirectSuccessUrl: string;
  readonly redirectFailUrl: string;
  readonly callbackUrl: string;
  readonly description?: string;
}

export interface BogOrderResult {
  readonly orderId: string;
  readonly redirectUrl: string;
  readonly raw: unknown;
}

/**
 * Create a checkout order. Currency is hardcoded "GEL". Extracts the order id + hosted redirect
 * URL defensively across the known BOG response envelopes. Returns null on any failure.
 */
export async function createBogOrder(
  cfg: BogConfig,
  accessToken: string,
  p: BogOrderParams,
  deps: BogFetchDeps,
): Promise<BogOrderResult | null> {
  if (!Number.isFinite(p.amountGel) || p.amountGel <= 0) return null;
  const payload = {
    intent: 'CAPTURE',
    shop_order_id: p.shopOrderId,
    redirect_url: p.redirectSuccessUrl,
    fail_redirect_url: p.redirectFailUrl,
    callback_url: p.callbackUrl,
    capture: 'automatic',
    purchase_units: {
      currency: 'GEL', // STRICTLY GEL — the whole point of the native BOG path
      total_amount: Number(p.amountGel.toFixed(2)),
      basket: [
        {
          quantity: 1,
          unit_price: Number(p.amountGel.toFixed(2)),
          product_id: p.description ? p.description.slice(0, 40) : 'wallet_topup',
        },
      ],
    },
  };
  try {
    const res = await deps.fetch(cfg.orderUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as BogOrderResponseEnvelope;
    const orderId = json.order_id ?? json.id ?? null;
    const redirectUrl = extractRedirectUrl(json);
    if (!orderId || !redirectUrl) return null;
    return { orderId, redirectUrl, raw: json };
  } catch {
    return null;
  }
}

interface BogOrderResponseEnvelope {
  order_id?: string;
  id?: string;
  _links?: { redirect?: { href?: string }; approve?: { href?: string } };
  links?: Array<{ rel?: string; href?: string }>;
  redirect_url?: string;
}

/** Pull the hosted-payment redirect URL out of whichever envelope BOG returned. http(s) only. */
export function extractRedirectUrl(json: BogOrderResponseEnvelope): string | null {
  const candidates = [
    json._links?.redirect?.href,
    json._links?.approve?.href,
    json.links?.find((l) => l.rel === 'redirect' || l.rel === 'approve')?.href,
    json.redirect_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  }
  return null;
}

/**
 * Verify BOG's RSA-SHA256 callback signature over the RAW request body. Asymmetric: a spoofer
 * cannot produce a valid signature without BOG's private key. Returns false on any missing input,
 * malformed key, or mismatch — the caller must NOT credit anything on a false result.
 */
export function verifyBogCallbackSignature(
  rawBody: string,
  signatureB64: string | null | undefined,
  publicKeyPem: string | null,
): boolean {
  if (!rawBody || !signatureB64 || !publicKeyPem) return false;
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(rawBody, 'utf8');
    verifier.end();
    return verifier.verify(publicKeyPem, signatureB64, 'base64');
  } catch {
    return false;
  }
}

/** Extract the caller IP from an X-Forwarded-For chain (first hop) or a direct value. */
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

export type BogPaymentStatus = 'APPROVED' | 'REJECTED' | 'PENDING' | 'UNKNOWN';

export interface BogCallbackData {
  readonly orderId: string | null;
  readonly shopOrderId: string | null;
  readonly status: BogPaymentStatus;
  readonly amountGel: number | null;
  readonly currency: string | null;
}

const APPROVED_TOKENS = new Set(['approved', 'completed', 'success', 'succeeded', 'captured', 'paid']);
const REJECTED_TOKENS = new Set(['rejected', 'declined', 'failed', 'error', 'canceled', 'cancelled', 'expired']);
const PENDING_TOKENS = new Set(['pending', 'created', 'processing', 'in_progress', 'new']);

/** Normalize a raw BOG status token into our canonical enum. */
export function normalizeBogStatus(raw: string | null | undefined): BogPaymentStatus {
  if (!raw) return 'UNKNOWN';
  const t = raw.trim().toLowerCase();
  if (APPROVED_TOKENS.has(t)) return 'APPROVED';
  if (REJECTED_TOKENS.has(t)) return 'REJECTED';
  if (PENDING_TOKENS.has(t)) return 'PENDING';
  return 'UNKNOWN';
}

/** Parse a BOG callback body defensively across the known envelope shapes. */
export function parseBogCallback(payload: unknown): BogCallbackData {
  const b = (payload ?? {}) as Record<string, unknown>;
  const body = ((b.body as Record<string, unknown>) ?? b) as Record<string, unknown>;

  const orderStatus = body.order_status as { key?: string; value?: string } | undefined;
  const rawStatus =
    orderStatus?.key ??
    orderStatus?.value ??
    (typeof body.status === 'string' ? (body.status as string) : undefined);

  const purchaseUnits = body.purchase_units as
    | { transferred_amount?: unknown; request_amount?: unknown; currency_code?: unknown; currency?: unknown }
    | undefined;

  const amountRaw =
    (purchaseUnits?.transferred_amount as number | string | undefined) ??
    (purchaseUnits?.request_amount as number | string | undefined) ??
    (body.amount as number | string | undefined);
  const amountGel = amountRaw !== undefined && amountRaw !== null && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null;

  const currency =
    (purchaseUnits?.currency_code as string | undefined) ??
    (purchaseUnits?.currency as string | undefined) ??
    (typeof body.currency === 'string' ? (body.currency as string) : null) ??
    null;

  return {
    orderId: (body.order_id as string | undefined) ?? (body.id as string | undefined) ?? null,
    shopOrderId: (body.shop_order_id as string | undefined) ?? (body.external_order_id as string | undefined) ?? null,
    status: normalizeBogStatus(rawStatus),
    amountGel,
    currency,
  };
}

/**
 * The idempotency ref for crediting a BOG top-up. Fed to credit_wallet_gel, whose `wallet_topups.ref`
 * PRIMARY KEY + `ON CONFLICT DO NOTHING` makes a re-delivered callback a guaranteed no-op. This is a
 * CREDIT namespace — deliberately distinct from the `remix:*` DEBIT refs used by deduct_credits.
 */
export function bogCreditRef(orderId: string): string {
  return `bog:${orderId}`;
}
