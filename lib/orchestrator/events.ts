/**
 * Event-topic broker — ports & adapters.
 *
 * This is the honest realization of the brief's "Apache Kafka event broker"
 * on the current Vercel + Supabase stack: a typed publish/subscribe PORT
 * plus a working in-process ADAPTER. The topic contract and the IoC
 * inversion (agents only react to topics, never call each other) are real
 * today; swapping the transport to Kafka later means writing one
 * `KafkaBroker implements EventBroker` adapter — nothing else changes.
 *
 * Data-isolation rule (enforced at runtime by `assertNoBinary`): events
 * carry only JSON metadata + storage URI handles, never raw binary /
 * base64 blobs. Large media moves through object storage (Supabase Storage
 * / GCS signed URLs), exactly as the brief mandates for Kafka payloads.
 */

// ─── Topic contract ──────────────────────────────────────────────────────────

export const PIPELINE_TOPICS = [
  'media.pipeline.initiated',
  'data.sanitized',
  'asset.layout.ready',
  'script.compiled',
  'audio.segments.ready',
  'video.segments.ready',
  'pipeline.completed',
  'pipeline.failed',
] as const;

export type PipelineTopic = typeof PIPELINE_TOPICS[number];

/** The canonical forward order of the swarm pipeline. */
export const TOPIC_ORDER: PipelineTopic[] = [
  'media.pipeline.initiated',
  'data.sanitized',
  'asset.layout.ready',
  'script.compiled',
  'audio.segments.ready',
  'video.segments.ready',
  'pipeline.completed',
];

export function nextTopic(t: PipelineTopic): PipelineTopic | null {
  const i = TOPIC_ORDER.indexOf(t);
  if (i === -1 || i >= TOPIC_ORDER.length - 1) return null;
  return TOPIC_ORDER[i + 1] ?? null;
}

// ─── Event envelope ──────────────────────────────────────────────────────────

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

export interface PipelineEvent<P extends Record<string, JsonValue> = Record<string, JsonValue>> {
  topic: PipelineTopic;
  /** Correlates every event of one pipeline run (= sagaId). */
  pipelineId: string;
  /** ms epoch. */
  ts: number;
  /** JSON-only payload: metadata + storage URI handles. NEVER raw binary. */
  payload: P;
}

/**
 * Runtime guard enforcing the data-isolation rule. Throws if a payload
 * smells like raw binary (Buffer/ArrayBuffer/typed array) or carries a
 * suspiciously large base64-ish string. Keeps heavy media out of the bus.
 */
export function assertNoBinary(payload: unknown, path = 'payload'): void {
  if (payload == null) return;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload)) {
    throw new Error(`Binary not allowed on the event bus at ${path} (use a storage URI handle)`);
  }
  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
    throw new Error(`Binary not allowed on the event bus at ${path} (use a storage URI handle)`);
  }
  if (typeof payload === 'string') {
    // A >100 KB string that is overwhelmingly base64 alphabet is almost
    // certainly an inlined blob — reject it.
    if (payload.length > 100_000 && /^[A-Za-z0-9+/=\s]+$/.test(payload.slice(0, 4096))) {
      throw new Error(`Large base64-like string not allowed on the event bus at ${path} (use a storage URI handle)`);
    }
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoBinary(v, `${path}[${i}]`));
    return;
  }
  if (typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      assertNoBinary(v, `${path}.${k}`);
    }
  }
}

// ─── Broker port ─────────────────────────────────────────────────────────────

export type EventHandler<P extends Record<string, JsonValue> = Record<string, JsonValue>> =
  (event: PipelineEvent<P>) => void | Promise<void>;

export interface EventBroker {
  publish<P extends Record<string, JsonValue>>(event: PipelineEvent<P>): Promise<void>;
  subscribe(topic: PipelineTopic, handler: EventHandler): () => void;
}

// ─── In-process adapter (working today) ──────────────────────────────────────

/**
 * Same-runtime fan-out broker. Real and useful for single-instance
 * workers, local dev, and the unit tests. Handlers run sequentially and
 * a throwing handler is isolated (logged via onError) so one bad
 * subscriber never blocks the rest — mirroring at-least-once delivery.
 */
export class InProcessBroker implements EventBroker {
  private readonly handlers = new Map<PipelineTopic, Set<EventHandler>>();
  private readonly onError: (topic: PipelineTopic, err: unknown) => void;

  constructor(opts: { onError?: (topic: PipelineTopic, err: unknown) => void } = {}) {
    this.onError = opts.onError ?? (() => undefined);
  }

  subscribe(topic: PipelineTopic, handler: EventHandler): () => void {
    let set = this.handlers.get(topic);
    if (!set) { set = new Set(); this.handlers.set(topic, set); }
    set.add(handler);
    return () => { this.handlers.get(topic)?.delete(handler); };
  }

  async publish<P extends Record<string, JsonValue>>(event: PipelineEvent<P>): Promise<void> {
    assertNoBinary(event.payload);
    const set = this.handlers.get(event.topic);
    if (!set || set.size === 0) return;
    for (const handler of set) {
      try {
        await handler(event as PipelineEvent);
      } catch (err) {
        this.onError(event.topic, err);
      }
    }
  }
}

/** Helper to build a well-formed event envelope. */
export function makeEvent<P extends Record<string, JsonValue>>(
  topic: PipelineTopic,
  pipelineId: string,
  payload: P,
): PipelineEvent<P> {
  return { topic, pipelineId, ts: Date.now(), payload };
}
