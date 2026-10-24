/**
 * lib/perf/serverTiming.ts — where a request's server time went, for the Phase 3 measurements (MASTER TASK v3.1 §4.1).
 *
 * OPT-IN PER REQUEST. Only a request that carries a well-formed `x-myavatar-trace` id gets its spans back: as a
 * `Server-Timing` header, and for the streamed chat also as one SSE comment line just before `[DONE]` (the header has
 * left by the time the stream's own waits are known). The id is echoed in `x-myavatar-trace`, so the browser side of a
 * trace (the perf harness under perf/) is tied to its server side. Every other request is answered exactly as before:
 * `time()` hands back the very promise it was given and no header or line is written.
 *
 * NAMES AND NUMBERS ONLY. A span is one of SPAN_NAMES and a duration in milliseconds — never a prompt, an audio byte,
 * a URL (signed or not), a user id, an error message or any other free text, so nothing private can ride along. The
 * header carries no `desc`.
 */

/** The request header that opts in, and the response header that echoes it. */
export const TRACE_HEADER = 'x-myavatar-trace';

/** 16–32 lowercase hex characters: what perf/ and the browser mint, and nothing that could carry text. */
const TRACE_ID = /^[0-9a-f]{16,32}$/;

/**
 * Every span a route may report. Library: auth → db → proof (legacy manual saves) → sign, with fav (the page's stars)
 * alongside proof and sign. Chat, before the stream:
 * rate (the limiters, summed), auth, body, admin (the avatar-door check the prompt waits for), prompt. Chat, in the
 * stream: budget, profile, embed, memory (embed + match_memories), model (the call's start to its first text),
 * ttft (the request's start to the first text written). `respond` is the time until the response was handed back,
 * `total` the whole request.
 */
export const SPAN_NAMES = [
  'rate',
  'auth',
  'body',
  'admin',
  'prompt',
  'db',
  'proof',
  'sign',
  'fav',
  'budget',
  'profile',
  'embed',
  'memory',
  'model',
  'ttft',
  'respond',
  'total',
] as const;

export type SpanName = (typeof SPAN_NAMES)[number];

const SPAN_SET: ReadonlySet<string> = new Set(SPAN_NAMES);

export function isSpanName(v: unknown): v is SpanName {
  return typeof v === 'string' && SPAN_SET.has(v);
}

/** The trace id a request opted in with, or null (absent, or not a bare hex id). */
export function traceIdFrom(headers: Pick<Headers, 'get'>): string | null {
  const raw = headers.get(TRACE_HEADER);
  return raw && TRACE_ID.test(raw) ? raw : null;
}

/** Any span above this (10 min) is a clock problem, not a measurement. */
const MAX_MS = 600_000;

const roundMs = (ms: number): number => Math.round(Math.min(MAX_MS, Math.max(0, ms)) * 10) / 10;

export interface ServerTiming {
  /** The request's trace id, or null when it did not opt in (then nothing below records or writes anything). */
  readonly traceId: string | null;
  /**
   * Times `work` as `name`, from this call until it settles (a rejection is timed too and still rejects). Pass a
   * promise at the moment it is started. A name timed twice adds up (the chat's three limiters are one `rate`).
   */
  time<T>(name: SpanName, work: Promise<T>): Promise<T>;
  /** Records `name` as the time from the request's start until now (first call wins: a first token is first once). */
  since(name: SpanName): void;
  /** Records `name` as `ms` (added to an earlier value of the same name). */
  add(name: SpanName, ms: number): void;
  /** The `Server-Timing` value: every span so far, then `end` (default `total`) as the time until now. */
  header(end?: SpanName): string | null;
  /** The response headers to add: `{}` without a trace, else `Server-Timing` and the echoed trace id. */
  headers(end?: SpanName): Record<string, string>;
  /** `: server-timing <header>\n\n` for an SSE body (every SSE parser drops `:` lines), or null without a trace. */
  sseComment(end?: SpanName): string | null;
}

/** Starts the clock for one request. `now` is injectable for tests. */
export function serverTiming(req: { headers: Pick<Headers, 'get'> }, now: () => number = () => performance.now()): ServerTiming {
  const traceId = traceIdFrom(req.headers);
  const t0 = now();
  const spans = new Map<SpanName, number>();

  const add = (name: SpanName, ms: number): void => {
    if (!traceId || !Number.isFinite(ms)) return;
    spans.set(name, (spans.get(name) ?? 0) + ms);
  };

  const header = (end: SpanName = 'total'): string | null => {
    if (!traceId) return null;
    const parts = [...spans.entries()].filter(([name]) => name !== end).map(([name, ms]) => `${name};dur=${roundMs(ms)}`);
    parts.push(`${end};dur=${roundMs(now() - t0)}`);
    return parts.join(', ');
  };

  return {
    traceId,
    time<T>(name: SpanName, work: Promise<T>): Promise<T> {
      if (!traceId) return work;
      const started = now();
      return work.then(
        (value) => {
          add(name, now() - started);
          return value;
        },
        (err: unknown) => {
          add(name, now() - started);
          throw err;
        },
      );
    },
    since(name: SpanName): void {
      if (!traceId || spans.has(name)) return;
      spans.set(name, now() - t0);
    },
    add,
    header,
    headers(end?: SpanName): Record<string, string> {
      const value = header(end);
      return value && traceId ? { 'Server-Timing': value, [TRACE_HEADER]: traceId } : {};
    },
    sseComment(end?: SpanName): string | null {
      const value = header(end);
      return value ? `: server-timing ${value}\n\n` : null;
    },
  };
}

/**
 * Reads a `Server-Timing` value (a header, or an SSE comment line's tail) back into `{ name: ms }`, keeping only
 * SPAN_NAMES. Used by perf/ and its tests; tolerant of the spaces and extra params other servers write.
 */
export function parseServerTiming(value: string | null | undefined): Partial<Record<SpanName, number>> {
  const out: Partial<Record<SpanName, number>> = {};
  if (!value) return out;
  const body = value.replace(/^\s*:\s*server-timing\s+/i, '');
  for (const entry of body.split(',')) {
    const [rawName, ...params] = entry.split(';').map((s) => s.trim());
    if (!isSpanName(rawName)) continue;
    const dur = params.find((p) => p.toLowerCase().startsWith('dur='));
    const ms = dur ? Number(dur.slice(4)) : NaN;
    if (Number.isFinite(ms)) out[rawName] = ms;
  }
  return out;
}
