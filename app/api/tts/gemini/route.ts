/**
 * app/api/tts/gemini/route.ts — one-shot read-aloud via Gemini NATIVE audio (no ElevenLabs).
 *
 * The chat "read aloud" button (OmniStudio speakMsg, lib/audio/premium-tts) and the voice-call loop
 * (VoiceConversation) post a chunk of text here; we call the Gemini TTS model (generateContent →
 * responseModalities:['AUDIO']) with a built-in Google voice and return the spoken audio as ONE WAV (the speech contract,
 * lib/speech). Gemini answers with one or more inline audio parts, raw 16-bit PCM labelled with its rate
 * (audio/L16;codec=pcm;rate=24000) or a complete WAV; lib/speech/geminiAudio reads every part in order, checks the
 * format against the bytes and wraps the samples once (§5.2). Verified live: 24 kHz PCM, natural Georgian,
 * ~1-2 s/chunk. Rate-limited AND signed-in only:
 * it spends the Google Cloud project's balance, and a guest has no assistant reply to read aloud (the studio stops a guest before
 * any turn is sent).
 *
 * Body: { text, locale?: 'ka'|'en'|'ru', gender?: 'male'|'female', voice?: 'Aoede'|'Charon'|'Kore'|'Puck',
 *         personaId?, customPersona? }. `text` longer than SPEECH_MAX_CHARS (2,000) is refused with 413 text_too_long
 *         before any provider I/O; it used to be cut at 2,000 without a word (§5.3.1). The client splits a message into
 *         chunks well below the limit.
 * Voice precedence: an explicit `voice` > `gender` (keeps the persona's voice when it already has that gender) >
 * the active persona's voice > Aoede. ⚠️ Only Aoede and Charon are verified speaking Georgian, so a Georgian chunk
 * maps Kore → Aoede and Puck → Charon (lib/agents/profile liveVoiceFor) — the same rule Live uses.
 *
 * This is SEPARATE from /api/elevenlabs/tts on purpose — that route (Cloud TTS since MASTER TASK v3.1 PR 5d) powers
 * the film and orchestrator voice-overs; this one is the chat read-aloud.
 */
import { NextRequest, NextResponse } from 'next/server';

import { RATE_LIMITS, checkRateLimit, checkRateLimitByKey } from '@/lib/api/rate-limit';
import { googleModelFetch, googleTransportBlocker } from '@/lib/ai/google/transport';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { ttsModel } from '@/lib/ai/google/models';
import { liveVoiceFor, resolveAgentProfile, type AgentProfile, type LiveVoice } from '@/lib/agents/profile';
import { PERSONA_VOICES } from '@/lib/services/personas/personas';
import { bookChatUsage, chatBudgetAllows } from '@/lib/services/billing/chatBudget';
import { isEnabledByDefault } from '@/lib/env/flag';
import { SPEECH_CONTRACT_VERSION, SPEECH_HEADERS, SPEECH_MAX_CHARS, SPEECH_RESPONSE_MIME } from '@/lib/speech/contract';
import { audioFromGeminiParts } from '@/lib/speech/geminiAudio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/** Only for the usage estimate of an answer whose audio was refused (its own rate could not be trusted). */
const ESTIMATE_RATE = 24000;
const MAX_ATTEMPTS = 3;
const DIRECTIVE = 'Read aloud verbatim: ';

type TtsLocale = 'ka' | 'en' | 'ru';

/**
 * speechConfig.languageCode per reply locale.
 *
 * ⚠️ GEORGIAN IS DELIBERATELY ABSENT. The Gemini API reference lists the valid SpeechConfig.languageCode values
 * (en-US, ru-RU, … about thirty) and ka-GE is not one of them; the TTS guide says the model detects the input
 * language itself — and that auto-detection is what was verified speaking Georgian. Sending ka-GE would risk a 400
 * on EVERY Georgian chunk. UNCERTAIN (not exercised live): whether the preview TTS model honours languageCode at
 * all. So it is (a) switchable off with GEMINI_TTS_LANGUAGE_CODE=0 and (b) dropped for the remaining attempts the
 * moment an attempt that carried it answers 400.
 */
const TTS_LANGUAGE_CODE: Readonly<Record<TtsLocale, string | undefined>> = { ka: undefined, en: 'en-US', ru: 'ru-RU' };

/**
 * Only used when Google omits usageMetadata: audio is tokenised at ~32 tokens per second (the Gemini audio
 * docs' input rate — UNCERTAIN for TTS output; the higher figure is the safe direction for the budget guard).
 */
const AUDIO_TOKENS_PER_SECOND = 32;

const MALE_VOICES: ReadonlySet<LiveVoice> = new Set<LiveVoice>(['Charon', 'Puck']);

function normalizeLocale(raw: unknown): TtsLocale {
  return raw === 'en' || raw === 'ru' ? raw : 'ka';
}

/** 'charon' / ' Charon ' → 'Charon'; anything that is not one of PERSONA_VOICES → null. */
function normalizeVoice(raw: unknown): LiveVoice | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  const cap = `${t.charAt(0).toUpperCase()}${t.slice(1).toLowerCase()}`;
  return (PERSONA_VOICES as readonly string[]).includes(cap) ? (cap as LiveVoice) : null;
}

/** See the header for the precedence. The default profile's voice is Aoede, so no persona + no params = Aoede. */
function pickVoice(profile: AgentProfile, voice: unknown, gender: unknown, locale: TtsLocale): LiveVoice {
  const explicit = normalizeVoice(voice);
  let v: LiveVoice = explicit ?? profile.voice;
  if (!explicit && (gender === 'male' || gender === 'female') && (gender === 'male') !== MALE_VOICES.has(v)) {
    v = gender === 'male' ? 'Charon' : 'Aoede';
  }
  return liveVoiceFor(v, locale);
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

const count = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined);

export async function POST(req: NextRequest) {
  // Its own bucket (RATE_LIMITS.TTS): a long reply is ~14 chunk requests, which the shared WRITE bucket 429'd.
  const limited = await checkRateLimit(req, RATE_LIMITS.TTS);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    text?: unknown; locale?: unknown; gender?: unknown; voice?: unknown; personaId?: unknown; customPersona?: unknown;
  };
  const text = (typeof body.text === 'string' ? body.text : '').trim();
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  const locale = normalizeLocale(body.locale);
  // Refused, not cut: a cut read sounds finished while the end of the message was never spoken.
  if (text.length > SPEECH_MAX_CHARS) {
    return NextResponse.json({ error: 'text_too_long', maxChars: SPEECH_MAX_CHARS }, { status: 413 });
  }

  // ⚠️ IT WAS OPEN TO ANYONE ("so guest read-aloud works too"), with up to three billed attempts per call and only a
  // per-IP limit whose IP header was spoofable. A guest has no reply to read — the studio stops them before any turn
  // is sent — so the only anonymous caller was someone spending our Gemini balance directly. Both clients
  // (OmniStudio speakMsg, lib/audio/premium-tts) already treat a non-OK answer as "stay silent".
  const { user } = await authedClientFromRequest(req);
  if (mustSignInToGenerate(user?.id)) return NextResponse.json(signInToGenerateBody(locale), { status: 401 });
  // Per-ACCOUNT daily ceiling, keyed on the verified uid (the IP bucket above is only the burst guard).
  if (user?.id) {
    const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.TTS_USER);
    if (capped) return capped;
  }

  // Vertex AI must be able to serve (v3.1: the only transport; an AI Studio key never makes it possible). The error
  // name predates Vertex and is kept for the client.
  if (googleTransportBlocker()) return NextResponse.json({ error: 'gemini_key_missing' }, { status: 503 });

  const model = ttsModel();
  const profile = resolveAgentProfile({
    personaId: typeof body.personaId === 'string' ? body.personaId : null,
    customPersona: body.customPersona,
  });
  const voiceName = pickVoice(profile, body.voice, body.gender, locale);

  // Platform budget pre-check, before any provider I/O. Fails CLOSED inside chatBudgetAllows (MASTER TASK v3.1): a guard
  // fault is a 503 here too, never unmetered speech.
  if (!(await chatBudgetAllows(text, model))) {
    return NextResponse.json({ error: 'budget_exhausted' }, { status: 503 });
  }

  let languageCode = isEnabledByDefault(process.env.GEMINI_TTS_LANGUAGE_CODE) ? TTS_LANGUAGE_CODE[locale] : undefined;

  // "Read aloud verbatim:" is a DIRECTIVE (not spoken — verified by byte-for-byte audio-length
  // comparison) that stops the TTS model from trying to ANSWER question-like text. Without it, input such
  // as "გამარჯობა, როგორ ხარ?" makes the model attempt a reply and return HTTP 400 ("Model tried to
  // generate text, but it should only be used for TTS"). Even with it, the preview TTS model very
  // occasionally still slips into answer-mode, so we retry.
  const callGemini = async (): Promise<Response> =>
    // Through the Google transport: the API key rides in a header (never the URL), or Vertex gets a WIF token.
    // ⚠️ The TTS model on Vertex AI is not proven for this project yet — a miss there is a 502, not a switch.
    googleModelFetch(model, 'generateContent', {
      method: 'POST',
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${DIRECTIVE}${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            ...(languageCode ? { languageCode } : {}),
          },
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });

  try {
    // The preview TTS model intermittently slips into answer-mode (HTTP 400) or flakes under load, so a
    // single retry still dropped ~1 in 5 chunks from the read-aloud in prod. Retry up to 3 times total
    // with a short backoff → the effective drop rate falls below ~1%, so the whole message is read.
    let res = await callGemini();
    for (let attempt = 1; attempt < MAX_ATTEMPTS && !res.ok; attempt++) {
      const detail = await res.text().catch(() => '');
      console.warn(`[tts/gemini] upstream ${res.status} (attempt ${attempt} — retrying)`, detail.slice(0, 120));
      // A 400 while a languageCode rode along may be the languageCode itself (see TTS_LANGUAGE_CODE) — the
      // remaining attempts go without it, i.e. exactly the request shape verified live.
      if (res.status === 400 && languageCode) languageCode = undefined;
      await new Promise((r) => setTimeout(r, 250 * attempt));
      res = await callGemini();
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[tts/gemini] upstream error (after ${MAX_ATTEMPTS} attempts)`, res.status, detail.slice(0, 200));
      return NextResponse.json({ error: 'tts_failed', status: res.status }, { status: 502 });
    }
    const data = (await res.json().catch(() => null)) as
      | {
          candidates?: Array<{ content?: { parts?: unknown } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        }
      | null;
    const audio = audioFromGeminiParts(data?.candidates?.[0]?.content?.parts);

    // Book what Google reported (TTS-family rates in costModel) — also when the audio it sent is refused below, since
    // Google has charged for it either way. Estimate from the audio length only when it reported nothing. Bounded: the
    // audio is the product, bookkeeping must not hold it back. An answer with no audio at all books nothing, as before.
    if (audio.ok || audio.audioParts > 0) {
      const u = data?.usageMetadata;
      const inputTokens = count(u?.promptTokenCount);
      const seconds = audio.ok ? audio.info.durationMs / 1000 : audio.audioBytes / (ESTIMATE_RATE * 2);
      const outputTokens = count(u?.candidatesTokenCount) ?? Math.ceil(seconds * AUDIO_TOKENS_PER_SECOND);
      const totalTokens = count(u?.totalTokenCount);
      await settleWithin(
        bookChatUsage({
          model,
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          outputTokens,
          ...(totalTokens !== undefined ? { totalTokens } : {}),
          inputChars: text.length + DIRECTIVE.length,
          userId: user?.id ?? null,
        }),
        1_500,
      );
    }

    if (!audio.ok && audio.fault === 'no_audio') return NextResponse.json({ error: 'tts_empty' }, { status: 502 });
    if (!audio.ok) {
      // A format we cannot prove is refused rather than played too fast, too slow or with a header read as sound.
      console.error('[tts/gemini] audio refused', audio.fault, `(${audio.audioParts} part(s))`);
      return NextResponse.json({ error: 'tts_bad_audio', fault: audio.fault }, { status: 502 });
    }
    if (audio.info.frames === 0) return NextResponse.json({ error: 'tts_empty' }, { status: 502 });
    const wav = audio.wav;

    // Hand the underlying bytes to NextResponse as a plain ArrayBuffer (Buffer isn't a valid BodyInit type).
    const bytes = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': SPEECH_RESPONSE_MIME,
        'Content-Length': String(wav.byteLength),
        'X-Voice-Provider': 'gemini-native',
        [SPEECH_HEADERS.voice]: voiceName,
        [SPEECH_HEADERS.contract]: String(SPEECH_CONTRACT_VERSION),
        [SPEECH_HEADERS.sampleRate]: String(audio.info.sampleRate),
        [SPEECH_HEADERS.channels]: String(audio.info.channels),
        [SPEECH_HEADERS.frames]: String(audio.info.frames),
        [SPEECH_HEADERS.model]: model,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[tts/gemini] threw', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'tts_failed' }, { status: 502 });
  }
}
