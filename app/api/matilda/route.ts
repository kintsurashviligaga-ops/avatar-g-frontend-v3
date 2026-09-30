/**
 * POST /api/matilda — RETIRED (410 Gone).
 *
 * This was the anonymous "Matilda" voice reply: Claude Haiku text plus ElevenLabs turbo TTS, on the platform's
 * keys, with no auth and no rate limit (it sat in __tests__/api-security.test.ts's grandfathered allowlist).
 * Nothing calls it — the Matilda widget talks to /api/chat/stream and /api/elevenlabs/tts — and voice
 * conversation is Gemini Live now.
 *
 * The file stays (vercel.json still configures this path) but it calls no provider. A 410 tells a stale
 * client the endpoint is gone for good, not temporarily down.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function POST() {
  return NextResponse.json(
    { error: 'gone', message: 'This voice endpoint was retired. Use Live voice mode in the studio.' },
    { status: 410 },
  );
}
