/**
 * lib/video/director/testing/fakeVeoEngine.ts — a scripted VeoEnginePort for the director and provider tests.
 *
 * No network and no spend: createClip records exactly what reached the engine boundary and answers from a script;
 * polls and delivery are scripted per submitted operation; sleep resolves at once. The returned request is the REAL
 * normalizeClipRequest result (pure), so the provider's post-submit check sees what the live engine would report.
 *
 * `wire` defaults to a transport that sends prompt / negative prompt / seed exactly as given — the property under
 * test at the engine boundary (V3). Pass `wire: 'live'` to use lib/veo/payload's real builders instead.
 */
import { normalizeClipRequest, resolveModel } from '@/lib/veo/capabilities';
import type { CreateVeoClipInput, CreateVeoClipResult } from '@/lib/veo/engine';
import type { VeoClipRequest, VeoCreateOutcome, VeoPollOutcome, VeoTransport, VeoVideo } from '@/lib/veo/types';
import { veoWireFields, type VeoDeliveryContext, type VeoEnginePort, type VeoWireFields } from '../googleVeoProvider';

/** How one createClip call (0-based, across the whole test) plays out. Every field defaults to success. */
export interface FakeClipScript {
  submit?: VeoCreateOutcome;
  /** Poll answers in order; the last one repeats. Default: one `succeeded` with a video. */
  polls?: Array<VeoPollOutcome | Error>;
  /** The delivered URL, or null for a delivery miss. Default: a fake storage URL. */
  deliver?: string | null;
}

export interface FakeVeoEngineOptions {
  transport?: VeoTransport | null;
  script?: (callIndex: number, input: CreateVeoClipInput) => FakeClipScript | undefined;
  wire?: 'passthrough' | 'live';
  /** Runs inside createClip (after recording) — e.g. to cancel mid-shot. */
  onCreate?: (input: CreateVeoClipInput, callIndex: number) => void;
  /** Runs inside deliver — e.g. to cancel after a shot rendered. */
  onDeliver?: (ctx: VeoDeliveryContext) => void;
  /** Throw from createClip instead of answering. */
  createThrows?: (callIndex: number) => Error | undefined;
}

export interface FakeVeoEngine extends VeoEnginePort {
  /** Every CreateVeoClipInput that reached the engine, in call order. */
  readonly calls: CreateVeoClipInput[];
  readonly userIds: Array<string | null | undefined>;
  readonly polled: string[];
  readonly delivered: VeoDeliveryContext[];
  readonly sleeps: number[];
}

const VIDEO: VeoVideo = { kind: 'bytes', base64: 'AAAAGGZ0eXBtcDQy', mimeType: 'video/mp4' };

export function passthroughWire(request: VeoClipRequest): VeoWireFields {
  return {
    prompt: request.prompt,
    ...(request.negativePrompt !== undefined ? { negativePrompt: request.negativePrompt } : {}),
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
    referenceImageCount: request.referenceImages?.length ?? 0,
    enhancePrompt: request.enhancePrompt === true,
  };
}

export function createFakeVeoEngine(opts: FakeVeoEngineOptions = {}): FakeVeoEngine {
  const transport: VeoTransport | null = opts.transport === undefined ? 'gemini' : opts.transport;
  const calls: CreateVeoClipInput[] = [];
  const userIds: Array<string | null | undefined> = [];
  const polled: string[] = [];
  const delivered: VeoDeliveryContext[] = [];
  const sleeps: number[] = [];
  const pollQueues = new Map<string, Array<VeoPollOutcome | Error>>();
  const deliverBy = new Map<string, string | null>();

  return {
    calls,
    userIds,
    polled,
    delivered,
    sleeps,
    transport: () => transport,
    async createClip(input, ctx) {
      const index = calls.length;
      calls.push(input);
      userIds.push(ctx.userId);
      opts.onCreate?.(input, index);
      const thrown = opts.createThrows?.(index);
      if (thrown) throw thrown;
      const t = transport ?? 'gemini';
      const model = resolveModel(t, input.tier ?? 'standard');
      const { request, adjustments } = normalizeClipRequest(input.request, model, t);
      const script = opts.script?.(index, input) ?? {};
      const name = t === 'vertex' ? `projects/p/locations/us-central1/publishers/google/models/${model}/operations/op-${index}` : `models/${model}/operations/op-${index}`;
      const outcome: VeoCreateOutcome = script.submit ?? { ok: true, operation: { transport: t, name, model } };
      pollQueues.set(name, [...(script.polls ?? [{ state: 'succeeded', videos: [VIDEO] }])]);
      deliverBy.set(name, script.deliver === undefined ? `https://storage.example.com/renders/clip-${index}.mp4` : script.deliver);
      const result: CreateVeoClipResult = { outcome, request, adjustments, model, transport: t };
      return result;
    },
    async pollClip(operationName) {
      polled.push(operationName);
      const queue = pollQueues.get(operationName) ?? [{ state: 'failed', reason: 'unknown operation' }];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return next ?? { state: 'processing' };
    },
    async deliver(_video, ctx) {
      delivered.push(ctx);
      opts.onDeliver?.(ctx);
      return deliverBy.get(ctx.operationName) ?? null;
    },
    wire: (request, t) => (opts.wire === 'live' ? veoWireFields(request, t) : passthroughWire(request)),
    async sleep(ms) {
      sleeps.push(ms);
    },
  };
}
