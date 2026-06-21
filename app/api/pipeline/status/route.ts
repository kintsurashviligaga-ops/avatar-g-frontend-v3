/**
 * GET /api/pipeline/status?jobId=<id>
 * ===================================
 * Server-Sent Events stream of a pipeline job's live progress, backed by Upstash
 * Redis (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). The client opens
 * an EventSource on this route for a `jobId` and receives progress events as the
 * agents work, plus a keep-alive heartbeat comment every 30s.
 *
 * Two Redis-backed sources are polled and folded into one stream:
 *   1. A generic per-job event list `pipeline:status:<jobId>` (RPUSH'd JSON in the
 *      event shape below) — emitted in order as new entries appear.
 *   2. The existing film status record (`getFilmStatus(jobId)`), derived into an
 *      agent event so real 30-second-film jobs report status without any producer
 *      change.
 *
 * Event shape (one JSON object per `data:` frame):
 *   { jobId, agentId, status: idle|processing|completed|error|queued,
 *     percentage: 0-100, message, etaSeconds, timestamp: ISO }
 *
 * The stream closes on a terminal event (completed|error), on client disconnect,
 * or at a 10-minute safety ceiling. Degrades gracefully when Redis is absent
 * (emits an initial event + heartbeats).
 */
import { NextRequest } from 'next/server';
import { getRedisClient } from '@/lib/platform/redis';
import { getFilmStatus, type FilmStatusRecord } from '@/lib/chat/filmStatusStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JobStatus = 'idle' | 'processing' | 'completed' | 'error' | 'queued';

interface StatusEvent {
  jobId: string;
  agentId: string;
  status: JobStatus;
  percentage: number;
  message: string;
  etaSeconds: number;
  timestamp: string;
}

const HEARTBEAT_MS = 30_000;
const POLL_MS = 1_500;
const MAX_MS = 10 * 60_000;

/** Derive a single agent event from the persisted film status record. */
function filmToEvent(jobId: string, film: FilmStatusRecord, ts: string): StatusEvent {
  const base = { jobId, etaSeconds: 0, timestamp: ts };
  const total = Math.max(1, film.clips.length || 5);
  const ready = film.clips.filter((c) => c.status === 'succeeded').length;

  if (film.error) {
    return { ...base, agentId: 'montage', status: 'error', percentage: 0, message: film.error || 'Film generation failed' };
  }
  if (film.masterUrl) {
    return { ...base, agentId: 'montage', status: 'completed', percentage: 100, message: 'Final master ready' };
  }
  if (film.phase === 'assembling') {
    return { ...base, agentId: 'montage', status: 'processing', percentage: 90, message: 'Stitching the final cut…', etaSeconds: 15 };
  }
  if (film.phase === 'ready') {
    return { ...base, agentId: 'montage', status: 'processing', percentage: 85, message: 'Clips ready — assembling…', etaSeconds: 20 };
  }
  if (film.phase === 'rendering') {
    return {
      ...base,
      agentId: 'video',
      status: 'processing',
      percentage: Math.min(82, 20 + Math.round((ready / total) * 60)),
      message: `Rendering scenes (${ready}/${total})`,
      etaSeconds: Math.max(0, (total - ready) * 30),
    };
  }
  return { ...base, agentId: 'director', status: 'queued', percentage: 5, message: 'Planning the film…', etaSeconds: total * 30 };
}

/** Coerce a raw Redis-list entry into a well-formed StatusEvent. */
function coerceEvent(jobId: string, raw: unknown, ts: string): StatusEvent | null {
  let o: Record<string, unknown> | null = null;
  if (typeof raw === 'string') { try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; } }
  else if (raw && typeof raw === 'object') { o = raw as Record<string, unknown>; }
  if (!o) return null;
  const status = (['idle', 'processing', 'completed', 'error', 'queued'] as const).includes(o.status as JobStatus)
    ? (o.status as JobStatus) : 'processing';
  const pct = Number(o.percentage);
  return {
    jobId,
    agentId: typeof o.agentId === 'string' ? o.agentId : 'pipeline',
    status,
    percentage: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0,
    message: typeof o.message === 'string' ? o.message : '',
    etaSeconds: Number.isFinite(Number(o.etaSeconds)) ? Number(o.etaSeconds) : 0,
    timestamp: typeof o.timestamp === 'string' ? o.timestamp : ts,
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const jobId = req.nextUrl.searchParams.get('jobId')?.trim();
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'jobId is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const encoder = new TextEncoder();
  const redis = getRedisClient();
  const eventsKey = `pipeline:status:${jobId}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const enqueue = (s: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(s)); } catch { closed = true; }
      };
      const send = (ev: StatusEvent) => enqueue(`data: ${JSON.stringify(ev)}\n\n`);
      const heartbeat = () => enqueue(`: heartbeat ${new Date().toISOString()}\n\n`);
      const close = () => { if (closed) return; closed = true; try { controller.close(); } catch { /* already closed */ } };

      req.signal.addEventListener('abort', close);

      const nowIso = () => new Date().toISOString();
      // Initial frame so the client confirms the connection immediately.
      send({ jobId, agentId: 'director', status: 'queued', percentage: 0, message: 'Connected — streaming pipeline status…', etaSeconds: 0, timestamp: nowIso() });

      const startedAt = Date.now();
      let lastListLen = 0;
      let lastFilmSig = '';
      let lastBeat = Date.now();

      while (!closed) {
        // 1 — generic per-job event list (RPUSH'd JSON events).
        if (redis) {
          try {
            const len = await redis.llen(eventsKey);
            if (typeof len === 'number' && len > lastListLen) {
              const fresh = await redis.lrange<unknown>(eventsKey, lastListLen, len - 1);
              lastListLen = len;
              for (const raw of fresh ?? []) {
                const ev = coerceEvent(jobId, raw, nowIso());
                if (!ev) continue;
                send(ev);
                if (ev.status === 'completed' || ev.status === 'error') close();
              }
            }
          } catch { /* transient Redis blip — keep polling */ }
        }
        if (closed) break;

        // 2 — derive from the persisted film status (real 30s-film jobs).
        try {
          const film = await getFilmStatus(jobId);
          if (film) {
            const sig = `${film.phase}:${film.clips.filter((c) => c.status === 'succeeded').length}:${film.masterUrl ? 1 : 0}:${film.error ? 1 : 0}`;
            if (sig !== lastFilmSig) {
              lastFilmSig = sig;
              const ev = filmToEvent(jobId, film, nowIso());
              send(ev);
              if (ev.status === 'completed' || ev.status === 'error') close();
            }
          }
        } catch { /* ignore — status store optional */ }
        if (closed) break;

        // Heartbeat comment every 30s to keep the connection alive.
        if (Date.now() - lastBeat >= HEARTBEAT_MS) { heartbeat(); lastBeat = Date.now(); }

        // Safety ceiling.
        if (Date.now() - startedAt > MAX_MS) {
          send({ jobId, agentId: 'pipeline', status: 'error', percentage: 0, message: 'Status stream timed out', etaSeconds: 0, timestamp: nowIso() });
          close();
          break;
        }

        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
