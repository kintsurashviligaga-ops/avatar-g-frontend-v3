/**
 * SSE hub — same-instance fan-out between the assemble callback (publisher)
 * and connected SwarmStatusPanel clients (subscribers).
 *
 * The `/api/pipeline/stream` route uses this hub: GET subscribes a client
 * connection, POST (the PIPELINE_EVENT_BRIDGE_URL target hit by the RunPod
 * callback) publishes an event that is fanned out to every subscriber of
 * that pipelineId.
 *
 * Scope: this is an in-memory hub, so it fans out within a single
 * serverless instance. For true multi-instance delivery, swap this module
 * for a Redis pub/sub adapter behind the same publish/subscribe shape —
 * the route and client never change.
 */

import type { PipelineTopic } from './events';

export interface BridgeEvent {
  topic: PipelineTopic;
  pipelineId: string;
  payload: Record<string, string | number | boolean | null>;
}

type Subscriber = (event: BridgeEvent) => void;

// Survive Next.js dev hot-reloads by parking the registry on globalThis.
const g = globalThis as unknown as { __myavatarSseHub?: Map<string, Set<Subscriber>> };
const registry: Map<string, Set<Subscriber>> = g.__myavatarSseHub ?? new Map();
g.__myavatarSseHub = registry;

/** Subscribe a client to one pipeline's events. Returns an unsubscribe fn. */
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

/** Publish an event to every subscriber of its pipeline. */
export function publish(event: BridgeEvent): number {
  const set = registry.get(event.pipelineId);
  if (!set || set.size === 0) return 0;
  let delivered = 0;
  for (const fn of set) {
    try { fn(event); delivered++; } catch { /* isolate a bad subscriber */ }
  }
  return delivered;
}

export function subscriberCount(pipelineId: string): number {
  return registry.get(pipelineId)?.size ?? 0;
}
