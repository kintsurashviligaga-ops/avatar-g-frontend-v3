/**
 * POST /api/elevenlabs/tts — text → MP3, signed in only. The path keeps its old name so its callers stay as they are;
 * the voice is Google Cloud TTS (lib/audio/google-tts, on the Vertex Workload Identity token) since MASTER TASK v3.1
 * PR 5d. ElevenLabs is not called from here any more, and there is no other engine behind Cloud TTS.
 */
import { NextRequest, NextResponse } from 'next/server';
import { numbersToGeorgianWords } from '@/lib/chat/georgianNumbers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { requestedVoiceId } from '@/lib/audio/voiceId';
import { synthesizeGoogleTts, ttsLanguageCode } from '@/lib/audio/google-tts';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface TtsRequest {
  text?: string;
  voiceId?: string;
  voice_id?: string;
  locale?: string;
  /** Accepted for old callers; Cloud TTS has no counterpart to ElevenLabs' stability/style, so it changes nothing. */
  voiceStyle?: string;
  /** Picks a male or female voice for the text's language. Female when unset. */
  gender?: 'male' | 'female';
}

export async function POST(req: NextRequest) {
  // Burst guard per IP, ahead of the session lookup below.
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  const body = (await req.json()) as TtsRequest;
  let text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate). Read-aloud moved to /api/tts/gemini; what an anonymous POST used to buy
  // here was up to 5,000 characters of speech on the platform's accounts, with no account of the caller's behind it.
  //
  // ⚠️ SERVER-SIDE SELF-CALLERS MUST FORWARD THE SESSION. /api/orchestrator/produce (genVoice) and
  // /api/orchestrator/voice/produce fetch this route from the server; they pass the caller's `cookie` /
  // `authorization` through (lib/api/forwardSession), or their voice step gets this 401.
  const { user } = await authedClientFromRequest(req);
  if (mustSignInToGenerate(user?.id)) {
    return NextResponse.json(signInToGenerateBody(body.locale), { status: 401 });
  }

  // A named voice was an ElevenLabs voice (a catalogue or cloned id). Cloud TTS cannot speak in it, and answering in a
  // different voice than the one chosen is the silent swap PROJECT_MASTER R7 forbids, so a named voice is refused —
  // before any provider call — with the studio's google_only body. A malformed id stays the 400 it was.
  const asked = requestedVoiceId(body.voiceId ?? body.voice_id);
  if (asked === null) {
    return NextResponse.json({ error: 'voiceId is not a valid voice id' }, { status: 400 });
  }
  if (asked) return refuseOutsideEngine(req);

  const languageCode = ttsLanguageCode(text, body.locale);
  // NUMERIC NORMALIZATION (V2) — spell Arabic digits as Georgian cardinal words BEFORE synthesis so the engine reads
  // "190" as "ას ოთხმოცდაათი", never digit-by-digit. Georgian text ONLY — en/ru keep the engine's own normalization.
  if (languageCode === 'ka-GE') text = numbersToGeorgianWords(text);

  const audio = await synthesizeGoogleTts(text, { languageCode, gender: body.gender === 'male' ? 'MALE' : 'FEMALE' });
  if (!audio || audio.byteLength < 1024) {
    // One engine, no fallback: a Cloud TTS miss is this route's explicit error.
    return NextResponse.json({ error: 'No TTS provider available' }, { status: 502 });
  }
  return new NextResponse(audio, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.byteLength),
      'X-Voice-Provider': 'google-cloud-tts',
      'Cache-Control': 'no-store',
    },
  });
}
