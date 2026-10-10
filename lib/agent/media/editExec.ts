/**
 * lib/agent/media/editExec.ts — Agent G edits one of the user's videos (or takes a still from it) as a real job, on the
 * same lease queue as the montage and the MP3 (lib/orchestrator/jobLease). Master Task PART 3, slice 2: the edits the
 * remix and the editor already make (lib/video/remixOps, surgicalOps), now an action Agent G can quote, queue, follow,
 * stop and deliver into the chat, including on its own last result.
 *
 * The request side, in four calls (./audioExtract's shape):
 *
 *   quote   ONE file of the caller's own (an upload, a Library item, or a result Agent G made for them: a link to
 *           another site is not taken here). It is probed, the asked edits are resolved against it (./editPlan: the
 *           exact range kept, the frame, the length, the sound), and the plan is signed (./quoteToken). Spends nothing.
 *   run     only with that quote, which the USER confirmed in the chat: one queued row under the quote's job id (a
 *           second run of the same quote reports the first). The work is the worker's (./editWorker).
 *   status  the owner reads where the job is; a job no worker has (yet, or any more) is handed to one.
 *   cancel  the owner stops a queued or running edit; its worker kills its ffmpeg at the next heartbeat.
 *
 * FREE (EDIT_PRICE_CREDITS 0): no model and no provider is called. The result is filed like the montage's (the row's
 * signed_url), so it shows in the Library and in the task tray.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { cancel, claimable, enqueue, type LeaseRow, type LeaseStore } from '@/lib/orchestrator/jobLease';
import {
  EDIT_KIND, EDIT_PRICE_CREDITS, editNameFor, resolveEdits, validateEditRequest,
  type EditPlan, type EditPlanError, type EditRequest, type MediaEdit,
} from './editPlan';
import { QUOTE_TTL_MS, signQuote, verifyQuote } from './quoteToken';
import type { AuditEvent, FileRef } from './montageExec';

export { EDIT_KIND, EDIT_PRICE_CREDITS };

export type EditErrorCode =
  | EditPlanError['error']
  | 'bad_input' | 'media_not_yours' | 'unreadable' | 'not_configured' | 'invalid_request' | 'quote_invalid'
  | 'quote_changed' | 'quote_expired' | 'already_failed' | 'jobs_unavailable' | 'source_changed' | 'render_failed'
  | 'unavailable' | 'too_large' | 'qc_failed' | 'upload_failed' | 'cancelled' | 'not_found' | 'not_running';

export interface EditError {
  ok: false;
  error: EditErrorCode;
  message: string;
  jobId?: string;
}

export type RenderOutcome =
  | { ok: true; bytes: Buffer; input: BannerProbe; output: BannerProbe | null }
  | { ok: false; error: 'render_failed' | 'unavailable' | 'too_large' | 'no_video'; detail?: string };

export interface EditExecDeps {
  /** One of the caller's own files (an upload, a Library item, our own result) → a URL ffmpeg may read. */
  resolveFile(ref: string, userId: string): Promise<FileRef>;
  probe(url: string): Promise<BannerProbe | null>;
  /** ffmpeg: the source → the edited MP4 (or the JPEG). Aborting `signal` kills it. */
  render(url: string, request: EditRequest, opts: { signal: AbortSignal }): Promise<RenderOutcome>;
  /** Store the result; its signed URL, or null when storage refused it. */
  upload(jobId: string, bytes: Buffer, output: EditPlan['output']): Promise<string | null>;
  /** A fresh link to a stored result of ours (it outlives its first signature). */
  resign(url: string): Promise<string>;
  store: LeaseStore;
  audit(ev: AuditEvent): Promise<void>;
  key(): string;
  now(): number;
  newId(): string;
  every(ms: number, tick: () => Promise<void>): () => void;
}

export interface EditQuote {
  jobId: string;
  credits: number;
  name: string;
  edits: MediaEdit[];
  plan: EditPlan;
  expiresAt: number;
}

export type EditQuoteResult = { ok: true; quote: EditQuote; request: EditRequest; token: string } | EditError;

export type EditJobView =
  | { ok: true; jobId: string; status: 'queued' | 'running'; stage: string | null; pct: number; attempt: number }
  | { ok: true; jobId: string; status: 'completed'; output: 'mp4' | 'jpg'; url: string; name: string; durationSec: number; width: number; height: number; edits: MediaEdit[] }
  | { ok: true; jobId: string; status: 'failed'; error: EditErrorCode };

export type EditRunResult = (EditJobView & { replay: boolean }) | EditError;

const err = (error: EditErrorCode, message: string, extra: Partial<EditError> = {}): EditError => ({ ok: false, error, message, ...extra });

export interface EditQuoteInput {
  userId: string;
  /** The caller's own file: a storage path, our signed link, or a Library item's link. */
  file?: unknown;
  /** The edits as asked (./editWords mineEdits, a tool call, a run step); resolved here against the file. */
  edits?: unknown;
  /** The file's own name, for the result's name. */
  name?: unknown;
}

/** Probe the file, resolve the edits against it, plan and sign. Spends nothing, writes nothing but an audit event. */
export async function quoteEdit(deps: EditExecDeps, input: EditQuoteInput): Promise<EditQuoteResult> {
  const { userId } = input;
  const refuse = async (e: EditError): Promise<EditError> => {
    await deps.audit({ userId, op: 'media_edit', phase: 'quote', outcome: 'refused', detail: e.error });
    return e;
  };
  const file = typeof input.file === 'string' ? input.file.trim() : '';
  if (!file || file.length > 2048) return refuse(err('bad_input', 'Send one of your videos.'));
  if (!deps.key()) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));

  const r = await deps.resolveFile(file, userId);
  if (!r.ok) return refuse(r.reason === 'not_yours' ? err('media_not_yours', 'This file is not one of yours.') : err('unreadable', 'The file cannot be read.'));
  const probe = await deps.probe(r.url);
  if (!probe) return refuse(err('unreadable', 'The file cannot be read.'));
  const resolved = resolveEdits(input.edits, probe);
  if (!resolved.ok) return refuse(err(resolved.error, resolved.message));

  const request: EditRequest = {
    v: 1,
    source: { ref: file },
    edits: resolved.edits,
    name: editNameFor(typeof input.name === 'string' && input.name.trim() ? input.name : file, resolved.plan.output),
    plan: resolved.plan,
  };
  const jobId = deps.newId();
  const credits = EDIT_PRICE_CREDITS;
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = signQuote({ u: userId, j: jobId, f: bodyFingerprint(request), c: credits, x: expiresAt }, deps.key());
  if (!token) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));
  await deps.audit({
    userId, op: 'media_edit', phase: 'quote', outcome: 'ok', jobId, files: 1, credits, durationSec: resolved.plan.durationSec,
    detail: `${resolved.edits.map((e) => e.op).join('+')} → ${resolved.plan.output}`,
  });
  return { ok: true, quote: { jobId, credits, name: request.name, edits: request.edits, plan: request.plan, expiresAt }, request, token };
}

/** The error column of a failed row → the code the chat speaks. Rows are written `<code>: <detail>`. */
export function editCodeOfRow(error: string | null): EditErrorCode {
  const e = error ?? '';
  if (/^cancel/i.test(e)) return 'cancelled';
  const code = /^([a-z_]+):/.exec(e)?.[1];
  const known: EditErrorCode[] = ['source_changed', 'no_video', 'unavailable', 'too_large', 'qc_failed', 'upload_failed', 'invalid_request', 'media_not_yours', 'unreadable'];
  return code && (known as string[]).includes(code) ? (code as EditErrorCode) : 'render_failed';
}

/** The owner's view of a row. */
export function editViewOf(row: LeaseRow): EditJobView {
  if (row.status === 'completed') {
    const r = row.result ?? {};
    const request = validateEditRequest((row.params._job as { request?: unknown } | undefined)?.request);
    const output = r.output === 'jpg' ? 'jpg' : 'mp4';
    return {
      ok: true, jobId: row.id, status: 'completed', output,
      url: typeof r.url === 'string' ? r.url : '',
      name: typeof r.name === 'string' ? r.name : `video-edit.${output}`,
      durationSec: typeof r.durationSec === 'number' ? r.durationSec : 0,
      width: typeof r.width === 'number' ? r.width : 0,
      height: typeof r.height === 'number' ? r.height : 0,
      edits: request?.edits ?? [],
    };
  }
  if (row.status === 'failed') return { ok: true, jobId: row.id, status: 'failed', error: editCodeOfRow(row.error) };
  return { ok: true, jobId: row.id, status: row.status === 'pending' ? 'queued' : 'running', stage: row.stage, pct: row.pct, attempt: row.exec?.attempt ?? 0 };
}

export interface EditRunInput {
  userId: string;
  request: unknown;
  token: unknown;
  /** The multi-step run (lib/agent/run) this job is a step of: kept on the row (`_parent`) and in its audit. Server-set only. */
  parent?: string;
}

/** Queue a quote the user confirmed, never twice. Answers at once; the edit is the worker's. */
export async function enqueueEditJob(deps: EditExecDeps, input: EditRunInput): Promise<EditRunResult> {
  const { userId } = input;
  const request = validateEditRequest(input.request);
  if (!request) return err('invalid_request', 'The plan is not valid.');
  const check = verifyQuote(input.token, deps.key(), { userId, fingerprint: bodyFingerprint(request), now: deps.now() });
  if (!check.ok) {
    await deps.audit({ userId, op: 'media_edit', phase: 'run', outcome: 'refused', detail: `quote_${check.reason}` });
    if (check.reason === 'expired') return err('quote_expired', 'This plan has expired. Ask again for a fresh one.');
    if (check.reason === 'changed') return err('quote_changed', 'The plan differs from the one quoted.');
    return err('quote_invalid', 'This plan is not valid.');
  }
  const jobId = check.claims.j;
  const put = await enqueue(deps.store, {
    id: jobId,
    userId,
    serviceType: request.plan.output === 'jpg' ? 'image' : 'film',
    kind: EDIT_KIND,
    params: {
      subtype: request.plan.output === 'jpg' ? 'thumbnail' : 'edit',
      via: 'agent-g',
      prompt: request.edits.map((e) => e.op).join(' + '),
      _job: { request },
      ...(input.parent ? { _parent: input.parent } : {}),
    },
  });
  if (put === 'error') return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
  if (put === 'exists') {
    const row = await deps.store.read(jobId);
    if (!row || row.userId !== userId || row.exec?.kind !== EDIT_KIND) return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
    const view = editViewOf(row);
    await deps.audit({ userId, op: 'media_edit', phase: 'run', outcome: 'replayed', jobId, detail: view.status, ...(input.parent ? { runId: input.parent } : {}) });
    if (view.status === 'failed') return err('already_failed', 'This already ran and did not finish. Ask again for a fresh plan.', { jobId });
    return { ...(await withFreshUrl(deps, view)), replay: true };
  }
  await deps.audit({
    userId, op: 'media_edit', phase: 'run', outcome: 'ok', jobId, files: 1, credits: EDIT_PRICE_CREDITS,
    detail: `queued: ${request.edits.map((e) => e.op).join('+')}`, ...(input.parent ? { runId: input.parent } : {}),
  });
  return { ok: true, jobId, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false };
}

/** A completed view's link, re-signed (our own stored result only: the worker wrote it). */
async function withFreshUrl(deps: EditExecDeps, view: EditJobView): Promise<EditJobView> {
  if (view.status !== 'completed' || !view.url) return view;
  return { ...view, url: await deps.resign(view.url).catch(() => view.url) };
}

/** A pending row no worker took within this long is handed to one by the owner's status read. */
export const EDIT_KICK_AFTER_MS = 15_000;

/** Where the owner's job is, and whether it needs a worker now. */
export async function editJobStatus(
  deps: EditExecDeps,
  input: { userId: string; jobId: unknown },
): Promise<{ view: EditJobView; needsWorker: boolean } | EditError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const row = jobId ? await deps.store.read(jobId) : null;
  if (!row || row.userId !== input.userId || row.exec?.kind !== EDIT_KIND) return err('not_found', 'No such job.');
  const now = deps.now();
  const needsWorker = claimable(row, now) && (row.status === 'processing' || now - row.createdAt >= EDIT_KICK_AFTER_MS);
  return { view: await withFreshUrl(deps, editViewOf(row)), needsWorker };
}

export const EDIT_CANCELLED = 'cancelled by the user';

/** The owner stops a queued or running edit; its worker kills ffmpeg at its next heartbeat. */
export async function cancelEditJob(deps: EditExecDeps, input: { userId: string; jobId: unknown }): Promise<{ ok: true } | EditError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const before = jobId ? await deps.store.read(jobId) : null;
  if (!before || before.exec?.kind !== EDIT_KIND) return err('not_found', 'No such job.');
  const r = await cancel(deps.store, jobId, input.userId, EDIT_CANCELLED, false);
  if (!r.ok) return r.reason === 'final' ? err('not_running', 'This is no longer running.', { jobId }) : err('not_found', 'No such job.');
  await deps.audit({ userId: input.userId, op: 'media_edit', phase: 'cancel', outcome: 'cancelled', jobId });
  return { ok: true };
}
