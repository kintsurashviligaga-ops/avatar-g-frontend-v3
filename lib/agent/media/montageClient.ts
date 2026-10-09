/**
 * lib/agent/media/montageClient.ts — the studio's calls for Agent G's montage (slice 1): upload the attachments, ask for
 * the plan, run it on the user's Start, follow its progress, stop it. Browser-side, every effect injected (fetch, the
 * upload, the clock), so the whole conversation with /api/agent/media/montage is tested without a network.
 *
 * `run` only queues the edit and answers at once; a worker renders it (lib/agent/media/montageWorker). The chat then
 * reads the job (GET /api/agent/media/montage?jobId=…) every few seconds for its stage and percent until it is delivered
 * or failed. That read is also what wakes a worker when none has the job, so a closed connection, a locked phone or a
 * worker that died costs nothing: the edit goes on server-side and lands in the Library either way.
 */
import type { MontageQuote } from './montageExec';
import { codeOf, type ChatErrorCode } from './montageChat';

const ROUTE = '/api/agent/media/montage';
/** How often the job is read while it is queued or rendering. */
export const POLL_MS = 3_000;
/** How many times `run` is sent when its answer does not come back (it is idempotent per quote). */
export const SEND_TRIES = 3;
/**
 * How long the chat follows a job: a wait for a worker, a first attempt that dies at the route's 600 s budget, the lease
 * lapsing (90 s), and the one retry at full length.
 */
export const FOLLOW_MS = 25 * 60_000;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientFile { dataUrl: string; mimeType: string; name?: string }

export interface QuoteDeps {
  fetch: Fetch;
  /** Puts one attachment in the user's own uploads and returns its storage path (null = it did not land). */
  upload: (dataUrl: string, mimeType: string) => Promise<string | null>;
}

export type ClientQuote =
  | { ok: true; quote: MontageQuote; request: unknown; token: string }
  | { ok: false; code: ChatErrorCode; files?: number[] };

const post = (f: Fetch, body: unknown) =>
  f(ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try { return (await res.json()) as Record<string, unknown>; } catch { return null; }
}

/** Is Agent G's montage open to this user? A closed or unreachable route is simply "no": the chat keeps its old flow. */
export async function montageEnabled(f: Fetch): Promise<boolean> {
  try {
    const res = await f(ROUTE, { credentials: 'include', cache: 'no-store' });
    return res.ok && (await readJson(res))?.enabled === true;
  } catch {
    return false;
  }
}

/** Upload every attachment (in order, three at a time) and ask for the plan. Spends nothing. */
export async function quoteAgentMontage(deps: QuoteDeps, input: { prompt: string; files: ClientFile[] }): Promise<ClientQuote> {
  const paths: Array<string | null> = new Array(input.files.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < input.files.length) {
      const i = next++;
      const file = input.files[i]!;
      paths[i] = await deps.upload(file.dataUrl, file.mimeType).catch(() => null);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const missing = paths.flatMap((p, i) => (p ? [] : [i]));
  if (missing.length) return { ok: false, code: 'upload_failed', files: missing };

  try {
    const res = await post(deps.fetch, { action: 'quote', files: paths, prompt: input.prompt });
    const body = await readJson(res);
    if (res.ok && body?.ok === true) {
      return { ok: true, quote: body.quote as MontageQuote, request: body.request, token: String(body.token) };
    }
    const files = Array.isArray(body?.files) ? (body!.files as number[]) : undefined;
    return { ok: false, code: codeOf(res.status, body), ...(files ? { files } : {}) };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export interface RunDeps {
  fetch: Fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onProgress: (pct: number | null, stage: string | null) => void;
}

export type ClientRun =
  | { ok: true; videoUrl: string; durationSec: number; aspect: string }
  | { ok: false; code: ChatErrorCode };

/** The job as the route reports it (lib/agent/media/montageExec JobView). */
type View = Record<string, unknown> & { ok?: unknown; jobId?: unknown; status?: unknown };

const done = (v: View): ClientRun | null => {
  if (v.status === 'completed' && typeof v.videoUrl === 'string' && v.videoUrl) {
    return { ok: true, videoUrl: v.videoUrl, durationSec: Number(v.durationSec) || 0, aspect: String(v.aspect ?? '') };
  }
  // A failed job carries its reason as a code (cancelled, render_failed, qc_failed, a charge that never finished, …).
  if (v.status === 'failed') return { ok: false, code: codeOf(500, { error: v.error }) };
  return null;
};

/**
 * Queue the plan the user confirmed, then follow the job to its end, reporting its progress. Re-sending `run` for the
 * same quote never starts a second edit (the server replays the job), so an answer lost on the way is simply asked
 * for again.
 */
export async function runAgentMontage(
  deps: RunDeps,
  input: { request: unknown; token: string; prompt?: string; jobId: string },
): Promise<ClientRun> {
  let jobId = input.jobId;
  let queued = false;
  const report = (v: View) => deps.onProgress(typeof v.pct === 'number' ? v.pct : null, typeof v.stage === 'string' ? v.stage : null);

  // ── queue it ───────────────────────────────────────────────────────────────────────────────────────────────────────
  for (let tries = 0; tries < SEND_TRIES && !queued; tries++) {
    if (tries) await deps.sleep(POLL_MS);
    try {
      const res = await post(deps.fetch, { action: 'run', request: input.request, token: input.token, prompt: input.prompt });
      const body = (await readJson(res)) as View | null;
      if (res.ok && body?.ok === true) {
        if (typeof body.jobId === 'string') jobId = body.jobId;
        const end = done(body);
        if (end) return end;
        queued = true;
        report(body);
      } else if (body?.error === 'already_failed') {
        queued = true; // an earlier send of this run got through and the edit ended: its row says how
      } else if (body && res.status < 500) {
        return { ok: false, code: codeOf(res.status, body) };
      }
      // No body, or a gateway error: whether it was queued is unknown. Send it again.
    } catch {
      // The connection dropped. Send it again.
    }
  }

  // ── follow it ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const until = deps.now() + FOLLOW_MS;
  let unknown = 0;
  while (deps.now() < until) {
    await deps.sleep(POLL_MS);
    let res: Response;
    let body: View | null;
    try {
      res = await deps.fetch(`${ROUTE}?jobId=${encodeURIComponent(jobId)}`, { credentials: 'include', cache: 'no-store' });
      body = (await readJson(res)) as View | null;
    } catch {
      continue; // offline for a moment: the job goes on
    }
    if (res.ok && body?.ok === true) {
      queued = true;
      const end = done(body);
      if (end) return end;
      report(body);
      continue;
    }
    if (res.status === 404 && body?.error === 'not_found' && typeof body.message === 'string') {
      // No such job: the run never got through (or this is not the user's). Give it a few reads, then say so.
      if (queued || ++unknown >= 3) return { ok: false, code: queued ? 'not_found' : 'network' };
      continue;
    }
    if (res.status === 401 || res.status === 404) return { ok: false, code: codeOf(res.status, body) };
    // 429 or a 5xx: read again on the next tick.
  }
  return { ok: false, code: 'network' };
}

/** Stop a running edit. The run's own answer then reports it as cancelled. */
export async function cancelAgentMontage(f: Fetch, jobId: string): Promise<boolean> {
  try {
    const res = await post(f, { action: 'cancel', jobId });
    return res.ok;
  } catch {
    return false;
  }
}
