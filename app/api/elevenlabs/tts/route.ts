import { NextRequest, NextResponse } from 'next/server';
import {
  selectTtsModel,
  voiceSettingsForModel,
  type ElevenLabsModelId,
} from '@/lib/audio/tts-model';
import { extractVoiceDirectives } from '@/lib/chat/outputEnforcement';
import { synthesizeGoogleTts } from '@/lib/audio/google-tts';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface TtsRequest {
  text?: string;
  voiceId?: string;
  voice_id?: string;
  locale?: string;
  /** PHASE 52 TASK 5 — optional delivery directive ("calm measured narration",
   *  "excited fast hype"). When present, the asked delivery is mirrored into the
   *  ElevenLabs voice_settings so the read MATCHES the requested tone. Omitting
   *  it preserves the existing per-model defaults (backward compatible). */
  voiceStyle?: string;
}

/**
 * PHASE 52 TASK 5 — fold an explicit delivery directive into the model's
 * baseline voice_settings. The directive's stability/style win (they are the
 * mirrored user intent); similarity_boost / speaker_boost / speed stay on the
 * language-tuned baseline so Georgian phonemes remain stable.
 */
function enforceVoiceSettings(
  base: ReturnType<typeof voiceSettingsForModel>,
  voiceStyle?: string,
): ReturnType<typeof voiceSettingsForModel> {
  if (!voiceStyle || !voiceStyle.trim()) return base;
  const d = extractVoiceDirectives(voiceStyle);
  if (!d.emotion && !d.cadence) return base;
  return {
    ...base,
    stability: d.voiceSettings.stability,
    style: d.voiceSettings.style,
  };
}

function audioResponse(buffer: ArrayBuffer, provider: string): NextResponse {
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buffer.byteLength),
      'X-Voice-Provider': provider,
      'Cache-Control': 'no-store',
    },
  });
}

// Progressive: hit the ElevenLabs /stream endpoint with low-latency optimization
// and PIPE the chunked body straight through — first audio bytes reach the client
// far sooner than buffering the whole file. Consumers that need a blob/arrayBuffer
// (blob playback, MCP) still work; consumers that support MSE play progressively.
async function streamElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string,
  modelId: ElevenLabsModelId,
  voiceStyle?: string,
): Promise<NextResponse | null> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=3`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      // PHASE 48 §3 — model is chosen per-language. Georgian MUST run on
      // eleven_multilingual_v2 (stable Georgian phonemes); turbo is English-first
      // and mangles Georgian. Settings are tuned to match the selected model.
      // PHASE 52 §5 — an explicit delivery directive then mirrors the asked tone.
      model_id: modelId,
      voice_settings: enforceVoiceSettings(voiceSettingsForModel(modelId), voiceStyle),
      apply_text_normalization: 'auto',
    }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    console.error('[elevenlabs/tts] ElevenLabs error', res.status, errBody.slice(0, 200));
    return null;
  }

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-Voice-Provider': 'elevenlabs',
      'X-Voice-Model': modelId,
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

// Google Cloud TTS fallback — now routes through the shared helper, which picks the
// BEST AVAILABLE neural ka-GE voice (Chirp3-HD / Neural2 / Wavenet) instead of the
// old robotic `ka-GE-Standard-A`. Auto-detects language from the text.
async function synthesizeWithGoogleTTS(text: string): Promise<ArrayBuffer | null> {
  return synthesizeGoogleTts(text);
}

export async function POST(req: NextRequest) {
  // Cost/abuse guard: unauthenticated endpoint (powers guest "read aloud"); each
  // call hits the paid ElevenLabs API, so rate-limit by IP.
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  const body = (await req.json()) as TtsRequest;
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  // Georgian text/locale → the dedicated premium Georgian voice (trained on
  // ElevenLabs) when configured; otherwise the default voice. An explicit
  // body.voiceId always wins.
  const isGeorgian = body.locale === 'ka' || /[ა-ჿ]/.test(text);
  // Founder-supplied Georgian voice. CRITICAL ORDER: Georgian text must pick the
  // Georgian voice BEFORE the (English) ELEVENLABS_VOICE_ID — otherwise Georgian
  // gets read by an English voice and sounds heavily accented/robotic.
  const georgianVoiceId = process.env.ELEVENLABS_GEORGIAN_VOICE_ID || 'vWpzdSR8GpLUKR0ai8Li';
  const voiceId = body.voiceId
    ?? body.voice_id
    ?? (isGeorgian ? georgianVoiceId : (process.env.ELEVENLABS_VOICE_ID ?? georgianVoiceId));

  // PHASE 48 §3 — hard-force eleven_multilingual_v2 when the text/locale is
  // Georgian; everything else keeps the low-latency turbo default.
  const modelId = selectTtsModel(text, body.locale);

  // Primary: ElevenLabs (progressive streaming — minimal time-to-first-sound)
  if (apiKey) {
    const streamed = await streamElevenLabs(text, voiceId, apiKey, modelId, body.voiceStyle);
    if (streamed) return streamed;
  }

  // Fallback: Google TTS (uses Gemini key, works for Georgian natively)
  const googleAudio = await synthesizeWithGoogleTTS(text);
  if (googleAudio) return audioResponse(googleAudio, 'google-tts');

  return NextResponse.json({ error: 'No TTS provider available' }, { status: 502 });
}
