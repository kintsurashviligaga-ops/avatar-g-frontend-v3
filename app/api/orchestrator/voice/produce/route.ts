/**
 * POST /api/orchestrator/voice/produce — Voice (ElevenLabs) Swarm (SSE).
 *
 * text → Agent H (vocal mastery: dynamic range + emotional timbre) → ElevenLabs
 * synthesis → upload to Storage → signed audio URL for the inline player.
 * Streams: [Agent H: Synthesizing Vocal Frequency Spectrum…] →
 *          [ElevenLabs: Injecting Emotional Voice Clones…] → completed | failed.
 * Authenticated (dev-bypass under `next dev`). Persona/emotion is inferred from
 * the text via Agent V's directive (carried as metadata; ElevenLabs voice is the
 * working synthesis path).
 */
import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse, PRODUCE_COST } from '@/lib/orchestrator/rate-limit';
import { deductCredits } from '@/lib/orchestrator/ledger';
import { extractPersonaDirective } from '@/lib/orchestrator/avatar';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Body { text?: string; locale?: string }

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user && process.env.NODE_ENV !== 'development') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (user) { const rate = await checkProduceRate(user.id); if (!rate.ok) return rateLimitedResponse(rate); }

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 }); }
  const text = String(body.text ?? '').trim();
  if (!text) return new Response(JSON.stringify({ error: 'text required' }), { status: 400 });
  const locale = (body.locale === 'en' || body.locale === 'ru') ? body.locale : 'ka';
  const origin = new URL(req.url).origin;
  const persona = extractPersonaDirective(text);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } };
      try {
        emit({ stage: 'synthesizing', pct: 15, ticker: '[Agent H: Synthesizing Vocal Frequency Spectrum…]', expression: persona.expression });
        emit({ stage: 'cloning', pct: 40, ticker: '[ElevenLabs: Injecting Emotional Voice Clones…]' });

        const res = await fetch(`${origin}/api/elevenlabs/tts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, locale }),
        });
        if (!res.ok) { emit({ stage: 'failed', error: `tts_${res.status}` }); controller.close(); return; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) { emit({ stage: 'failed', error: 'empty_audio' }); controller.close(); return; }

        emit({ stage: 'uploading', pct: 80, ticker: '[Mastering + publishing track…]' });
        const url = await uploadAndSign('renders', `voice/${Date.now()}.mp3`, buf.toString('base64'), 'audio/mpeg');
        if (!url) { emit({ stage: 'failed', error: 'upload_failed' }); controller.close(); return; }

        if (user) await deductCredits(user.id, PRODUCE_COST.voice, `voice:${Date.now()}`).catch(() => null);
        emit({ stage: 'completed', pct: 100, url, expression: persona.expression });
        controller.close();
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 160) : 'voice pipeline failed' });
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
