/**
 * SSE hub — cross-instance telemetry fan-out for the swarm.
 *
 * Two layers, so it's correct under Vercel's horizontal scaling:
 *   1. In-memory registry  → instant same-instance delivery (the fast path).
 *   2. Durable Redis event-log per pipeline → cross-instance + replayable.
 *
 * NOTE on "pub/sub": Upstash is accessed over REST, which cannot hold a
 * persistent SUBSCRIBE socket from a serverless function. The correct serverless
 * pattern (and what this implements) is an append-only event LIST per pipeline:
 * `publish()` RPUSHes the event (any instance), and stream loops POLL via
 * `readPipelineEvents(id, cursor)` (any instance). This guarantees telemetry
 * survival across instances/regions AND enables reload-recovery replay. Fail-OPEN
 * to in-memory when Upstash is unconfigured.
 */

import { Redis } from '@upstash/redis';
import type { PipelineTopic } from './events';

export interface BridgeEvent {
  topic: PipelineTopic;
  pipelineId: string;
  payload: Record<string, string | number | boolean | null>;
}

type Subscriber = (event: BridgeEvent) => void;

const EVENT_TTL_SEC = 1800; // a pipeline's event log lives 30 min
const keyFor = (pipelineId: string) => `sse:ev:${pipelineId}`;

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { return new Redis({ url, token }); } catch { return null; }
}

// Survive Next.js dev hot-reloads by parking the registry on globalThis.
const g = globalThis as unknown as { __myavatarSseHub?: Map<string, Set<Subscriber>> };
const registry: Map<string, Set<Subscriber>> = g.__myavatarSseHub ?? new Map();
g.__myavatarSseHub = registry;

/** Subscribe a client to one pipeline's events (same-instance fast path). */
export function subscribe(pipelineId: string, fn: Subscriber): () => void {
  let set = registry.get(pipelineId);
  if (!set) { set = new Set(); registry.set(pipelineId, set); }
  set.add(fn);
  return () => {
    const s = registry.get(pipelineId);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) registry.delete(pipelineId);
  };
}

/**
 * Publish an event: instant same-instance fan-out + best-effort durable append
 * to the Redis event-log (cross-instance + replay). Returns same-instance count.
 */
export function publish(event: BridgeEvent): number {
  // Durable append (fire-and-forget; never blocks delivery, never throws).
  const r = redis();
  if (r) {
    void (async () => {
      try {
        await r.rpush(keyFor(event.pipelineId), JSON.stringify(event));
        await r.expire(keyFor(event.pipelineId), EVENT_TTL_SEC);
      } catch { /* fail-open */ }
    })();
  }
  const set = registry.get(event.pipelineId);
  if (!set || set.size === 0) return 0;
  let delivered = 0;
  for (const fn of set) {
    try { fn(event); delivered++; } catch { /* isolate a bad subscriber */ }
  }
  return delivered;
}

/**
 * Cross-instance / replay reader: returns events appended beyond `sinceIndex`
 * plus the new cursor. Fail-open to an empty batch when Redis is unconfigured.
 */
export async function readPipelineEvents(
  pipelineId: string,
  sinceIndex = 0,
): Promise<{ events: BridgeEvent[]; nextIndex: number }> {
  const r = redis();
  if (!r) return { events: [], nextIndex: sinceIndex };
  try {
    const raw = await r.lrange(keyFor(pipelineId), sinceIndex, -1);
    const events = (raw as unknown[]).map(parseEvent).filter((e): e is BridgeEvent => e !== null);
    return { events, nextIndex: sinceIndex + (raw?.length ?? 0) };
  } catch {
    return { events: [], nextIndex: sinceIndex };
  }
}

function parseEvent(raw: unknown): BridgeEvent | null {
  if (raw && typeof raw === 'object') return raw as BridgeEvent; // Upstash auto-deserializes JSON
  if (typeof raw === 'string') { try { return JSON.parse(raw) as BridgeEvent; } catch { return null; } }
  return null;
}

export function subscriberCount(pipelineId: string): number {
  return registry.get(pipelineId)?.size ?? 0;
}

/** True when a durable Redis event-log backs the hub (multi-instance mode). */
export function hubUsesRedis(): boolean {
  return redis() !== null;
}
