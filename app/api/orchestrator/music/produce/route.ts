/**
 * POST /api/orchestrator/music/produce — Music Generation Swarm (SSE).
 *
 * brief → Agent S (Gemini) designs song metrics (style, BPM, instrumental,
 * lyrics) → dispatch to the music worker (Udio) → signed audio URL.
 * Streams: [Agent S: Architecting Lyric/Vibe Matrix…] →
 *          [Synthesizing Audio Frequency Spectrum…] → completed | failed.
 * Authenticated (dev-bypass under `next dev`). Fail-open: Gemini miss →
 * deterministic metrics.
 */
import { NextRequest } from 'next/server';
import { llmText } from '@/lib/ai/llmText';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse, PRODUCE_COST } from '@/lib/orchestrator/rate-limit';
import { reserveProduce, refundProduce, idemRef, reservationErrorCode, type Reservation } from '@/lib/orchestrator/produceBilling';
import { createJob, recordJobEvent, recordJobReservation } from '@/lib/orchestrator/jobs';
import {
  buildSongArchitectSystemPrompt, normalizeSongMetrics, deterministicSongMetrics, songGenerationPrompt,
} from '@/lib/orchestrator/media-directors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;


function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = fenced?.[1] ?? text; const s = c.search(/[[{]/);
  if (s === -1) return null;
  try { return JSON.parse(c.slice(s)); } catch { /* trailing */ }
  const e = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'));
  if (e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch { /* nope */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user && process.env.NODE_ENV !== 'development') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (user) { const rate = await checkProduceRate(user.id); if (!rate.ok) return rateLimitedResponse(rate); }

  let body: { prompt?: string };
  try { body = (await req.json()) as { prompt?: string }; } catch { return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 }); }
  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 });
  const origin = new URL(req.url).origin;

  // Durable job row (#5).
  const pipelineId = `msc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jobId = user ? pipelineId : null;
  if (user) await createJob({ id: pipelineId, userId: user.id, serviceType: 'music', params: { prompt } });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } recordJobEvent(jobId, o); };
      const ref = idemRef('music', pipelineId, body);
      let reservation: Reservation = { proceed: true, charged: false, reason: 'skipped' };
      let succeeded = false;
      try {
        if (user) {
          reservation = await reserveProduce(user.id, PRODUCE_COST.music, ref, { refuseReplay: true });
          if (!reservation.proceed) { emit({ stage: 'failed', error: reservationErrorCode(reservation), reason: reservation.reason, balance: reservation.balance }); return; }
          // Stamp the reserve onto the durable row so the cron drainer can refund it idempotently if this
          // render is abandoned (tab closed) and the in-route refund below never fires. Only when charged.
          if (jobId && reservation.charged) await recordJobReservation(jobId, { ref, credits: PRODUCE_COST.music });
        }
        emit({ stage: 'architecting', pct: 12, ticker: '[Agent S: Architecting Lyric/Vibe Matrix…]' });

        // Agent S — Gemini metrics (lib/ai/llmText: Gemini only, no second provider), fail-open to deterministic.
        let metrics = deterministicSongMetrics(prompt);
        const architected = await llmText({
          user: `Brief: "${prompt}". Return the JSON now.`,
          system: buildSongArchitectSystemPrompt(),
          maxTokens: 1200, json: true, timeoutMs: 30_000,
        });
        const parsedMetrics = architected ? extractJson(architected) : null;
        if (parsedMetrics) metrics = normalizeSongMetrics(parsedMetrics, prompt);

        emit({ stage: 'synthesizing', pct: 45, ticker: '[Synthesizing Audio Frequency Spectrum…]', style: metrics.style, bpm: metrics.bpm, instrumental: metrics.instrumental });

        const res = await fetch(`${origin}/api/udio/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: songGenerationPrompt(metrics), make_instrumental: metrics.instrumental }),
        });
        if (!res.ok) { emit({ stage: 'failed', error: `worker_${res.status}` }); return; }
        const data = await res.json() as { url?: string; audioUrl?: string; error?: string };
        const url = data.url || data.audioUrl || null;
        if (!url) { emit({ stage: 'failed', error: data.error ?? 'no_audio' }); return; }

        emit({ stage: 'completed', pct: 100, url, title: metrics.title, style: metrics.style, bpm: metrics.bpm });
        succeeded = true;
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 160) : 'music pipeline failed' });
      } finally {
        if (user && !succeeded) await refundProduce(user.id, PRODUCE_COST.music, ref, reservation.charged);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
