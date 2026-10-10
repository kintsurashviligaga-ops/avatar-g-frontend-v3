/**
 * POST /api/voice/chat — the conversational LLM leg of the REST voice loop (VoiceConversation: mic → /transcribe →
 * here → /api/tts/gemini).
 *
 * Body: { text: string, locale?: 'ka'|'en'|'ru', history?: {role,content}[], personaId?, customPersona?,
 *         gender?: 'male'|'female', voice?: 'Aoede'|'Charon'|'Kore'|'Puck' }. Signed in.
 * Returns { reply, locale, gender, voice } — `locale` is the language the user SPOKE, `voice`/`gender` are what the
 * client should pass straight on to /api/tts/gemini so the reply is voiced by the persona's (or the chosen) voice.
 * Never returns an empty reply — an LLM miss yields a localized fallback so the loop never stalls in silence.
 *
 * Synchronous full-response buffer (PHASE 35): the client awaits the whole reply, hands it to TTS in ONE call and
 * plays a single unbroken buffer — no chunk slicing, no dropped words. `llmText` is bounded (12s timeout).
 *
 * ENGINE: llmText with googleOnly = isAiGoogleOnly() — Gemini only by default (no DeepSeek / Atlas / Anthropic leg);
 * AI_GOOGLE_ONLY=0 restores the old multi-vendor chain. Google Search grounding rides along on the Gemini leg
 * (VOICE_SEARCH_RULE; VOICE_GOOGLE_SEARCH=0 turns it off). The budget guard runs inside llmText; this route pre-checks
 * it too, so an exhausted budget is SPOKEN as such instead of as "sorry, I didn't catch that".
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { llmText } from '@/lib/ai/llmText';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { isEnabledByDefault } from '@/lib/env/flag';
import { resolveAgentProfile, toGeminiLiveSetup, DEFAULT_AGENT_PROFILE_ID, type AgentProfile, type LiveVoice } from '@/lib/agents/profile';
import { PERSONA_VOICES } from '@/lib/services/personas/personas';
import { chatBudgetAllows } from '@/lib/services/billing/chatBudget';
import { buildVoiceReplyPrompt, trimForSpeech, voiceFallbackReply, normalizeVoiceLocale, detectSpokenLocale, type VoiceLocale, type VoiceTurn } from '@/lib/voice/voicePrompt';
import { getUserProfileFacts, buildProfilePreamble, extractProfileFacts, saveUserProfileFacts } from '@/lib/chat/userMemory';
import { joinMemory, newestSavedFacts, savedFactsBlock } from '@/lib/memory/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * ⚠️ THE ≤20-WORD CAP WAS AN ELEVENLABS eleven_v3 WORKAROUND, AND THIS LOOP NO LONGER USES ELEVENLABS. voicePersona's
 * "1-2 sentences, under 20 words" existed only because v3's Georgian synthesis time scaled with character count
 * (lib/voice/voicePrompt.ts says so). Replies are voiced by Gemini TTS now (~1-2 s per 600-char chunk, verified in
 * Georgian), so that cap only made the assistant curt. The loop now speaks with the fuller LIVE persona (the one
 * Gemini Live uses) plus THIS rule, which keeps a reply short enough that one TTS call voices it quickly — the
 * client does not start playback until the whole reply is synthesised. voicePersona itself is left alone.
 */
const VOICE_LENGTH_RULE =
  'VOICE REPLY LENGTH: this reply is spoken aloud by text-to-speech and the user waits for all of it. Keep it to at '
  + 'most three short sentences (about 50 words). For a big topic, give the key point and offer to go deeper.';

/**
 * Google Search on the voice loop, like the text chat and Gemini Live (VOICE_GOOGLE_SEARCH=0 is the kill switch). The
 * model decides when to look: a greeting costs no search, "what's the weather in Tbilisi" does one. Said in the
 * prompt too, so the model never answers "I can't check that live".
 */
const VOICE_SEARCH_RULE =
  'LIVE FACTS: you can search the web (Google Search) during this conversation. For anything current — news, '
  + 'prices, exchange rates, scores, weather, opening hours — look it up and say the answer plainly, without links.';

/**
 * Generation / spoken caps. Georgian is token-dense (the Mkhedruli script costs ~2-3× the tokens of English per
 * word), so it gets the larger token cap for the same ~50 spoken words. The char cap is a backstop for a model that
 * ignores the length rule — the cut lands on a sentence boundary (see capAtSentence), never mid-word.
 */
const MAX_TOKENS: Record<VoiceLocale, number> = { ka: 400, en: 280, ru: 340 };
const SPEECH_CHAR_CAP = 600;

/** The pre-profile voice temperature, kept for "no persona" so wiring profiles changes nothing for it. */
const DEFAULT_VOICE_TEMPERATURE = 0.6;

const BUDGET_REPLY: Record<VoiceLocale, string> = {
  ka: 'ბოდიში — პლატფორმის დღევანდელი AI ბიუჯეტი ამოიწურა. სცადეთ ცოტა ხანში.',
  en: "Sorry — the platform's AI budget for this period is exhausted. Please try again later.",
  ru: 'Извините — лимит ИИ платформы на этот период исчерпан. Попробуйте позже.',
};

const MALE_VOICES: ReadonlySet<LiveVoice> = new Set<LiveVoice>(['Charon', 'Puck']);

function normalizeVoice(raw: unknown): LiveVoice | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  const cap = `${t.charAt(0).toUpperCase()}${t.slice(1).toLowerCase()}`;
  return (PERSONA_VOICES as readonly string[]).includes(cap) ? (cap as LiveVoice) : null;
}

/**
 * The reply voice: an explicit `voice` > `gender` (the persona's voice survives when it already has that gender) >
 * the persona's voice > Aoede. The Georgian-verification mapping (Kore → Aoede, Puck → Charon for ka) happens in
 * toGeminiLiveSetup via liveVoiceFor, so the voice returned here is always one that speaks the reply's language.
 */
function voiceFor(profile: AgentProfile, voice: unknown, gender: unknown): LiveVoice {
  const explicit = normalizeVoice(voice);
  let v: LiveVoice = explicit ?? profile.voice;
  if (!explicit && (gender === 'male' || gender === 'female') && (gender === 'male') !== MALE_VOICES.has(v)) {
    v = gender === 'male' ? 'Charon' : 'Aoede';
  }
  return v;
}

/** Cut to ≤ max chars at the last sentence end (. ! ? …) inside the window; a hard cut only if there is none. */
function capAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const window = s.slice(0, max);
  const idx = Math.max(...['.', '!', '?', '…'].map((p) => window.lastIndexOf(p)));
  return idx >= Math.floor(max / 3) ? window.slice(0, idx + 1).trim() : window.trim();
}

export async function POST(req: NextRequest) {
  try {
    // Throttle the paid llmText leg for parity with the sibling voice legs.
    const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const { supabase, user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    // A voice-loop turn IS a chat turn (a Gemini text reply): it draws on the same per-account daily allowance as
    // /api/chat/gemini, so rotating IPs across the two routes buys nothing.
    const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.CHAT_USER);
    if (capped) return capped;

    const body = (await req.json().catch(() => null)) as {
      text?: unknown; locale?: unknown; history?: unknown; personaId?: unknown; customPersona?: unknown; gender?: unknown; voice?: unknown;
    } | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'no text' }, { status: 400 });

    // Answer in the language the user actually SPOKE (transcript script), not merely the UI locale — so a Russian
    // utterance in a Georgian-UI session gets a Russian reply + Russian TTS voice, never a Georgian one. Falls back
    // to the UI locale when the transcript has no decisive script. The client uses the returned `locale` for TTS.
    const uiLocale = normalizeVoiceLocale(body?.locale);
    const locale = detectSpokenLocale(text, uiLocale);
    const history = Array.isArray(body?.history) ? (body!.history as VoiceTurn[]).slice(-12) : undefined;
    // The user half (rolling history + this turn). Its `system` (the terse ≤20-word persona) is replaced below.
    const { user: prompt } = buildVoiceReplyPrompt(text, locale, history);

    // The agent profile the user picked in text chat, re-validated server-side (a custom persona arrives in the body
    // on every turn and is sanitized + clamped by resolveAgentProfile). toGeminiLiveSetup gives the SAME spoken
    // system block Gemini Live uses: live persona [+ persona directive + "speak, no markdown" rule], and the voice.
    const profile = resolveAgentProfile({
      personaId: typeof body?.personaId === 'string' ? body.personaId : null,
      customPersona: body?.customPersona,
    });
    const personaActive = profile.id !== DEFAULT_AGENT_PROFILE_ID;
    const spoken = toGeminiLiveSetup({ ...profile, voice: voiceFor(profile, body?.voice, body?.gender) }, { locale });
    const voice = spoken.voiceName as LiveVoice;
    const gender: 'male' | 'female' = MALE_VOICES.has(voice) ? 'male' : 'female';
    const search = profile.googleSearch && isAiGoogleOnly() && isEnabledByDefault(process.env.VOICE_GOOGLE_SEARCH);
    // The length rule stays LAST (the model weighs the last instruction most); the search rule sits before it.
    let effectiveSystem = `${spoken.systemInstruction}\n\n${search ? `${VOICE_SEARCH_RULE}\n\n` : ''}${VOICE_LENGTH_RULE}`;

    // The memory read and the budget check are independent round-trips: run them TOGETHER (a voice turn waits on
    // every millisecond before the model starts). The budget estimate leaves out the memory preamble — a few dozen
    // tokens, and the guard fails open anyway.
    const [facts, saved, budgetOk] = await Promise.all([
      getUserProfileFacts(supabase, user.id).catch(() => null),
      newestSavedFacts(supabase, user.id),
      chatBudgetAllows(`${effectiveSystem} ${prompt}`),
    ]);

    // VECTOR 3 — inject the user's cross-chat memory into the VOICE persona (+ extract facts), so Agent G is
    // ONE companion: the name/bio the user set in text chat carries into the voice call. Fail-open. Kept short
    // so it doesn't bloat the low-latency voice payload.
    try {
      const preamble = joinMemory(facts ? buildProfilePreamble(facts) : null, savedFactsBlock(saved));
      if (preamble) effectiveSystem = `${preamble}\n\n${effectiveSystem}`;
      const fresh = extractProfileFacts(text);
      if (fresh.length) void saveUserProfileFacts(supabase, user.id, fresh);
    } catch {
      // memory is best-effort — never block the voice turn
    }

    // An exhausted platform budget is said out loud. (llmText re-checks it; the guard's read is cached, so the
    // second check is free.) Fails OPEN like every chatBudget call.
    if (!budgetOk) {
      return NextResponse.json({ reply: BUDGET_REPLY[locale], locale, gender, voice, code: 'budget' });
    }

    const raw = await llmText({
      system: effectiveSystem,
      user: prompt,
      maxTokens: MAX_TOKENS[locale],
      temperature: personaActive ? spoken.temperature : DEFAULT_VOICE_TEMPERATURE,
      // A grounded turn spends a search round-trip first; it gets a little more room inside maxDuration.
      timeoutMs: search ? 15_000 : 12_000,
      googleOnly: isAiGoogleOnly(),
      ...(search ? { googleSearch: true } : {}),
    }).catch(() => null);
    const cleaned = trimForSpeech(raw, SPEECH_CHAR_CAP * 2);
    const reply = capAtSentence(cleaned, SPEECH_CHAR_CAP) || voiceFallbackReply(locale);
    return NextResponse.json({ reply, locale, gender, voice });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/voice/chat]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'voice chat failed' }, { status: 500 });
  }
}
