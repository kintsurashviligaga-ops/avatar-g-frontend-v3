/**
 * lib/agent/media/editClient.ts — the studio's calls for Agent G's edit (/api/agent/media/edit): ask for the plan of an
 * edit of one attached video (uploaded first) or of Agent G's own last result (by its link), run it on the user's Start,
 * follow it (./jobFollow, the same follower as the montage and the MP3), stop it. Browser-side, every effect injected.
 */
import type { EditQuote } from './editExec';
import type { EditAsk } from './editWords';
import { editCodeOf, type EditChatCode } from './editChat';
import type { TaskView } from '@/lib/tasks/taskView';
import type { RunApproval } from '@/lib/agent/approval';
import { cancelTask, postJson, readJson, routeEnabled, sendAndFollow, type Fetch, type FollowDeps } from './jobFollow';

const ROUTE = '/api/agent/media/edit';

export type EditClientQuote =
  | { ok: true; quote: EditQuote; request: unknown; token: string }
  | { ok: false; code: EditChatCode; detail?: string };

/** Is Agent G's edit open to this user? Closed or unreachable = "no": the chat keeps its old flow. */
export function editEnabled(f: Fetch): Promise<boolean> {
  return routeEnabled(f, ROUTE);
}

async function askQuote(f: Fetch, body: { file: string; edits: EditAsk[]; name?: string }): Promise<EditClientQuote> {
  try {
    const res = await postJson(f, ROUTE, { action: 'quote', ...body });
    const b = await readJson(res);
    if (res.ok && b?.ok === true) return { ok: true, quote: b.quote as EditQuote, request: b.request, token: String(b.token) };
    const detail = typeof b?.message === 'string' ? b.message : undefined;
    return { ok: false, code: editCodeOf(res.status, b), ...(detail ? { detail } : {}) };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/** Upload the user's video to their own storage, then ask for the edit's plan. Spends nothing. */
export async function quoteEditFile(
  deps: { fetch: Fetch; upload: (dataUrl: string, mimeType: string) => Promise<string | null> },
  file: { dataUrl: string; mimeType: string; name?: string },
  edits: EditAsk[],
): Promise<EditClientQuote> {
  const path = await deps.upload(file.dataUrl, file.mimeType).catch(() => null);
  if (!path) return { ok: false, code: 'upload_failed' };
  return askQuote(deps.fetch, { file: path, edits, ...(file.name ? { name: file.name } : {}) });
}

/** The plan for an edit of a result Agent G made for this user (its link; the server checks it is theirs). */
export function quoteEditResult(f: Fetch, url: string, edits: EditAsk[], name?: string): Promise<EditClientQuote> {
  return askQuote(f, { file: url, edits, ...(name ? { name } : {}) });
}

export type EditClientRun =
  | { ok: true; output: 'mp4' | 'jpg'; url: string; name: string; durationSec: number; width: number; height: number }
  | { ok: false; code: EditChatCode };

const done = (t: TaskView): EditClientRun | null => {
  const r = t.result;
  if (t.status === 'completed' && r?.url) {
    return {
      ok: true,
      output: r.media === 'image' ? 'jpg' : 'mp4',
      url: r.url,
      name: r.name || (r.media === 'image' ? 'thumbnail.jpg' : 'edit.mp4'),
      durationSec: Number(r.durationSec) || 0,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
    };
  }
  if (t.status === 'failed' || t.status === 'cancelled') return { ok: false, code: editCodeOf(500, { error: t.error ?? 'render_failed' }) };
  return null;
};

/** Queue the plan the user confirmed, then follow the job to its end. Never starts a second job for the same plan. */
export function runAgentEdit(
  deps: FollowDeps,
  input: { request: unknown; token: string; jobId: string; approval?: RunApproval },
): Promise<EditClientRun> {
  return sendAndFollow<EditClientRun>(deps, {
    route: ROUTE,
    runBody: { action: 'run', request: input.request, token: input.token, ...(input.approval ? { approval: input.approval } : {}) },
    jobId: input.jobId,
    done,
    refused: (status, body) => ({ ok: false, code: editCodeOf(status, body) }),
    lost: (why) => ({ ok: false, code: why }),
  });
}

/** Stop a running edit. The run's own follow then reports it as cancelled. */
export function cancelAgentEdit(f: Fetch, jobId: string): Promise<boolean> {
  return cancelTask(f, jobId);
}
