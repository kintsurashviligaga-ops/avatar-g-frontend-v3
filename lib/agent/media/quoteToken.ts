/**
 * lib/agent/media/quoteToken.ts — "this exact plan was quoted to this user at this price, on this engine", signed.
 *
 * A quote is the analysis of the user's files and the plan Agent G made from them. The run must render THAT plan at
 * THAT price, not whatever a client sends back, and must never render it twice. So the quote hands the client the
 * plan with a token that binds (user, job id, the plan's fingerprint, the price, an expiry) and, since v2 (MASTER TASK
 * v3.1, audit F-06), what will run it and how it is billed: the capability, the model, the transport, the Google Cloud
 * project, the price book version and the units the price counts, plus a nonce.
 *   · a changed plan, another user, or an expired quote is refused;
 *   · so is a quote whose engine, transport, project, price book or credits are no longer what the server would quote
 *     now: the run computes its binding from the adapter that will actually run it and refuses any difference
 *     (`changed`, naming the field);
 *   · the job id in it is the run's idempotency key: the job row is inserted under it, so a second run of the same
 *     quote (a double tap, a retry after a lost response, a replayed token) finds the row and reports it instead of
 *     rendering or charging again. The nonce keeps two quotes of identical claims from sharing a token.
 *
 * v1 tokens (no binding) were issued until this version shipped. They still verify, with their fingerprint, owner,
 * expiry and credits checked, until they expire: at most QUOTE_TTL_MS after the deploy, since nothing signs v1 now.
 *
 * Same construction as lib/orchestrator/jobChargeToken: HMAC-SHA256 over `<domain>:<payload>`, constant-time compare,
 * no key = no token (fail closed). Each version has its own domain and token shape (`v2.<payload>.<mac>`), so a v1
 * signature can never be read as a v2 one. The key is injected so the rules are tested without env.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PRICING_VERSION } from '@/lib/credits/pricingVersion';

const DOMAIN_V1 = 'agent-g-media-quote:v1';
const DOMAIN_V2 = 'agent-g-media-quote:v2';
const V2_PREFIX = 'v2';
/** A quote is good for half an hour: long enough to read it, short enough that a signed source link is still live. */
export const QUOTE_TTL_MS = 30 * 60 * 1000;
/** The only currency a quote is priced in. */
export const QUOTE_CURRENCY = 'credits';

export interface QuoteClaims {
  /** The user the quote was made for. */
  u: string;
  /** The job id the run will use: the idempotency key. */
  j: string;
  /** The fingerprint of the quoted request (lib/orchestrator/idemRef bodyFingerprint). */
  f: string;
  /** Credits quoted. */
  c: number;
  /** Expiry, epoch ms. */
  x: number;
}

/** What runs the quote and how it is billed. Built by quoteBinding, at the quote and again at the run. */
export interface QuoteBinding {
  /** The capability quoted, e.g. `music.studio`, `media.montage`. */
  cap: string;
  /** The model or engine that renders it. */
  model: string;
  /** How it is reached: `vertex` for a Google model on Vertex AI, `local` for this server's own engines. */
  transport: string;
  /** The Google Cloud project a Vertex call bills to; '' when nothing is billed outside this server. */
  project: string;
  /** The price book the credits came from (lib/credits/pricingVersion). */
  pricing: string;
  /** How many of what the price counts (seconds, images, steps; 1 for a flat price). */
  units: number;
}

const BINDING_FIELDS = ['cap', 'model', 'transport', 'project', 'pricing', 'units'] as const;
export type QuoteField = (typeof BINDING_FIELDS)[number] | 'fingerprint' | 'credits';

/**
 * The binding for a quote, with the project and price book read now. `env` is injected for tests; the project is the
 * same GCP_PROJECT_ID the Vertex transport bills (lib/veo/vertexAuth).
 */
export function quoteBinding(
  input: { cap: string; model: string; transport: string; units: number },
  env: Readonly<Record<string, string | undefined>> = process.env,
): QuoteBinding {
  return {
    cap: input.cap,
    model: input.model,
    transport: input.transport,
    project: input.transport === 'vertex' ? (env.GCP_PROJECT_ID ?? '').trim() : '',
    pricing: PRICING_VERSION,
    units: input.units,
  };
}

const mac = (domain: string, key: string, payload: string) => createHmac('sha256', key).update(`${domain}:${payload}`).digest('base64url');

const validBinding = (b: Partial<QuoteBinding> | undefined): b is QuoteBinding =>
  !!b && typeof b.cap === 'string' && !!b.cap && typeof b.model === 'string' && !!b.model && typeof b.transport === 'string'
  && !!b.transport && typeof b.project === 'string' && typeof b.pricing === 'string' && !!b.pricing
  && typeof b.units === 'number' && Number.isFinite(b.units) && b.units >= 0;

/** Sign a v2 quote. Null when there is no key or a claim or binding field is missing (fail closed). */
export function signQuote(claims: QuoteClaims, key: string, binding: QuoteBinding): string | null {
  if (!key || !claims.u || !claims.j || !claims.f || !(claims.c >= 0) || !(claims.x > 0) || !validBinding(binding)) return null;
  const b: QuoteBinding = {
    cap: binding.cap, model: binding.model, transport: binding.transport, project: binding.project, pricing: binding.pricing, units: binding.units,
  };
  const body = { v: 2, u: claims.u, j: claims.j, f: claims.f, c: claims.c, cur: QUOTE_CURRENCY, x: claims.x, n: randomBytes(12).toString('base64url'), b };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${V2_PREFIX}.${payload}.${mac(DOMAIN_V2, key, payload)}`;
}

export type QuoteCheck =
  | { ok: true; claims: QuoteClaims; version: 1 | 2 }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_yours' }
  | { ok: false; reason: 'changed'; field: QuoteField };

export interface QuoteExpectation {
  userId: string;
  fingerprint: string;
  now: number;
  /** The credits the server would quote now. */
  credits: number;
  /** The binding of the adapter that will run it, built now. */
  binding: QuoteBinding;
}

const sameSig = (sig: string, expected: string) => {
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Verify a token for this user, this request and this engine at `now`. */
export function verifyQuote(token: unknown, key: string, expect: QuoteExpectation): QuoteCheck {
  if (!key || typeof token !== 'string' || token.length > 2048) return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  const v2 = parts.length === 3 && parts[0] === V2_PREFIX;
  if (!v2 && parts.length !== 2) return { ok: false, reason: 'invalid' };
  const [payload, sig] = v2 ? [parts[1], parts[2]] : [parts[0], parts[1]];
  if (!payload || !sig || !sameSig(sig, mac(v2 ? DOMAIN_V2 : DOMAIN_V1, key, payload))) return { ok: false, reason: 'invalid' };
  let c: Partial<QuoteClaims> & { v?: unknown; cur?: unknown; n?: unknown; b?: Partial<QuoteBinding> };
  try {
    c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof c;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (c.v !== (v2 ? 2 : 1) || typeof c.u !== 'string' || typeof c.j !== 'string' || typeof c.f !== 'string'
    || typeof c.c !== 'number' || typeof c.x !== 'number') return { ok: false, reason: 'invalid' };
  if (v2 && (c.cur !== QUOTE_CURRENCY || typeof c.n !== 'string' || !c.n || !validBinding(c.b))) return { ok: false, reason: 'invalid' };
  if (c.u !== expect.userId) return { ok: false, reason: 'not_yours' };
  if (c.f !== expect.fingerprint) return { ok: false, reason: 'changed', field: 'fingerprint' };
  if (!(expect.now < c.x)) return { ok: false, reason: 'expired' };
  // A v1 token claims no more than one TTL ahead; anything further was not issued by this code.
  if (!v2 && c.x - expect.now > QUOTE_TTL_MS) return { ok: false, reason: 'invalid' };
  if (v2) {
    for (const field of BINDING_FIELDS) {
      if (c.b![field] !== expect.binding[field]) return { ok: false, reason: 'changed', field };
    }
  }
  if (c.c !== expect.credits) return { ok: false, reason: 'changed', field: 'credits' };
  return { ok: true, claims: { u: c.u, j: c.j, f: c.f, c: c.c, x: c.x }, version: v2 ? 2 : 1 };
}
