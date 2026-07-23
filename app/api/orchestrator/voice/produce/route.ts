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
import { reserveProduce, refundProduce, idemRef, type Reservation } from '@/lib/orchestrator/produceBilling';
import { createJob, recordJobEvent, recordJobReservation } from '@/lib/orchestrator/jobs';
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

  // Durable job row (#5).
  const pipelineId = `vox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jobId = user ? pipelineId : null;
  if (user) await createJob({ id: pipelineId, userId: user.id, serviceType: 'voice', params: { chars: text.length, locale } });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } recordJobEvent(jobId, o); };
      const ref = idemRef('voice', pipelineId, body);
      let reservation: Reservation = { proceed: true, charged: false, reason: 'skipped' };
      let succeeded = false;
      try {
        if (user) {
          reservation = await reserveProduce(user.id, PRODUCE_COST.voice, ref);
          if (!reservation.proceed) { emit({ stage: 'failed', error: 'insufficient_credits', reason: reservation.reason, balance: reservation.balance }); return; }
          // Stamp the reserve onto the durable row so the cron drainer can refund it idempotently if this
          // render is abandoned (tab closed) and the in-route refund below never fires. Only when charged.
          if (jobId && reservation.charged) await recordJobReservation(jobId, { ref, credits: PRODUCE_COST.voice });
        }
        emit({ stage: 'synthesizing', pct: 15, ticker: '[Agent H: Synthesizing Vocal Frequency Spectrum…]', expression: persona.expression });
        emit({ stage: 'cloning', pct: 40, ticker: '[ElevenLabs: Injecting Emotional Voice Clones…]' });

        const res = await fetch(`${origin}/api/elevenlabs/tts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, locale }),
        });
        if (!res.ok) { emit({ stage: 'failed', error: `tts_${res.status}` }); return; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) { emit({ stage: 'failed', error: 'empty_audio' }); return; }

        emit({ stage: 'uploading', pct: 80, ticker: '[Mastering + publishing track…]' });
        const url = await uploadAndSign('renders', `voice/${Date.now()}.mp3`, buf.toString('base64'), 'audio/mpeg');
        if (!url) { emit({ stage: 'failed', error: 'upload_failed' }); return; }

        emit({ stage: 'completed', pct: 100, url, expression: persona.expression });
        succeeded = true;
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 160) : 'voice pipeline failed' });
      } finally {
        if (user && !succeeded) await refundProduce(user.id, PRODUCE_COST.voice, ref, reservation.charged);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
