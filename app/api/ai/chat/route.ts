/**
 * POST /api/ai/chat — RETIRED (410 Gone).
 *
 * This was an anonymous OpenAI chat-completions proxy that took the MODEL from the request body — any caller
 * could pick any OpenAI model on the platform's key (IP rate limit only). No live UI calls it, and under the
 * Google-only policy (lib/ai/google/policy.ts) there is no OpenAI leg to serve it.
 *
 * The file stays (vercel.json still configures this path) but it calls no provider. A 410 tells a stale
 * client the endpoint is gone for good, not temporarily down.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function POST() {
  return NextResponse.json(
    { error: 'gone', message: 'This chat endpoint was retired. Use /api/chat/gemini.' },
    { status: 410 },
  );
}
