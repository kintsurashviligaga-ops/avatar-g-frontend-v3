/**
 * POST /api/chat/claude — RETIRED (410 Gone).
 *
 * This was the anonymous "App Builder" endpoint: a Claude Haiku HTML generator (up to two 4k-token passes per
 * call) on the platform's Anthropic key, with no auth and no rate limit. Nothing in the live UI calls it any
 * more, and under the Google-only policy (lib/ai/google/policy.ts) there is no Anthropic leg to serve it.
 *
 * The file stays (old clients may still name the path) but it calls no provider. A 410 tells a stale client
 * the endpoint is gone for good, not temporarily down.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function POST() {
  return NextResponse.json(
    { error: 'gone', message: 'This endpoint was retired. Use /api/chat/gemini.' },
    { status: 410 },
  );
}
