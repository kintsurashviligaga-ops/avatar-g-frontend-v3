/**
 * app/api/tts/gemini/route.ts — one-shot read-aloud via Gemini NATIVE audio (no ElevenLabs).
 *
 * The chat "read aloud" button (OmniStudio speakMsg) posts a chunk of text here; we call the Gemini TTS
 * model (generateContent → responseModalities:['AUDIO']) with a built-in Google voice and return the
 * spoken audio. Gemini returns raw 16-bit mono PCM (audio/L16;rate=24000), which <audio> can't play, so
 * we wrap it in a minimal WAV container and return audio/wav. Verified live: 24 kHz PCM, natural
 * Georgian, ~1-2 s/chunk. Rate-limited (paid call, unauthenticated so guest read-aloud works too).
 *
 * This is SEPARATE from /api/elevenlabs/tts on purpose — that route still powers film/voiceover; only the
 * chat read-aloud is migrated off ElevenLabs here.
 */
import { NextRequest, NextResponse } from 'next/server';

import { RATE_LIMITS, checkRateLimit } from '@/lib/api/rate-limit';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { GEMINI_LIVE_VOICES } from '@/lib/voice/geminiLive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// Flash TTS = fast one-shot synthesis; overridable via env for the pro/3.x variants.
const TTS_MODEL = (process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts').replace(/^models\//, '');
const DEFAULT_RATE = 24000;
const MAX_TEXT = 2000;

/** Wrap raw 16-bit mono little-endian PCM in a 44-byte WAV header so the browser <audio> can play it. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function POST(req: NextRequest) {
  // Paid Gemini call on an unauthenticated endpoint (guest read-aloud) → rate-limit by IP.
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { text?: string; locale?: string; gender?: 'male' | 'female' };
  const text = (body.text || '').trim().slice(0, MAX_TEXT);
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  const apiKey = resolveGeminiKey();
  if (!apiKey) return NextResponse.json({ error: 'gemini_key_missing' }, { status: 503 });

  const voiceName = GEMINI_LIVE_VOICES[body.gender === 'male' ? 'male' : 'female'];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[tts/gemini] upstream error', res.status, detail.slice(0, 200));
      return NextResponse.json({ error: 'tts_failed', status: res.status }, { status: 502 });
    }
    const data = (await res.json().catch(() => null)) as
      | { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> }
      | null;
    const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const b64 = part?.inlineData?.data;
    if (!b64) return NextResponse.json({ error: 'tts_empty' }, { status: 502 });

    const pcm = Buffer.from(b64, 'base64');
    const rate = Number((part?.inlineData?.mimeType || '').match(/rate=(\d+)/)?.[1]) || DEFAULT_RATE;
    const wav = pcmToWav(pcm, rate);
    // Hand the underlying bytes to NextResponse as a plain ArrayBuffer (Buffer isn't a valid BodyInit type).
    const bytes = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wav.byteLength),
        'X-Voice-Provider': 'gemini-native',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[tts/gemini] threw', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'tts_failed' }, { status: 502 });
  }
}
