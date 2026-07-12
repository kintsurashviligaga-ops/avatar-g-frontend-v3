/**
 * POST /api/voice/chat — the conversational LLM leg of the real-time voice node.
 *
 * Body: { text: string, locale?: 'ka'|'en'|'ru', history?: {role,content}[] }. Authed.
 *
 * PHASE 33 (VECTOR 2) — LOW-LATENCY STREAMING. Instead of blocking on the WHOLE reply before the client
 * can speak, this STREAMS the reply as newline-delimited JSON sentences (`{"s":"…"}\n`) the instant each
 * one closes, so time-to-first-audio drops from (full reply + first synth) to (first sentence + first synth).
 * Streaming runs through DeepSeek when DEEPSEEK_API_KEY is set; otherwise (or on any streaming miss) it
 * FALLS BACK to the proven blocking llmText chain and emits the whole reply as a single line — so the client
 * behaves identically whether it receives 1 line or N, and the loop never stalls in silence.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { llmText } from '@/lib/ai/llmText';
import { DeepSeekProvider } from '@/lib/providers/deepseek';
import { createSentenceAccumulator } from '@/lib/voice/sentenceStream';
import { buildVoiceReplyPrompt, trimForSpeech, voiceFallbackReply, normalizeVoiceLocale, type VoiceTurn } from '@/lib/voice/voicePrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Wall-clock cap on the streaming leg — a hanging provider must not hold the socket. Enforced with an
// AbortController (not an in-loop time check, which can't fire while parked before the first token). On
// timeout the socket is cancelled and we fall through to the blocking chain. Kept under the client's 25s
// turn abort even when the ~10s blocking fallback stacks on top (12 + 10 = 22 < 25).
const STREAM_DEADLINE_MS = 12_000;

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

    const encoder = new TextEncoder();
    const line = (s: string): Uint8Array => encoder.encode(`${JSON.stringify({ s })}\n`);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let emitted = 0;
        try {
          const ds = new DeepSeekProvider();
          if (ds.isAvailable()) {
            const acc = createSentenceAccumulator();
            // Abortable stall deadline — fires even if DeepSeek parks before the first token; aborting also
            // cancels the socket (no lingering connection). On abort streamText throws → the catch below.
            const ac = new AbortController();
            const deadline = setTimeout(() => { try { ac.abort(); } catch { /* noop */ } }, STREAM_DEADLINE_MS);
            try {
              for await (const delta of ds.streamText({ system_prompt: system, prompt, max_tokens: 220, temperature: 0.6, signal: ac.signal })) {
                for (const sentence of acc.push(delta)) {
                  const clean = trimForSpeech(sentence);
                  if (clean) { controller.enqueue(line(clean)); emitted += 1; }
                }
              }
              const tail = acc.flush();
              if (tail) { const clean = trimForSpeech(tail); if (clean) { controller.enqueue(line(clean)); emitted += 1; } }
            } catch {
              // streaming failed / aborted mid-way — if nothing was emitted we fall back below; if some
              // sentences already streamed, the client speaks what it got (graceful partial, never a hard error).
            } finally {
              clearTimeout(deadline);
            }
          }
          // Fallback: streaming unavailable / produced nothing → the proven blocking chain, one line.
          if (emitted === 0) {
            const raw = await llmText({ system, user: prompt, maxTokens: 220, temperature: 0.6, timeoutMs: 10_000 }).catch(() => null);
            const reply = trimForSpeech(raw) || voiceFallbackReply(locale);
            controller.enqueue(line(reply));
          }
        } catch {
          // Absolute last resort — never close the stream empty; the client must always have something to say.
          try { controller.enqueue(line(voiceFallbackReply(locale))); } catch { /* noop */ }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no', // don't let a proxy buffer the stream (defeats the point)
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/voice/chat]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'voice chat failed' }, { status: 500 });
  }
}
