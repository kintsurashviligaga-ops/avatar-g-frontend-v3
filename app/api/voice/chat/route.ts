/**
 * POST /api/voice/chat — the conversational LLM leg of the real-time voice node.
 *
 * Body: { text: string, locale?: 'ka'|'en'|'ru', history?: {role,content}[] }. Authed. Turns the transcribed
 * user turn into a SHORT spoken-friendly reply via the live llmText chain (DeepSeek → Gemini → Anthropic),
 * cleaned for TTS. Never returns empty — an LLM miss yields a localized fallback so the voice loop never
 * stalls in silence.
 *
 * PHASE 35 — REVERTED to a bulletproof SYNCHRONOUS full-response buffer. The Phase-33 NDJSON sentence
 * streaming was rolled back at the client's request: the client awaits this whole reply, hands the unified
 * text block to ElevenLabs TTS in ONE call, and plays a single unbroken buffer — no chunk slicing, no
 * dropped words. `llmText` is bounded (12s timeout) so a hung provider can't stall the turn.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { llmText } from '@/lib/ai/llmText';
import { buildVoiceReplyPrompt, trimForSpeech, voiceFallbackReply, normalizeVoiceLocale, detectSpokenLocale, type VoiceTurn } from '@/lib/voice/voicePrompt';
import { getUserProfileFacts, buildProfilePreamble, extractProfileFacts, saveUserProfileFacts } from '@/lib/chat/userMemory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    // Throttle the paid llmText leg for parity with the sibling voice legs (/transcribe READ, /tts WRITE).
    const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const { supabase, user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { text?: string; locale?: string; history?: VoiceTurn[] } | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'no text' }, { status: 400 });

    // Answer in the language the user actually SPOKE (transcript script), not merely the UI locale — so a Russian
    // utterance in a Georgian-UI session gets a Russian reply + Russian TTS voice, never a Georgian one. Falls back
    // to the UI locale when the transcript has no decisive script. The client uses the returned `locale` for TTS.
    const uiLocale = normalizeVoiceLocale(body?.locale);
    const locale = detectSpokenLocale(text, uiLocale);
    const history = Array.isArray(body?.history) ? body.history.slice(-12) : undefined;
    const { system, user: prompt } = buildVoiceReplyPrompt(text, locale, history);

    // VECTOR 3 — inject the user's cross-chat memory into the VOICE persona (+ extract facts), so Agent G is
    // ONE companion: the name/bio the user set in text chat carries into the voice call. Fail-open. Kept short
    // so it doesn't bloat the low-latency voice payload.
    let effectiveSystem = system;
    try {
      const facts = await getUserProfileFacts(supabase, user.id);
      const preamble = buildProfilePreamble(facts);
      if (preamble) effectiveSystem = `${preamble}\n\n${system}`;
      const fresh = extractProfileFacts(text);
      if (fresh.length) void saveUserProfileFacts(supabase, user.id, fresh);
    } catch {
      // memory is best-effort — never block the voice turn
    }

    // VECTOR 2 — Georgian rides the slow eleven_v3 TTS (synthesis time scales with CHARACTER count), so keep
    // the payload SMALL: a tight token cap on generation + a tight spoken-char cap on the result directly cut
    // synthesis latency. en/ru (fast turbo) get a little more room. The persona already enforces 1-2 sentences.
    const maxTokens = locale === 'ka' ? 120 : 160;
    const speechCap = locale === 'ka' ? 320 : 520;
    const raw = await llmText({ system: effectiveSystem, user: prompt, maxTokens, temperature: 0.6, timeoutMs: 12_000 }).catch(() => null);
    const reply = trimForSpeech(raw, speechCap) || voiceFallbackReply(locale);
    return NextResponse.json({ reply, locale });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/voice/chat]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'voice chat failed' }, { status: 500 });
  }
}
