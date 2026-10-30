import { NextRequest, NextResponse } from 'next/server';
import { acceptTranscript } from '@/lib/voice/sttAccept';
import { heardSpeechLang } from '@/lib/voice/speechLang';
import {
  geminiAudioInput,
  geminiSttBlocker,
  transcribeWithGeminiDetailed,
  GeminiSttError,
  type GeminiSttResult,
} from '@/lib/voice-v2v/geminiStt';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { effectiveAdminAllowlist } from '@/lib/auth/adminGuard';
import { bookChatUsage } from '@/lib/services/billing/chatBudget';
import { STT_MODELS } from '@/lib/ai/google/models';

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
 *   - language: optional 'ka-GE' | 'en-US' | 'ru-RU' | 'auto' (default 'ka-GE'). A HINT: the transcript is written in
 *               the language actually spoken, never translated (geminiStt.sttPrompt). 'auto' = no hint at all.
 *   - model:    optional, the owner's `?stt=` trial (lib/voice/sttTrial): a model from STT_MODELS, honoured for an
 *               ADMIN only and alone (no step-downs), so its timing is its own. Ignored for anyone else.
 *
 * Response: { text: string, provider: string, language?: 'ka-GE' | 'en-US' | 'ru-RU', code?: 'unsupported_format' |
 * 'stt_unavailable' }. `language` is the script the transcript came back in — the browser remembers it for the next
 * dictation (lib/voice/speechLang). Always 200 on a provider miss — an empty string is a valid "heard nothing" the
 * client handles without wedging the mic.
 *
 * ⚠️ IT WAS ANONYMOUS. The only gate was the per-IP READ bucket, and every request could spend Replicate, OpenAI,
 * Deepgram and Gemini credit — and `?diag=1` handed upstream error text to anyone. Now: signed in (the generation
 * gate, so FILM_ALLOW_ANONYMOUS is still the single demo switch), a per-USER hourly cap on top of the IP burst guard,
 * and diagnostics for admins only. NOTE: the studio's dictation mic has no guest check of its own yet, so a guest's
 * recorder pass now gets this 401 — the composer should raise `myavatar:auth-required` before recording instead.
 *
 * ENGINE: Gemini on Vertex AI only (sttModel() + step-downs). A Google miss is an empty transcript, never a silent vendor
 * swap. The legacy Replicate / OpenAI / Deepgram cascade that AI_GOOGLE_ONLY=0 used to restore is gone (MASTER TASK v3.1,
 * audit F-04): no env value reaches it.
 */

/** Gemini takes ≤20 MB of INLINE request; base64 inflates by 4/3, and the prompt rides along. */
const GEMINI_INLINE_MAX_BYTES = 14 * 1024 * 1024;

type SttLanguage = 'ka-GE' | 'en-US' | 'ru-RU' | 'auto';

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
    const language: SttLanguage = langInput === 'en-US' || langInput === 'ru-RU' || langInput === 'auto' ? langInput : 'ka-GE';
    // The admin list is read only when a trial model is named (the owner's link), so no one else's dictation waits on it.
    const requestedModel = String(form.get('model') || '').trim().toLowerCase();
    const trialModel = requestedModel && STT_MODELS.includes(requestedModel) && (await isAdminUser(user?.email))
      ? requestedModel
      : null;

    if (!audio || typeof audio === 'string') {
      return NextResponse.json({ error: 'audio is required' }, { status: 400 });
    }

    const bytes = await audio.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: 'empty audio' }, { status: 400 });
    }
    const maxBytes = GEMINI_INLINE_MAX_BYTES;
    if (bytes.byteLength > maxBytes) {
      return NextResponse.json({ error: `audio too large (${Math.round(maxBytes / (1024 * 1024))}MB max)` }, { status: 413 });
    }

    // `?diag=1` is an operator breadcrumb (which engine ran, key presence, upstream error text — never the key).
    // Anyone else asking for it simply gets the normal answer.
    const wantDiag = req.nextUrl.searchParams.get('diag') === '1';

    const audioBase64 = Buffer.from(bytes).toString('base64');
    const declaredMime = audio.type || '';
    const gem = geminiAudioInput(declaredMime, new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 64)));

    let text = '';
    /** The language code the model named for the speech (`[ru] …`), when it named one. */
    let spoken: string | null = null;
    let provider = 'none';
    let code: 'unsupported_format' | 'stt_unavailable' | undefined;
    let geminiErrMsg: string | null = null;
    // Why Vertex AI cannot serve (variable names only), or null. It is the owner's reason when no call is made at all.
    const blocker = geminiSttBlocker();
    const geminiKeyPresent = !blocker;

    const runGemini = async (): Promise<void> => {
      if (!gem.mimeType) { code = 'unsupported_format'; return; }
      try {
        const result = await transcribeWithGeminiDetailed(audioBase64, gem.mimeType, language, trialModel ? { models: [trialModel] } : {});
        await bookStt(result, user?.id);
        if (acceptTranscript(result.text, language)) { text = result.text; spoken = result.spoken ?? null; provider = 'gemini'; }
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

    // How long the engines took, as `Server-Timing: stt;dur=…`: the composer's dictation metrics (lib/voice/
    // dictationMetrics) split each pass's round-trip into the engine's share and the network's.
    const sttStartedAt = Date.now();
    const timing = () => ({ 'Server-Timing': `stt;dur=${Date.now() - sttStartedAt}` });
    // Gemini is the whole engine.
    if (geminiKeyPresent) await runGemini();
    else { code = 'stt_unavailable'; geminiErrMsg = blocker; }

    if (text) code = undefined;
    const headers = timing();
    // Only a miss has anything to diagnose, so the admin list is read for a miss only: the dictation's final pass
    // always asks (components/chat/composer/useDictation transcribeUrlFor), and a transcript must not wait on the check.
    const diagAllowed = wantDiag && !text && (await isAdminUser(user?.email));
    const heard = text ? heardSpeechLang(text, spoken) : null;
    const payload = { text, provider, ...(heard ? { language: heard } : {}), ...(code ? { code } : {}) };
    if (diagAllowed) {
      return NextResponse.json({
        ...payload,
        diag: {
          googleOnly: true,
          mimeType: declaredMime,
          container: gem.container,
          geminiMime: gem.mimeType,
          geminiNative: gem.native,
          audioBytes: bytes.byteLength,
          geminiKeyPresent,
          geminiError: geminiErrMsg,
          ...(trialModel ? { trialModel } : {}),
        },
      }, { headers });
    }
    return NextResponse.json(payload, { headers });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[transcribe] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'transcription failed' }, { status: 500 });
  }
}
