import { NextRequest, NextResponse } from 'next/server';
import { acceptTranscript } from '@/lib/voice/sttAccept';
import { transcribeRealtimePcmChunk } from '@/lib/voice-v2v/providers';
import {
  geminiAudioInput,
  hasGeminiSttKey,
  transcribeWithGeminiDetailed,
  GeminiSttError,
  type GeminiSttResult,
} from '@/lib/voice-v2v/geminiStt';
import { transcribeWithReplicateWhisper, hasReplicateSttKey } from '@/lib/voice-v2v/replicateStt';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { effectiveAdminAllowlist } from '@/lib/auth/adminGuard';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { bookChatUsage } from '@/lib/services/billing/chatBudget';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * /api/voice/transcribe — short-utterance speech-to-text for the chat mic and the voice-call loop.
 *
 * iOS Safari's SpeechRecognition is unreliable / off in many configurations (and Apple's engine has no
 * Georgian), so the studio records a short clip with MediaRecorder and POSTs it here; VoiceConversation
 * posts one clip per spoken turn.
 *
 * Request: multipart/form-data with:
 *   - audio:    Blob (WAV / OGG / FLAC / MP3 / AAC / AIFF preferred; WebM / MP4 best effort — see geminiStt.ts)
 *   - language: optional 'ka-GE' | 'en-US' | 'ru-RU' (default 'ka-GE')
 *
 * Response: { text: string, provider: string, code?: 'unsupported_format' | 'stt_unavailable' }. Always 200 on a
 * provider miss — an empty string is a valid "heard nothing" the client handles without wedging the mic.
 *
 * ⚠️ IT WAS ANONYMOUS. The only gate was the per-IP READ bucket, and every request could spend Replicate, OpenAI,
 * Deepgram and Gemini credit — and `?diag=1` handed upstream error text to anyone. Now: signed in (the generation
 * gate, so FILM_ALLOW_ANONYMOUS is still the single demo switch), a per-USER hourly cap on top of the IP burst guard,
 * and diagnostics for admins only. NOTE: the studio's dictation mic has no guest check of its own yet, so a guest's
 * recorder pass now gets this 401 — the composer should raise `myavatar:auth-required` before recording instead.
 *
 * ENGINES:
 *   • AI_GOOGLE_ONLY (default ON): Gemini only (sttModel() + step-downs). Replicate / OpenAI / Deepgram are never
 *     called, not even as a fallback — a Google miss is an empty transcript, never a silent vendor swap.
 *   • AI_GOOGLE_ONLY=0: the legacy cascade below, unchanged in order.
 */

/** Gemini takes ≤20 MB of INLINE request; base64 inflates by 4/3, and the prompt rides along. */
const GEMINI_INLINE_MAX_BYTES = 14 * 1024 * 1024;
/** Whisper's API hard limit (the legacy cascade). */
const LEGACY_MAX_BYTES = 25 * 1024 * 1024;

type SttLanguage = 'ka-GE' | 'en-US' | 'ru-RU';

/** The sign-in message language, before the form (and its `language` field) has been read. Georgian by default. */
function localeFromHeader(acceptLanguage: string | null): 'ka' | 'en' | 'ru' {
  const first = (acceptLanguage ?? '').split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return first === 'en' || first === 'ru' ? first : 'ka';
}

/**
 * ⚠️ ADMIN = THE EMAIL ALLOWLIST ONLY (lib/auth/adminGuard — code + env + panel grants), checked against the user
 * this request ALREADY authenticated (cookie or bearer). Never user_metadata, never a profiles column, never a
 * query parameter. Fails closed: any error means "not admin".
 */
async function isAdminUser(email: string | null | undefined): Promise<boolean> {
  if (typeof email !== 'string' || !email.trim()) return false;
  try {
    return (await effectiveAdminAllowlist()).includes(email.trim().toLowerCase());
  } catch {
    return false;
  }
}

/** Await a bookkeeping promise for at most `ms`; the timer is cleared either way (no dangling handle). */
async function settleWithin(p: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([p, new Promise<void>((r) => { timer = setTimeout(r, ms); })]);
  } catch {
    /* bookkeeping never fails the request */
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Book a Gemini transcription against the platform budget. Best-effort and bounded — the transcript is the product. */
async function bookStt(result: GeminiSttResult, userId: string | null | undefined): Promise<void> {
  const booking = bookChatUsage({
    model: result.model,
    ...(result.usage?.inputTokens !== undefined ? { inputTokens: result.usage.inputTokens } : {}),
    ...(result.usage?.outputTokens !== undefined ? { outputTokens: result.usage.outputTokens } : {}),
    ...(result.usage?.totalTokens !== undefined ? { totalTokens: result.usage.totalTokens } : {}),
    chars: result.text.length,
    userId: userId ?? null,
  });
  await settleWithin(booking, 1_500);
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;

  try {
    // Sign-in BEFORE any provider is touched — and before the (up to 25 MB) upload is even parsed.
    const { user } = await authedClientFromRequest(req);
    if (mustSignInToGenerate(user?.id)) {
      return NextResponse.json(signInToGenerateBody(localeFromHeader(req.headers.get('accept-language'))), { status: 401 });
    }
    // Per-ACCOUNT ceiling (IP rotation buys nothing). A guest only gets here on a FILM_ALLOW_ANONYMOUS demo
    // deployment, where the IP bucket above is the brake.
    if (user?.id) {
      const perUser = await checkRateLimitByKey(user.id, RATE_LIMITS.STT_USER);
      if (perUser) return perUser;
    }

    const form = await req.formData();
    const audio = form.get('audio');
    const langInput = String(form.get('language') || 'ka-GE');
    const language: SttLanguage = langInput === 'en-US' || langInput === 'ru-RU' ? langInput : 'ka-GE';

    if (!audio || typeof audio === 'string') {
      return NextResponse.json({ error: 'audio is required' }, { status: 400 });
    }

    const bytes = await audio.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: 'empty audio' }, { status: 400 });
    }
    const googleOnly = isAiGoogleOnly();
    const maxBytes = googleOnly ? GEMINI_INLINE_MAX_BYTES : LEGACY_MAX_BYTES;
    if (bytes.byteLength > maxBytes) {
      return NextResponse.json({ error: `audio too large (${Math.round(maxBytes / (1024 * 1024))}MB max)` }, { status: 413 });
    }

    // `?diag=1` is an operator breadcrumb (which engine ran, key presence, upstream error text — never the key).
    // Anyone else asking for it simply gets the normal answer.
    const wantDiag = req.nextUrl.searchParams.get('diag') === '1';
    const diagAllowed = wantDiag && (await isAdminUser(user?.email));

    const audioBase64 = Buffer.from(bytes).toString('base64');
    const declaredMime = audio.type || '';
    const gem = geminiAudioInput(declaredMime, new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 64)));

    let text = '';
    let provider = 'none';
    let code: 'unsupported_format' | 'stt_unavailable' | undefined;
    let primaryErrMsg: string | null = null;
    let geminiErrMsg: string | null = null;
    let replicateErrMsg: string | null = null;
    const geminiKeyPresent = hasGeminiSttKey();
    const replicateKeyPresent = googleOnly ? false : hasReplicateSttKey();

    const runGemini = async (): Promise<void> => {
      if (!gem.mimeType) { code = 'unsupported_format'; return; }
      try {
        const result = await transcribeWithGeminiDetailed(audioBase64, gem.mimeType, language);
        await bookStt(result, user?.id);
        if (acceptTranscript(result.text, language)) { text = result.text; provider = 'gemini'; }
      } catch (geminiErr) {
        geminiErrMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        // A 400 on a container Gemini does not document as audio is a FORMAT miss, not an outage.
        if (geminiErr instanceof GeminiSttError) {
          code = geminiErr.code === 'bad_request' && !gem.native ? 'unsupported_format' : code ?? 'stt_unavailable';
        }
        // eslint-disable-next-line no-console
        console.warn('[transcribe] gemini STT failed:', geminiErr instanceof GeminiSttError ? `${geminiErr.code} ${geminiErr.status ?? ''}` : 'error');
      }
    };

    if (googleOnly) {
      // ── Google only: Gemini is the whole engine. ──
      if (geminiKeyPresent) await runGemini();
      else code = 'stt_unavailable';
    } else {
      // ── Legacy cascade (AI_GOOGLE_ONLY=0) ──
      const mimeType = declaredMime || 'audio/webm';
      // ⚠️ GEORGIAN GOES TO THE ONLY ENGINE THAT CAN DO IT — FIRST. The cascade below advances on
      // `!accept(...)`, and for every other language that is still "first non-empty wins". But Georgian
      // was reaching Replicate whisper-large-v3 (the sole ka-capable engine here, and the one this file
      // already calls out as what "rescues the REAL mic") only if BOTH earlier legs came back empty — and
      // they never do. OpenAI gpt-4o-mini-transcribe does not list Georgian as supported and Gemini is an
      // LLM being asked to transcribe; on Georgian audio both return HTTP 200 with a fluent, confident,
      // WRONG string. Non-empty, so the cascade stopped there, every time.
      const georgianFirst = language === 'ka-GE' && replicateKeyPresent;
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
      // Fallback 1 — Gemini (always configured for chat), now with the container fix (geminiAudioInput).
      if (!text && geminiKeyPresent) await runGemini();
      // Fallback 2 — Replicate Whisper-large-v3: accepts webm/mp4/mp3/wav alike on the REPLICATE_API_TOKEN the
      // video pipeline already uses. Slower (it polls), so it is the last resort after the instant paths.
      if (!text && replicateKeyPresent && !georgianFirst) {
        try {
          const t = await transcribeWithReplicateWhisper(audioBase64, mimeType, language);
          if (acceptTranscript(t, language)) { text = t; provider = 'replicate-whisper'; code = undefined; }
        } catch (replicateErr) {
          replicateErrMsg = replicateErr instanceof Error ? replicateErr.message : String(replicateErr);
          // eslint-disable-next-line no-console
          console.warn('[transcribe] replicate STT fallback failed:', replicateErrMsg);
        }
      }
    }

    if (text) code = undefined;
    const payload = { text, provider, ...(code ? { code } : {}) };
    if (diagAllowed) {
      return NextResponse.json({
        ...payload,
        diag: {
          googleOnly,
          mimeType: declaredMime,
          container: gem.container,
          geminiMime: gem.mimeType,
          geminiNative: gem.native,
          audioBytes: bytes.byteLength,
          geminiKeyPresent,
          replicateKeyPresent,
          primaryError: primaryErrMsg,
          geminiError: geminiErrMsg,
          replicateError: replicateErrMsg,
        },
      });
    }
    return NextResponse.json(payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[transcribe] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'transcription failed' }, { status: 500 });
  }
}
