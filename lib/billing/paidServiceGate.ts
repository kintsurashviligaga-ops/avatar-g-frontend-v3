/**
 * lib/billing/paidServiceGate.ts — the two locks in front of a newly priced paid service (final P0/P1 repair run).
 *
 * 1. OWNER APPROVAL. Dubbing (10 cr per started minute) and Presentation (15 cr per deck) were priced by the E2E run,
 *    not by the owner. Until the owner configures `OWNER_APPROVED_PRICING`, both stay OFF — the route refuses before
 *    any ffmpeg, provider or ledger call. The approval names the PRICE as well as the service
 *    (`OWNER_APPROVED_PRICING=dubbing:10,presentation:15`), so changing a price in lib/credits/pricing.ts switches the
 *    service off again until the owner approves the new number. Nothing here reads a default: unset ⇒ off.
 *
 * 2. SIGNED QUOTE + EXPLICIT CONFIRM. A first POST is a QUOTE: the server prices the request itself (dubbing measures
 *    the source on the server), signs (user, job id, request fingerprint, credits, expiry) and charges nothing. Only a
 *    second POST carrying that token AND `confirm: true` — sent by the panel's Confirm button — reserves credits and
 *    starts the provider. The token's job id is the run's idempotency key: the job row is inserted under it (a second
 *    confirmation of the same quote finds the row and is refused) and the charge ref is `<service>:<job id>`.
 *
 * Token construction is lib/agent/media/quoteToken (HMAC-SHA256, constant-time compare, no key ⇒ no token). The service
 * name is folded into the fingerprint so a quote for one service can never confirm another. Since quote token v2 the
 * token also binds the service's engine, its transport and project, the price book and the units priced (SERVICE_ENGINE),
 * and a confirmation refuses any that changed.
 */
import { createHash } from 'node:crypto';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { signQuote, verifyQuote, quoteBinding, QUOTE_TTL_MS, type QuoteBinding, type QuoteCheck } from '@/lib/agent/media/quoteToken';

import type { GatedService } from './pricingApproval';
export { ownerApprovedPrice, type GatedService } from './pricingApproval';

/** Fields that are part of the confirmation, not of what is being bought. */
const CONTROL_KEYS = new Set(['quoteToken', 'confirm', 'clientJobId', 'idempotencyKey', 'jobId', 'durationSec']);

/** The fingerprint a quote binds: the service plus the bought request, control fields stripped. */
export function quoteFingerprint(service: GatedService, raw: unknown): string {
  const body = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k]) => !CONTROL_KEYS.has(k)))
    : raw;
  return createHash('sha256').update(`${service}:${bodyFingerprint(body)}`).digest('hex').slice(0, 32);
}

/** Same key rule as the Agent G quotes: a dedicated secret, else the service-role key; none ⇒ no quotes (fail closed). */
export function serviceQuoteKey(env: NodeJS.ProcessEnv = process.env): string {
  return env.AGENT_G_QUOTE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/** What renders each gated service: the model its route's budget estimate names, and how it is reached. */
export const SERVICE_ENGINE: Readonly<Record<GatedService, { model: string; transport: string }>> = {
  dubbing: { model: 'eleven-multilingual-v2', transport: 'elevenlabs' },
  presentation: { model: 'gemini-imagen', transport: 'vertex' },
};

/** The binding a service quote signs and its confirmation requires again (quoteToken v2). `units` is what the price counts. */
export function serviceQuoteBinding(service: GatedService, units: number): QuoteBinding {
  return quoteBinding({ cap: `paid.${service}`, ...SERVICE_ENGINE[service], units });
}

export interface ServiceQuote {
  token: string;
  jobId: string;
  credits: number;
  expiresAt: number;
}

export function issueServiceQuote(
  input: { service: GatedService; userId: string; raw: unknown; credits: number; units: number; jobId: string; now: number },
  key: string = serviceQuoteKey(),
): ServiceQuote | null {
  const expiresAt = input.now + QUOTE_TTL_MS;
  const token = signQuote(
    { u: input.userId, j: input.jobId, f: quoteFingerprint(input.service, input.raw), c: input.credits, x: expiresAt },
    key,
    serviceQuoteBinding(input.service, input.units),
  );
  return token ? { token, jobId: input.jobId, credits: input.credits, expiresAt } : null;
}

export type ConfirmCheck = QuoteCheck | { ok: false; reason: 'not_confirmed' | 'price_changed'; credits?: number };

/**
 * A confirmation is valid only with `confirm === true`, a token signed for this user and this exact request, unexpired,
 * at the price the server computes NOW (a source that measures longer, or a repriced service, needs a new quote), on the
 * engine and price book the server would quote now.
 */
export function checkServiceConfirmation(
  input: { service: GatedService; userId: string; raw: unknown; credits: number; units: number; now: number },
  key: string = serviceQuoteKey(),
): ConfirmCheck {
  const body = input.raw as { confirm?: unknown; quoteToken?: unknown } | null;
  if (!body || body.confirm !== true) return { ok: false, reason: 'not_confirmed' };
  const v = verifyQuote(body.quoteToken, key, {
    userId: input.userId, fingerprint: quoteFingerprint(input.service, input.raw), now: input.now,
    credits: input.credits, binding: serviceQuoteBinding(input.service, input.units),
  });
  if (!v.ok && v.reason === 'changed' && (v.field === 'credits' || v.field === 'units' || v.field === 'pricing')) {
    return { ok: false, reason: 'price_changed', credits: input.credits };
  }
  return v;
}

/** True when the body asks to run (carries a token) rather than to be quoted. */
export function wantsToConfirm(raw: unknown): boolean {
  const b = raw as { confirm?: unknown; quoteToken?: unknown } | null;
  return !!b && (b.confirm !== undefined || b.quoteToken !== undefined);
}
