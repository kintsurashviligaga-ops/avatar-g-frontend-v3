/**
 * lib/agent/media/montageClient.ts — the studio's calls for Agent G's montage (slice 1): upload the attachments, ask for
 * the plan, run it on the user's Start, follow its progress, stop it. Browser-side, every effect injected (fetch, the
 * upload, the clock), so the whole conversation with /api/agent/media/montage is tested without a network.
 *
 * `run` only queues the edit and answers at once; a worker renders it (lib/agent/media/montageWorker). The chat then
 * reads the task (GET /api/tasks?id=…, lib/tasks) every few seconds for its stage and percent until it is delivered
 * or failed. That read is also what wakes a worker when none has the job, so a closed connection, a locked phone or a
 * worker that died costs nothing: the edit goes on server-side and lands in the Library either way.
 */
import type { MontageQuote } from './montageExec';
import { codeOf, type ChatErrorCode } from './montageChat';
import type { TaskView } from '@/lib/tasks/taskView';
import { cancelTask, postJson, readJson, routeEnabled, sendAndFollow, type Fetch, type FollowDeps } from './jobFollow';

export { FOLLOW_MS, POLL_MS, SEND_TRIES } from './jobFollow';

const ROUTE = '/api/agent/media/montage';

export interface ClientFile { dataUrl: string; mimeType: string; name?: string }

export interface QuoteDeps {
  fetch: Fetch;
  /** Puts one attachment in the user's own uploads and returns its storage path (null = it did not land). */
  upload: (dataUrl: string, mimeType: string) => Promise<string | null>;
  /** Each attachment that has settled (landed or not), as it happens: the chat card's „2/4" on its upload step. */
  onUploaded?: (settled: number, total: number) => void;
}

export type ClientQuote =
  | { ok: true; quote: MontageQuote; request: unknown; token: string }
  | { ok: false; code: ChatErrorCode; files?: number[] };

/** Is Agent G's montage open to this user? A closed or unreachable route is simply "no": the chat keeps its old flow. */
export function montageEnabled(f: Fetch): Promise<boolean> {
  return routeEnabled(f, ROUTE);
}

/** Upload every attachment (in order, three at a time) and ask for the plan. Spends nothing. */
export async function quoteAgentMontage(deps: QuoteDeps, input: { prompt: string; files: ClientFile[] }): Promise<ClientQuote> {
  const paths: Array<string | null> = new Array(input.files.length).fill(null);
  let next = 0;
  let settled = 0;
  const worker = async () => {
    while (next < input.files.length) {
      const i = next++;
      const file = input.files[i]!;
      paths[i] = await deps.upload(file.dataUrl, file.mimeType).catch(() => null);
      settled += 1;
      try { deps.onUploaded?.(settled, input.files.length); } catch { /* a progress line never stops the quote */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const missing = paths.flatMap((p, i) => (p ? [] : [i]));
  if (missing.length) return { ok: false, code: 'upload_failed', files: missing };

  try {
    const res = await postJson(deps.fetch, ROUTE, { action: 'quote', files: paths, prompt: input.prompt });
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

export type RunDeps = FollowDeps;

export type ClientRun =
  | { ok: true; videoUrl: string; durationSec: number; aspect: string }
  | { ok: false; code: ChatErrorCode };

const done = (t: TaskView): ClientRun | null => {
  if (t.status === 'completed' && t.result?.url) {
    return { ok: true, videoUrl: t.result.url, durationSec: Number(t.result.durationSec) || 0, aspect: String(t.result.aspect ?? '') };
  }
  // A failed task carries its reason as a code (cancelled, render_failed, qc_failed, a charge that never finished, …).
  if (t.status === 'failed' || t.status === 'cancelled') return { ok: false, code: codeOf(500, { error: t.error ?? 'render_failed' }) };
  return null;
};

/**
 * Queue the plan the user confirmed, then follow the job to its end, reporting its progress (./jobFollow). Re-sending
 * `run` for the same quote never starts a second edit (the server replays the job).
 */
export function runAgentMontage(
  deps: RunDeps,
  input: { request: unknown; token: string; prompt?: string; jobId: string },
): Promise<ClientRun> {
  return sendAndFollow<ClientRun>(deps, {
    route: ROUTE,
    runBody: { action: 'run', request: input.request, token: input.token, prompt: input.prompt },
    jobId: input.jobId,
    done,
    refused: (status, body) => ({ ok: false, code: codeOf(status, body) }),
    lost: (why) => ({ ok: false, code: why }),
  });
}

/** Stop a running edit. The run's own answer then reports it as cancelled. */
export function cancelAgentMontage(f: Fetch, jobId: string): Promise<boolean> {
  return cancelTask(f, jobId);
}
