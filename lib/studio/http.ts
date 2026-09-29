/**
 * HTTP plumbing shared by the studio routes: saga codes → status codes, the user-facing price shape, a
 * bounded JSON reader and a per-user rate window for estimates.
 */
import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/platform/redis';
import { formatGel, type Price } from '@/lib/providers/pricing';
import type { SagaCode } from '@/lib/studio/saga';
import { MediaRefError, resolveStudioMedia, type Signer } from '@/lib/studio/media';

const STATUS: Record<SagaCode, number> = {
  not_configured: 503,
  model_unavailable: 409,
  invalid_input: 422,
  confirmation_required: 409,
  price_changed: 409,
  insufficient_credits: 402,
  billing_unavailable: 503,
  provider_unavailable: 503,
  not_found: 404,
  cannot_cancel: 409,
};

/** What a user sees of a price — never the provider's USD cost (that is our margin). */
export function publicPrice(p: Price) {
  return { credits: p.credits, gel: p.gel, display: formatGel(p.gel) };
}

export function sagaError(code: SagaCode, extra: { price?: Price; issues?: Array<{ path: string; message: string }> } = {}) {
  return NextResponse.json(
    { error: code, ...(extra.price ? { price: publicPrice(extra.price) } : {}), ...(extra.issues ? { issues: extra.issues } : {}) },
    { status: STATUS[code] },
  );
}

export const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });
export const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });

/** Parse a JSON body of at most `maxBytes`. null = too big or not JSON. */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length'));
  if (Number.isFinite(len) && len > maxBytes) return null;
  let text: string;
  try { text = await req.text(); } catch { return null; }
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Fixed one-minute window per user. Estimates run on every chip change in the UI, so they get a wider budget
 * than generations (which use the produce limiter). Fails open without Redis, like every limiter here.
 */
export async function withinEstimateBudget(userId: string, perMinute = 60, now = Date.now()): Promise<boolean> {
  const r = getRedisClient();
  if (!r) return true;
  const key = `rl:studio-estimate:${userId}:${Math.floor(now / 60_000)}`;
  try {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 70);
    return n <= perMinute;
  } catch {
    return true;
  }
}

/** Swap the caller's own upload paths for signed URLs, or answer 422 naming the field. */
export async function mediaParams(
  raw: unknown,
  userId: string,
  sign: Signer,
): Promise<{ ok: true; params: unknown } | { ok: false; res: Response }> {
  try {
    return { ok: true, params: await resolveStudioMedia(raw ?? {}, userId, sign) };
  } catch (e) {
    if (e instanceof MediaRefError) return { ok: false, res: sagaError('invalid_input', { issues: [{ path: e.field, message: e.reason }] }) };
    throw e;
  }
}
