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
import Anthropic from '@anthropic-ai/sdk';
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

const MODEL = process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

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

        // Agent P — Claude expansion, fail-open to deterministic.
        let directive = deterministicImageDirective(prompt);
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
          try {
            const client = new Anthropic({ apiKey });
            const msg = await client.messages.create({
              model: MODEL, max_tokens: 600,
              system: buildImageDirectorSystemPrompt(),
              messages: [{ role: 'user', content: `Brief: "${prompt}". Return the JSON now.` }],
            });
            const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
            const parsed = extractJson(text);
            if (parsed) directive = normalizeImageDirective(parsed, prompt);
          } catch { /* keep deterministic */ }
        }

        emit({ stage: 'dispatching', pct: 45, ticker: '[Dispatching to Production Multi-Model Worker…]', ratio: directive.ratio, style: directive.style });

        // Dispatch to the image worker (+ short poll if async).
        const res = await fetch(`${origin}/api/replicate/image`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: directive.prompt, quality: 'standard', ratio: directive.ratio }),
        });
        if (!res.ok) { emit({ stage: 'failed', error: `worker_${res.status}` }); return; }
        const data = await res.json() as { url?: string; imageUrl?: string; output?: string[]; predictionId?: string; error?: string };
        let url = data.url || data.imageUrl || data.output?.[0] || null;
        if (!url && data.predictionId) {
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            emit({ stage: 'dispatching', pct: Math.min(90, 50 + i * 2), ticker: `[Rendering · ${(i + 1) * 3}s]` });
            const poll = await fetch(`${origin}/api/replicate/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ predictionId: data.predictionId }) }).catch(() => null);
            if (!poll || !poll.ok) continue;
            const pd = await poll.json().catch(() => ({})) as { url?: string; output?: string[]; status?: string; error?: string };
            const u = pd.url || pd.output?.[0];
            if (u) { url = u; break; }
            if (pd.status === 'failed') { emit({ stage: 'failed', error: pd.error ?? 'render_failed' }); return; }
          }
        }
        if (!url) { emit({ stage: 'failed', error: data.error ?? 'no_image' }); return; }

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
