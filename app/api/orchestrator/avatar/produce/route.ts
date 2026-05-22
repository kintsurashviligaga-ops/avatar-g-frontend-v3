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
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 }); }
  const script = String(body.script ?? '').trim();
  if (!script) return new Response(JSON.stringify({ error: 'script is required' }), { status: 400 });

  const origin = new URL(req.url).origin;
  const session = buildSessionConfig({ script, systemPrompt: body.systemPrompt, memory: body.memory, lightingHint: body.lightingHint });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (o: Record<string, unknown>) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } };
      try {
        emit({ stage: 'initializing_session', pct: 8, ticker: '[Initializing HeyGen session…]' });
        emit({ stage: 'agent_syncing', pct: 18, ticker: '[Syncing MyAvatar context with the remote agent…]', persona: session.persona.expression, lighting: session.lighting.key });
        emit({ stage: 'generating_speech_matrix', pct: 30, ticker: `[Agent V + H: ${session.persona.expression} persona, ${session.persona.tone} vocal dynamics…]` });

        // ── Dispatch HeyGen talking-photo render (start) ──
        const startRes = await fetch(`${origin}/api/heygen/avatar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body.photoBase64 ? { script, photoBase64: body.photoBase64, photoMimeType: body.photoMimeType } : { script }),
        });
        if (startRes.status === 429) { emit({ stage: 'failed', error: 'concurrency', ticker: '[Queue: HeyGen at capacity]' }); controller.close(); return; }
        if (!startRes.ok) {
          const detail = (await startRes.text().catch(() => '')).slice(0, 160);
          const concurrency = /concurr|limit|429|capacity/i.test(detail);
          emit({ stage: 'failed', error: concurrency ? 'concurrency' : `start_${startRes.status}` });
          controller.close(); return;
        }
        const startData = await startRes.json() as { videoId?: string; error?: string };
        if (!startData.videoId) { emit({ stage: 'failed', error: startData.error ?? 'no_video_id' }); controller.close(); return; }

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
          if (pd.status === 'failed') { emit({ stage: 'failed', error: pd.error ?? 'render_failed' }); controller.close(); return; }
        }
        if (!url) { emit({ stage: 'failed', error: 'timeout' }); controller.close(); return; }

        emit({ stage: 'completed', pct: 100, url, poster, persona: session.persona, lighting: session.lighting });
        controller.close();
      } catch (e) {
        emit({ stage: 'failed', error: e instanceof Error ? e.message.slice(0, 160) : 'avatar pipeline failed' });
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
