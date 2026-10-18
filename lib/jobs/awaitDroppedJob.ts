/**
 * A render whose ONE long request the phone dropped is still running on the server.
 *
 * iOS Safari kills an in-flight fetch when the screen locks or the app goes to the background ("Load failed", a
 * TypeError). Music waits on one request for the whole render (up to ~5 min), so on a phone it failed while the server
 * went on, charged, and filed the track in the Library — the chat showed an error and the tray kept a card nobody
 * could close (Production 2026-10-16, GG's iPhone vs desktop). The runner now treats a dropped connection as "still
 * running" and reads the job's own row (GET /api/tasks?id=…) until it settles. Pure but for the injected fetch/sleep.
 */

/** A dropped connection, not an HTTP answer and not the user's own stop. */
export function isDroppedConnection(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'AbortError') return false;
  return err instanceof TypeError;
}

export type DroppedJobOutcome = { url: string } | { failed: true; error: string | null } | null;

interface Opts {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  /** Total wait; the music route's own ceiling is 300 s. */
  maxMs?: number;
  everyMs?: number;
}

/** Poll the job's task until it completes (its url) or fails; null when the wait runs out or the user stopped. */
export async function awaitDroppedJob(jobId: string, opts: Opts = {}): Promise<DroppedJobOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const every = opts.everyMs ?? 6000;
  const rounds = Math.max(1, Math.ceil((opts.maxMs ?? 300_000) / every));
  for (let i = 0; i < rounds; i++) {
    if (opts.signal?.aborted) return null;
    await sleep(every);
    if (opts.signal?.aborted) return null;
    try {
      const r = await fetchImpl(`/api/tasks?id=${encodeURIComponent(jobId)}`, { credentials: 'include', cache: 'no-store', ...(opts.signal ? { signal: opts.signal } : {}) });
      if (!r.ok) continue; // not written yet, or a passing error: keep waiting
      const j = (await r.json().catch(() => null)) as { task?: { status?: string; result?: { url?: unknown } | null; error?: string | null } } | null;
      const t = j?.task;
      if (!t) continue;
      if ((t.status === 'completed' || t.status === 'partially_completed') && typeof t.result?.url === 'string' && t.result.url) return { url: t.result.url };
      if (t.status === 'failed' || t.status === 'cancelled') return { failed: true, error: t.error ?? null };
    } catch {
      /* still offline: try again next round */
    }
  }
  return null;
}
