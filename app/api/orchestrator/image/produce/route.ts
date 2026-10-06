/**
 * POST /api/orchestrator/image/produce — Image Generation Swarm (SSE).
 *
 * brief → Agent P (Claude) expands to a generation matrix (prompt + ratio +
 * style) → dispatch to the production image worker (Replicate) → signed image URL.
 * Streams: [Agent P: Formulating Visual Prompt Matrix…] →
 *          [Dispatching to Production Multi-Model Worker…] → completed | failed.
 * Authenticated (dev-bypass under `next dev`). Fail-open: Claude miss →
 * deterministic directive, so it always dispatches.
 */
import { NextRequest } from 'next/server';
import { llmText } from '@/lib/ai/llmText';
import { generateImagenImages, hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse, PRODUCE_COST } from '@/lib/orchestrator/rate-limit';
import { reserveProduce, refundProduce, idemRef, type Reservation } from '@/lib/orchestrator/produceBilling';
import { createJob, recordJobEvent, recordJobReservation } from '@/lib/orchestrator/jobs';
import {
  buildImageDirectorSystemPrompt, normalizeImageDirective, deterministicImageDirective,
} from '@/lib/orchestrator/media-directors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;


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
  if (!hasGeminiImagenProvider()) return new Response(JSON.stringify({ error: 'provider_unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  // Durable job row (#5).
  const pipelineId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jobId = user ? pipelineId : null;
  if (user) await createJob({ id: pipelineId, userId: user.id, serviceType: 'image', params: { prompt } });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } recordJobEvent(jobId, o); };
      const ref = idemRef('image', pipelineId, body);
      let reservation: Reservation = { proceed: true, charged: false, reason: 'skipped' };
      let succeeded = false;
      try {
        if (user) {
          reservation = await reserveProduce(user.id, PRODUCE_COST.image, ref);
          if (!reservation.proceed) { emit({ stage: 'failed', error: 'insufficient_credits', reason: reservation.reason, balance: reservation.balance }); return; }
          // Stamp the reserve onto the durable row so the cron drainer can refund it idempotently if this
          // render is abandoned (tab closed) and the in-route refund below never fires. Only when charged.
          if (jobId && reservation.charged) await recordJobReservation(jobId, { ref, credits: PRODUCE_COST.image });
        }
        emit({ stage: 'directing', pct: 12, ticker: '[Agent P: Formulating Visual Prompt Matrix…]' });

        // Google text planning is optional; the deterministic directive remains valid if it misses.
        let directive = deterministicImageDirective(prompt);
        const plan = await llmText({ system: buildImageDirectorSystemPrompt(), user: `Brief: "${prompt}". Return the JSON now.`, maxTokens: 600, timeoutMs: 30_000 });
        const parsed = plan ? extractJson(plan) : null;
        if (parsed) directive = normalizeImageDirective(parsed, prompt);

        emit({ stage: 'dispatching', pct: 45, ticker: '[Dispatching to Production Multi-Model Worker…]', ratio: directive.ratio, style: directive.style });

        // Imagen is synchronous. Host its bytes without a second billed HTTP route or legacy polling.
        const images = await generateImagenImages({ prompt: directive.prompt, aspectRatio: directive.ratio, numberOfImages: 1 });
        const image = images?.[0];
        if (!image) { emit({ stage: 'failed', error: 'provider_unavailable' }); return; }
        const ext = image.mimeType.includes('jpeg') ? 'jpg' : 'png';
        const url = await uploadBufferAndSign('renders', `imagen/${pipelineId}.${ext}`, image.buffer, image.mimeType, 604_800);
        if (!url) { emit({ stage: 'failed', error: 'host_failed' }); return; }

        emit({ stage: 'completed', pct: 100, url, ratio: directive.ratio, style: directive.style });
        succeeded = true;
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 160) : 'image pipeline failed' });
      } finally {
        if (user && !succeeded) await refundProduce(user.id, PRODUCE_COST.image, ref, reservation.charged);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
