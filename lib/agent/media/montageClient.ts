/**
 * lib/agent/media/montageClient.ts — the studio's calls for Agent G's montage (slice 1): upload the attachments, ask for
 * the plan, run it on the user's Start, follow its progress, stop it. Browser-side, every effect injected (fetch, the
 * upload, the clock), so the whole conversation with /api/agent/media/montage is tested without a network.
 *
 * Progress and recovery read the generation_jobs row the run writes (GET /api/orchestrator/jobs, the job tray's own
 * endpoint): `run` is synchronous, so while it is open the row's stage and percent are the progress, and when the
 * connection drops before the answer (a phone locks, a proxy times out) the row still says how the edit ended. The job
 * keeps running server-side either way and lands in the Library.
 */
import type { MontageQuote } from './montageExec';
import { codeOf, type ChatErrorCode } from './montageChat';

const ROUTE = '/api/agent/media/montage';
const JOBS = '/api/orchestrator/jobs';
/** How often the progress is read while the run is open. */
export const POLL_MS = 3_000;
/** How long a dropped run is followed on its job row: the route's own 600 s budget plus the QC probe. */
export const RECOVER_MS = 11 * 60_000;

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

interface JobRow { id?: string; status?: string; current_stage?: string | null; pct?: number | null; signed_url?: string | null; result?: Record<string, unknown> | null; error?: string | null }

async function readRow(f: Fetch, jobId: string, active: boolean): Promise<JobRow | null> {
  try {
    const res = await f(`${JOBS}?${active ? 'status=active&' : ''}limit=20`, { credentials: 'include', cache: 'no-store' });
    const body = await readJson(res);
    const jobs = Array.isArray(body?.jobs) ? (body!.jobs as JobRow[]) : [];
    return jobs.find((j) => j.id === jobId) ?? null;
  } catch {
    return null;
  }
}

/** Run the plan the user confirmed, reporting progress; when the answer never arrives, follow the job row to its end. */
export async function runAgentMontage(
  deps: RunDeps,
  input: { request: unknown; token: string; prompt?: string; jobId: string },
): Promise<ClientRun> {
  let settled = false;
  const answer = (async (): Promise<ClientRun | 'dropped'> => {
    try {
      const res = await post(deps.fetch, { action: 'run', request: input.request, token: input.token, prompt: input.prompt });
      const body = await readJson(res);
      if (res.ok && body?.ok === true && typeof body.videoUrl === 'string') {
        return { ok: true, videoUrl: body.videoUrl, durationSec: Number(body.durationSec) || 0, aspect: String(body.aspect ?? '') };
      }
      // A gateway timeout or an empty body says nothing about the edit itself: the row does.
      if (!body || res.status === 504) return 'dropped';
      return { ok: false, code: codeOf(res.status, body) };
    } catch {
      return 'dropped';
    } finally {
      settled = true;
    }
  })();

  const follow = (async () => {
    while (!settled) {
      await deps.sleep(POLL_MS);
      if (settled) return;
      const row = await readRow(deps.fetch, input.jobId, true);
      if (row && !settled) deps.onProgress(typeof row.pct === 'number' ? row.pct : null, row.current_stage ?? null);
    }
  })();

  const first = await answer;
  await follow;
  if (first !== 'dropped') return first;

  // Recovery: the connection went, the job did not. Read its row until it ends.
  const until = deps.now() + RECOVER_MS;
  while (deps.now() < until) {
    const row = await readRow(deps.fetch, input.jobId, false);
    if (row?.status === 'completed') {
      const url = (row.result?.videoUrl as string | undefined) ?? row.signed_url ?? null;
      if (url) return { ok: true, videoUrl: url, durationSec: Number(row.result?.durationSec) || 0, aspect: String(row.result?.aspect ?? '') };
    }
    if (row?.status === 'failed') return { ok: false, code: /cancel/i.test(row.error ?? '') ? 'cancelled' : 'render_failed' };
    if (row) deps.onProgress(typeof row.pct === 'number' ? row.pct : null, row.current_stage ?? null);
    await deps.sleep(POLL_MS);
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
