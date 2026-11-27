/**
 * lib/ai/google/breaker.ts — a circuit breaker in front of every Vertex model RPC (Phase 8.21, "Chaos Monkey" scenario A).
 *
 * WHY. When Vertex answers 503 for ten minutes, every chat turn, picture and song still sends its request and waits for
 * Google's error (often many seconds each), and any server-side retry multiplies that. The UI already stops on its own
 * deadlines (chat: first-token and idle timeouts; clips: GENJUTSU_HARD_CAP_MS), but each user still waits the full
 * timeout before being told. With the breaker, after VERTEX_BREAKER_FAILS failures (5xx or network) inside a minute for
 * one model, calls to that model are answered AT ONCE with a Google-shaped 503 for VERTEX_BREAKER_OPEN_MS; callers already
 * word a Vertex 503 as "temporarily unavailable". Then one probe call is let through: success closes it, failure re-opens.
 *
 * Off unless VERTEX_BREAKER=1. Per instance (serverless: each warm instance learns on its own after a few calls), which is
 * enough to stop the hammering; nothing is stored. 4xx and 429 never trip it: those are about the request or the quota,
 * not an outage, and a 429 has its own handling.
 */

type Env = Record<string, string | undefined>;

export function vertexBreakerOn(env: Env = process.env): boolean {
  return (env.VERTEX_BREAKER ?? '').trim() === '1';
}

function num(raw: string | undefined, fallback: number, min: number): number {
  const v = Number((raw ?? '').trim());
  return (raw ?? '').trim() !== '' && Number.isFinite(v) && v >= min ? v : fallback;
}

interface State {
  fails: number[];
  openUntil: number;
  probing: boolean;
}

const states = new Map<string, State>();
let clock: () => number = () => Date.now();

/** Test seam. */
export function resetVertexBreakerForTests(now?: () => number): void {
  states.clear();
  clock = now ?? (() => Date.now());
}

const WINDOW_MS = 60_000;

function state(key: string): State {
  let s = states.get(key);
  if (!s) { s = { fails: [], openUntil: 0, probing: false }; states.set(key, s); }
  return s;
}

/** May a call to `key` go out now? `probe` is true when it is the one half-open probe. */
export function breakerPermit(key: string): { ok: true; probe: boolean } | { ok: false; retryAfterMs: number } {
  const s = state(key);
  const now = clock();
  if (s.openUntil === 0) return { ok: true, probe: false };
  if (now < s.openUntil) return { ok: false, retryAfterMs: s.openUntil - now };
  if (s.probing) return { ok: false, retryAfterMs: 5_000 };
  s.probing = true;
  return { ok: true, probe: true };
}

/** Is this outcome an outage signal? 5xx or a thrown network error; never 4xx/429. */
export function isOutage(status: number | null): boolean {
  return status === null || (status >= 500 && status <= 599);
}

export function breakerRecord(key: string, status: number | null, env: Env = process.env): void {
  const s = state(key);
  const now = clock();
  if (!isOutage(status)) {
    s.fails = [];
    s.openUntil = 0;
    s.probing = false;
    return;
  }
  const threshold = num(env.VERTEX_BREAKER_FAILS, 5, 1);
  const openMs = num(env.VERTEX_BREAKER_OPEN_MS, 60_000, 1_000);
  if (s.probing) {
    s.probing = false;
    s.openUntil = now + openMs;
    return;
  }
  s.fails = [...s.fails.filter((t) => now - t < WINDOW_MS), now];
  if (s.fails.length >= threshold) {
    s.openUntil = now + openMs;
    s.fails = [];
    // eslint-disable-next-line no-console
    console.error(`[vertex-breaker] OPEN for ${key}: ${threshold} outage answers within a minute; failing fast for ${Math.round(openMs / 1000)} s`);
  }
}

/** The probe was cancelled by its own caller: no verdict, the next call may probe. */
export function breakerAbandonProbe(key: string): void {
  state(key).probing = false;
}

/** The answer a caller gets while the breaker is open: what Vertex itself says during an outage. */
export function breakerResponse(key: string, retryAfterMs: number): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 503,
        status: 'UNAVAILABLE',
        message: `vertex_breaker_open: ${key} answered with outages; not called again for ${Math.ceil(retryAfterMs / 1000)} s`,
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
  );
}
