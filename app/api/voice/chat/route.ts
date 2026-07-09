/**
 * POST /api/voice/chat — the conversational LLM leg of the real-time voice node.
 *
 * Body: { text: string, locale?: 'ka'|'en'|'ru', history?: {role,content}[] }. Authed. Turns the transcribed
 * user turn into a SHORT spoken-friendly reply via the live llmText chain (DeepSeek → Gemini → Anthropic),
 * cleaned for TTS. Never returns empty — an LLM miss yields a localized fallback so the voice loop never
 * stalls in silence. Does NOT touch TTS settings (0.48 stays locked); the client voices the reply via the
 * existing /api/elevenlabs/tts streaming route.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { llmText } from '@/lib/ai/llmText';
import { buildVoiceReplyPrompt, trimForSpeech, voiceFallbackReply, normalizeVoiceLocale, type VoiceTurn } from '@/lib/voice/voicePrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    // Throttle the paid llmText leg for parity with the sibling voice legs (/transcribe READ, /tts WRITE).
    const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const { user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { text?: string; locale?: string; history?: VoiceTurn[] } | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'no text' }, { status: 400 });

    const locale = normalizeVoiceLocale(body?.locale);
    const history = Array.isArray(body?.history) ? body.history.slice(-12) : undefined;
    const { system, user: prompt } = buildVoiceReplyPrompt(text, locale, history);

    const raw = await llmText({ system, user: prompt, maxTokens: 220, temperature: 0.6, timeoutMs: 12_000 }).catch(() => null);
    const reply = trimForSpeech(raw) || voiceFallbackReply(locale);
    return NextResponse.json({ reply, locale });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/voice/chat]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'voice chat failed' }, { status: 500 });
  }
}
