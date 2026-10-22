/**
 * POST /api/avatar/generate — a custom avatar drawn from a text prompt. Built-in avatars only (GG, 2026-10-22; MASTER
 * TASK v3.1 PR 9): a signed-in caller gets 422 `capability_unavailable` (gap `custom_avatar`) before anything is written.
 * The route used to queue `avatars` and `jobs` rows for a Stability / Replicate / OpenAI worker that no longer exists, so
 * every request it accepted stayed queued; v3.1 forbids those engines.
 */
import { NextRequest, NextResponse } from 'next/server';
import { billingLocale } from '@/lib/api/billingCopy';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { customAvatarBody } from '@/lib/avatar/curated';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  // getUser(), not getSession(): getSession() trusts the cookie without asking the Auth server, so a stale or
  // tampered session would pass this check. getUser() validates the token with Supabase Auth.
  const { data: { user }, error: authError } = await createRouteHandlerClient().auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 });

  return NextResponse.json(customAvatarBody(billingLocale(request)), { status: 422 });
}
