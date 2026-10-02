/**
 * POST /api/research/start — order ONE Deep Research task. Body:
 *   { prompt, confirmedCredits, locale?, fileIds?, requestId? }      (or an `Idempotency-Key` header for requestId)
 *
 *   201  { job, serverNow }   the task is running in the background (200 when a replay of the same requestId)
 *   401  no verified session — guests cannot start research (the task spends the platform's money)
 *   400  invalid_request / invalid_file   (nothing written, nothing charged)
 *   409  confirmation_required / price_changed   { credits }  — the number the user saw is the number charged, or nothing is
 *   402  insufficient_credits
 *   429  too_many_active / daily_limit / the per-account start rate
 *   503  unavailable (switch off, no key, table not migrated) · capacity_reached (the platform's daily cap) · billing_unavailable
 *        (the balance could not be read or reserved — nothing started) · a provider-side failure (sanitized copy; refunded)
 *
 * THE ORDER IS THE POINT (lib/research/service.ts): price confirmed → row written → caps → credits RESERVED through the ledger →
 * ONE provider POST. The provider is never called unless the reserve succeeded; a provider failure is refunded from the ledger.
 * ⚠️ maxDuration is 15 s in practice (vercel.json grants app/api/** 15 s and overrides this file); the provider client gives
 * up after 12 s so the route always ends before the function does.
 */
import { NextRequest } from 'next/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { getResearchCapabilities } from '@/lib/research/capabilities';
import { callerId, json } from '@/lib/research/http';
import { researchMessage } from '@/lib/research/messages';
import { toPublicJob } from '@/lib/research/public';
import { RESEARCH_START_USER } from '@/lib/research/rateLimits';
import { asLocale, parseStartBody } from '@/lib/research/request';
import { getResearchRuntime } from '@/lib/research/runtime';
import { providerFailureBody } from '@/lib/research/service';
import { reportError } from '@/lib/observability/report-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const STATUS: Record<string, number> = {
  invalid_request: 400,
  invalid_file: 400,
  confirmation_required: 409,
  price_changed: 409,
  insufficient_credits: 402,
  too_many_active: 429,
  daily_limit: 429,
  capacity_reached: 503,
  billing_unavailable: 503,
  unavailable: 503,
};

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (limited) return limited;

  const userId = await callerId(req);
  if (!userId || mustSignInToGenerate(userId)) return json(signInToGenerateBody(), 401);

  const rt = getResearchRuntime();
  const caps = await getResearchCapabilities(rt?.db ?? null);
  if (!rt || !caps.available) return json({ error: 'unavailable', reason: caps.reason ?? 'schema', message: researchMessage('unavailable') }, 503);

  const perUser = await checkRateLimitByKey(userId, RESEARCH_START_USER);
  if (perUser) return perUser;

  const raw = await req.json().catch(() => null);
  const locale = asLocale((raw as { locale?: unknown } | null)?.locale);
  const parsed = parseStartBody(raw, req.headers.get('idempotency-key'));
  if (!parsed.ok) return json({ error: 'invalid_request', reasons: parsed.reasons, message: researchMessage('invalid_request', locale) }, 400);
  const body = parsed.value;

  try {
    const out = await rt.service.start({
      userId,
      prompt: body.prompt,
      locale: body.locale,
      fileIds: body.fileIds,
      confirmedCredits: body.confirmedCredits,
      requestId: body.requestId,
    });

    if (out.ok) {
      return json({ job: toPublicJob(out.job), serverNow: new Date().toISOString(), replayed: out.replayed }, out.replayed ? 200 : 201);
    }
    // A supplier-side failure: the sanitized copy in the user's language — never the provider's body (and it was refunded).
    if (out.providerFailure) {
      const b = providerFailureBody(out.providerFailure, body.locale);
      return json({ error: b.error, code: out.code, message: b.message }, b.status);
    }
    const status = STATUS[out.code] ?? 503;
    return json({ error: out.code, ...(out.credits !== undefined ? { credits: out.credits } : {}), message: researchMessage(out.code, body.locale) }, status);
  } catch (e) {
    // The saga is built not to throw; if it does, nothing here says whether credits moved — the sweeper settles any job it left.
    reportError(e, { route: '/api/research/start', stage: 'start' });
    return json({ error: 'unavailable', message: researchMessage('unavailable', body.locale) }, 503);
  }
}
