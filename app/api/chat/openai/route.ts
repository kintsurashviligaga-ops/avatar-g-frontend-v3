/**
 * POST /api/chat/openai — RETIRED (410 Gone).
 *
 * This was an anonymous, un-rate-limited GPT-4o-mini chat stream with an Anthropic Haiku fallback, on the
 * platform's keys. Its only caller was CommandCenterChat's "ChatGPT" toggle, and CommandCenterChat was mounted
 * only by MainDashboard, which nothing imported (both are deleted) — so no live UI reached it, while any script
 * could spend on it.
 * Product chat is /api/chat/gemini (Google only, see lib/ai/google/policy.ts).
 *
 * The file stays (vercel.json and old clients may still name the path) but it calls no provider. A 410
 * tells a stale client the endpoint is gone for good, not temporarily down.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function POST() {
  return NextResponse.json(
    { error: 'gone', message: 'This chat endpoint was retired. Use /api/chat/gemini.' },
    { status: 410 },
  );
}
