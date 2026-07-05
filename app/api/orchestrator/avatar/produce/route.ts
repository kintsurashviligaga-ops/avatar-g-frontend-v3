/**
 * POST /api/orchestrator/avatar/produce — managed avatar pipeline (SSE).
 *
 * script (+ optional photo, lighting hint, system prompt, memory)
 *   → Agent V  : persona/emotion directive
 *   → Agent M  : lighting/environment match
 *   → Agent H  : voice/lipsync (HeyGen native or ElevenLabs clone)
 *   → HeyGen   : talking-photo HD render (the working video-gen API)
 *   → signed HD video URL.
 *
 * Streams telemetry: initializing_session → agent_syncing →
 * generating_speech_matrix → rendering_live_avatar → completed | failed.
 *
 * Authenticated. Graceful on HeyGen concurrency/429 → elegant queue-retry copy.
 *
 * NOTE: true bidirectional WebRTC streaming is a client-side LiveKit session
 * against a HeyGen streaming token; this route grounds the session config and
 * delivers the produced HD asset (the server-completable half).
 */
import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse, PRODUCE_COST } from '@/lib/orchestrator/rate-limit';
import { reserveProduce, refundProduce, idemRef, type Reservation } from '@/lib/orchestrator/produceBilling';
import { consumeFreeAvatarChat, restoreFreeAvatarChat } from '@/lib/billing/wallet-ledger';
import { createJob, recordJobEvent } from '@/lib/orchestrator/jobs';
import { buildSessionConfig } from '@/lib/orchestrator/avatar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

interface Body {
  script?: string;
  photoBase64?: string;
  photoMimeType?: string;
  lightingHint?: string;
  systemPrompt?: string;
  memory?: string[];
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  // Auth required in production; bypassed ONLY under `next dev` for local QA.
  if (!user && process.env.NODE_ENV !== 'development') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (user) { const rate = await checkProduceRate(user.id); if (!rate.ok) return rateLimitedResponse(rate); }

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 }); }
  const script = String(body.script ?? '').trim();
  if (!script) return new Response(JSON.stringify({ error: 'script is required' }), { status: 400 });

  const origin = new URL(req.url).origin;
  const session = buildSessionConfig({ script, systemPrompt: body.systemPrompt, memory: body.memory, lightingHint: body.lightingHint });

  // Durable job row (#5).
  const pipelineId = `avtr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jobId = user ? pipelineId : null;
  if (user) await createJob({ id: pipelineId, userId: user.id, serviceType: 'avatar', params: { hasPhoto: Boolean(body.photoBase64), lightingHint: body.lightingHint ?? null } });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } recordJobEvent(jobId, o); };
      const ref = idemRef('avatar', pipelineId, body);
      let reservation: Reservation = { proceed: true, charged: false, reason: 'skipped' };
      let useFreeSlot = false;
      let succeeded = false;
      try {
        // Reserve BEFORE render: atomically consume a free avatar-chat slot if the user has one (restored
        // on failure), else debit credits up front and fail-fast if the balance is too low.
        if (user) {
          const free = await consumeFreeAvatarChat(user.id); // >=0 consumed, -1 none, null = RPC absent
          if (free !== null && free >= 0) {
            useFreeSlot = true;
          } else {
            reservation = await reserveProduce(user.id, PRODUCE_COST.avatar, ref);
            if (!reservation.proceed) { emit({ stage: 'failed', error: 'insufficient_credits', reason: reservation.reason, balance: reservation.balance }); return; }
          }
        }
        emit({ stage: 'initializing_session', pct: 8, ticker: '[Initializing HeyGen session…]' });
        emit({ stage: 'agent_syncing', pct: 18, ticker: '[Syncing MyAvatar context with the remote agent…]', persona: session.persona.expression, lighting: session.lighting.key });
        emit({ stage: 'generating_speech_matrix', pct: 30, ticker: `[Agent V + H: ${session.persona.expression} persona, ${session.persona.tone} vocal dynamics…]` });

        // ── Dispatch HeyGen talking-photo render (start) ──
        const startRes = await fetch(`${origin}/api/heygen/avatar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body.photoBase64 ? { script, photoBase64: body.photoBase64, photoMimeType: body.photoMimeType } : { script }),
        });
        if (startRes.status === 429) { emit({ stage: 'failed', error: 'concurrency', ticker: '[Queue: HeyGen at capacity]' }); return; }
        if (!startRes.ok) {
          const detail = (await startRes.text().catch(() => '')).slice(0, 160);
          const concurrency = /concurr|limit|429|capacity/i.test(detail);
          emit({ stage: 'failed', error: concurrency ? 'concurrency' : `start_${startRes.status}` });
          return;
        }
        const startData = await startRes.json() as { videoId?: string; error?: string };
        if (!startData.videoId) { emit({ stage: 'failed', error: startData.error ?? 'no_video_id' }); return; }

        emit({ stage: 'rendering_live_avatar', pct: 45, ticker: '[Rendering high-fidelity lip-sync…]' });

        // ── Poll for completion (HeyGen ~2–5 min) ──
        let url: string | null = null;
        let poster: string | null = null;
        for (let i = 0; i < 55; i++) {
          await new Promise(r => setTimeout(r, 5000));
          emit({ stage: 'rendering_live_avatar', pct: Math.min(92, 45 + i * 1), ticker: `[Rendering high-fidelity lip-sync · ${(i + 1) * 5}s]` });
          const poll = await fetch(`${origin}/api/heygen/avatar?videoId=${encodeURIComponent(startData.videoId)}`).catch(() => null);
          if (!poll || !poll.ok) continue;
          const pd = await poll.json().catch(() => ({})) as { status?: string; url?: string; thumbnail?: string; error?: string };
          if (pd.status === 'completed' && pd.url) { url = pd.url; poster = pd.thumbnail ?? null; break; }
          if (pd.status === 'failed') { emit({ stage: 'failed', error: pd.error ?? 'render_failed' }); return; }
        }
        if (!url) { emit({ stage: 'failed', error: 'timeout' }); return; }

        // Free slot / credits were already reserved up front — nothing to charge on success.
        emit({ stage: 'completed', pct: 100, url, poster, persona: session.persona, lighting: session.lighting });
        succeeded = true;
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 160) : 'avatar pipeline failed' });
      } finally {
        // Compensate any non-success: restore the consumed free slot, else refund the debited credits.
        if (user && !succeeded) {
          if (useFreeSlot) await restoreFreeAvatarChat(user.id).catch(() => undefined);
          else await refundProduce(user.id, PRODUCE_COST.avatar, ref, reservation.charged);
        }
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
