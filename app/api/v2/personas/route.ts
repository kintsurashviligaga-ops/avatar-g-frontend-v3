import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { BUILT_IN_PERSONAS, validateCustomPersona } from '@/lib/services/personas/personas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/personas — the built-in specialist catalogue for the persona picker.
 *
 * Public and unauthenticated on purpose: it is static product copy, identical for every visitor, and
 * gating it would only stop the signed-out landing page from previewing what the picker offers.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ personas: BUILT_IN_PERSONAS });
}

/**
 * POST /api/v2/personas — validate a user-authored persona before the client saves it.
 *
 * Validation is server-side because the sanitizer is a security boundary, not a convenience: a persona is
 * untrusted text that ends up inside the system prompt, so the injection-stripping in
 * `validateCustomPersona` must not be something a modified client can skip.
 *
 * Storage stays client-side for now — persisting per-user personas needs a table this deployment cannot
 * migrate yet — so this returns the CLEANED persona for the caller to store, rather than saving it.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.AI);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const result = validateCustomPersona((body ?? {}) as Record<string, unknown>);
  if (!result.ok || !result.persona) {
    return NextResponse.json({ error: 'invalid_persona', message: result.error }, { status: 400 });
  }
  return NextResponse.json({ persona: result.persona });
}
