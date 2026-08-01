import { NextRequest, NextResponse } from 'next/server';
import { acceptTranscript } from '@/lib/voice/sttAccept';
import { transcribeRealtimePcmChunk } from '@/lib/voice-v2v/providers';
import { transcribeWithGemini, hasGeminiSttKey } from '@/lib/voice-v2v/geminiStt';
import { transcribeWithReplicateWhisper, hasReplicateSttKey } from '@/lib/voice-v2v/replicateStt';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * /api/voice/transcribe — short-utterance speech-to-text for the chat mic.
 *
 * iOS Safari's SpeechRecognition is unreliable / off in many configurations,
 * so the chat falls back to recording a short blob via MediaRecorder and
 * POSTing it here. The route delegates to Whisper (openai-whisper-3-turbo)
 * via the existing voice-v2v provider abstraction.
 *
 * Request: multipart/form-data with:
 *   - audio:    Blob (audio/webm, audio/mp4, audio/wav, etc.)
 *   - language: optional 'ka-GE' | 'en-US' | 'ru-RU' (default 'ka-GE')
 *
 * Response: { text: string, provider: string }
 */
export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;

  try {
    const form = await req.formData();
    const audio = form.get('audio');
    const langInput = String(form.get('language') || 'ka-GE');
    const language: 'ka-GE' | 'en-US' | 'ru-RU' =
      langInput === 'en-US' || langInput === 'ru-RU' ? langInput : 'ka-GE';

    if (!audio || typeof audio === 'string') {
      return NextResponse.json({ error: 'audio is required' }, { status: 400 });
    }

    const bytes = await audio.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: 'empty audio' }, { status: 400 });
    }
    if (bytes.byteLength > 25 * 1024 * 1024) {
      // Whisper's API hard limit is 25 MB. Keep the chat mic short.
      return NextResponse.json({ error: 'audio too large (25MB max)' }, { status: 413 });
    }

    const audioBase64 = Buffer.from(bytes).toString('base64');
    const mimeType = audio.type || 'audio/webm';

    // Primary STT — OpenAI Whisper (OPENAI_API_KEY) or Deepgram (DEEPGRAM_API_KEY).
    let text = '';
    let provider = 'none';
    let primaryErrMsg: string | null = null;
    let geminiErrMsg: string | null = null;
    let replicateErrMsg: string | null = null;
    // ⚠️ GEORGIAN GOES TO THE ONLY ENGINE THAT CAN DO IT — FIRST. The cascade below advances on
    // `!accept(...)`, and for every other language that is still "first non-empty wins". But Georgian
    // was reaching Replicate whisper-large-v3 (the sole ka-capable engine here, and the one this file
    // already calls out as what "rescues the REAL mic") only if BOTH earlier legs came back empty — and
    // they never do. OpenAI gpt-4o-mini-transcribe does not list Georgian as supported and Gemini is an
    // LLM being asked to transcribe; on Georgian audio both return HTTP 200 with a fluent, confident,
    // WRONG string. Non-empty, so the cascade stopped there, every time.
    const georgianFirst = language === 'ka-GE' && hasReplicateSttKey();
    if (georgianFirst) {
      try {
        text = await transcribeWithReplicateWhisper(audioBase64, mimeType, language);
        if (acceptTranscript(text, language)) provider = 'replicate-whisper';
        else text = '';
      } catch (kaErr) {
        replicateErrMsg = kaErr instanceof Error ? kaErr.message : String(kaErr);
        // eslint-disable-next-line no-console
        console.warn('[transcribe] replicate (ka-first) failed:', replicateErrMsg);
      }
    }
    // Skipped entirely when the ka-first leg already produced an ACCEPTED transcript.
    if (!text) {
      try {
        const result = await transcribeRealtimePcmChunk({ audioBase64, language, mimeType });
        const t = (result.text ?? '').trim();
        // ⚠️ NON-EMPTY IS NOT SUCCESS FOR GEORGIAN — see lib/voice/sttAccept. A transliteration or an
        // English rendering is a MISS, and treating it as an answer is what buried the working engine.
        if (acceptTranscript(t, language)) { text = t; provider = result.provider; }
      } catch (primaryErr) {
        primaryErrMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        // eslint-disable-next-line no-console
        console.warn('[transcribe] primary STT failed:', primaryErrMsg);
      }
    }

    // Fallback 1 — Gemini (always configured for chat). Fast when it works, but
    // it only ingests wav/mp3/aac/ogg/flac, so it REJECTS the webm/mp4 the
    // browser mic actually records. Kept first because it's instant on the
    // formats it does accept (and zero extra keys).
    const geminiKeyPresent = hasGeminiSttKey();
    if (!text && geminiKeyPresent) {
      try {
        const t = await transcribeWithGemini(audioBase64, mimeType, language);
        if (acceptTranscript(t, language)) { text = t; provider = 'gemini'; }
      } catch (geminiErr) {
        geminiErrMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        // eslint-disable-next-line no-console
        console.warn('[transcribe] gemini STT fallback failed:', geminiErrMsg);
      }
    }

    // Fallback 2 — Replicate Whisper-large-v3. This is the one that actually
    // rescues the REAL mic: it accepts webm/mp4/mp3/wav alike and runs on the
    // SAME REPLICATE_API_TOKEN the video pipeline already uses, so Georgian
    // dictation works with no new operator secret. Slower (it polls), so it's
    // the last resort after the instant paths.
    const replicateKeyPresent = hasReplicateSttKey();
    if (!text && replicateKeyPresent && !georgianFirst) {
      try {
        const t = await transcribeWithReplicateWhisper(audioBase64, mimeType, language);
        if (acceptTranscript(t, language)) { text = t; provider = 'replicate-whisper'; }
      } catch (replicateErr) {
        replicateErrMsg = replicateErr instanceof Error ? replicateErr.message : String(replicateErr);
        // eslint-disable-next-line no-console
        console.warn('[transcribe] replicate STT fallback failed:', replicateErrMsg);
      }
    }

    // Always 200 — an empty string is a valid "heard nothing" result the client
    // handles gracefully (it never wedges the mic on a 500).
    // `?diag=1` surfaces *why* a transcription produced nothing (which provider
    // ran, key presence, upstream error text) WITHOUT ever exposing the key
    // itself — an operator-only breadcrumb for the "mic types nothing" report.
    if (req.nextUrl.searchParams.get('diag') === '1') {
      return NextResponse.json({
        text,
        provider,
        diag: {
          mimeType,
          audioBytes: bytes.byteLength,
          geminiKeyPresent,
          replicateKeyPresent,
          primaryError: primaryErrMsg,
          geminiError: geminiErrMsg,
          replicateError: replicateErrMsg,
        },
      });
    }
    return NextResponse.json({ text, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
