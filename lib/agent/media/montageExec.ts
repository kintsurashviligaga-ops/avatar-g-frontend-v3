/**
 * lib/agent/media/montageExec.ts — Agent G cuts the user's clips to their music, as a real job.
 *
 * The first media execution Agent G does itself (PROJECT_MASTER Section F, slice 1). The request side, in four calls:
 *
 *   quote   the caller's own files only → probe each (clip or track?) → find the track's beat → plan the cuts →
 *           price it. Spends nothing and writes nothing; returns the plan and a signed quote (./quoteToken).
 *   run     only with that quote, which the USER confirmed in the chat: one queued job row under the quote's job id
 *           (so a second run of the same quote reports the first instead of queueing again) → credits charged when the
 *           edit costs any → answered at once. The render itself is the worker's (./montageWorker): it holds a lease
 *           on the row, renews it while the montage lane renders, QCs the master and delivers it. A worker that dies
 *           is replaced (one retry); a job that cannot finish is failed and its charge paid back exactly once.
 *   status  the owner reads where the job is; a job no worker has (yet, or any more) is handed to one.
 *   cancel  the owner stops a queued or running job; its worker kills its ffmpeg at the next heartbeat.
 *
 * Execution foundation (owner, 2026-10-09 11:15Z): the queue is lib/orchestrator/jobLease on generation_jobs (no new
 * table); every state change is a compare-and-set; the refund a failure owes is written WITH the failure (the outbox
 * entry) and paid by whoever gets there first, through lib/orchestrator/ledger refundDebitByRef, which pays back only
 * what the ledger shows was debited under the ref, so a debt can never mint credits.
 *
 * No new pipeline and no free-form commands: the only operation is the montage lane, its request is built here from
 * probed numbers and checked by the lane's own validator, and ffmpeg only ever reads files through
 * lib/video/ffmpegExec (public hosts, media types, size caps). Every effect is injected (./montageLive binds the live
 * ones), so every rule below is unit-tested without ffmpeg, storage, the ledger or a network.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import { bodyFingerprint, produceRef } from '@/lib/orchestrator/idemRef';
import {
  MAX_SHOTS,
  MAX_SHOT_SEC,
  MAX_TOTAL_SEC,
  MIN_SHOT_SEC,
  timelineDuration,
  validateMontageRequest,
  type MontageAspect,
  type MontageRequest,
} from '@/lib/services/montage/montagePlan';
import { planBeatCuts, type BeatGrid } from '@/lib/services/montage/beatPlan';
import { minePlanParams } from '@/lib/agent/params';
import { cancel, claimable, enqueue, failPending, release, settled, type LeaseRow, type LeaseStore } from '@/lib/orchestrator/jobLease';
import { MAX_FILES, aspectFromClips, montageBody, sortInputs } from './montageAsk';
import { QUOTE_TTL_MS, signQuote, verifyQuote } from './quoteToken';
import { TAP, approvalParams, withNote, type RunApproval } from '@/lib/agent/approval';

/**
 * What an Agent G montage costs, in credits. The owner chose FREE on 2026-10-09 (decision card in the Master Task
 * thread), the same as Montage Studio (lib/catalog video.editing has no pricing key): no provider is called, only the
 * function's own ffmpeg. A non-zero price turns on the reserve → refund path below, which is tested with one.
 */
export const MONTAGE_PRICE_CREDITS = 0;

export type FileRef = { ok: true; url: string } | { ok: false; reason: 'not_yours' | 'unreadable' };

/** generation_jobs rows of Agent G montages carry this queue kind in params._exec. */
export const MONTAGE_KIND = 'agent-montage';

export interface AuditEvent {
  userId: string;
  /** montage: ./montageExec; audio_extract: ./audioExtract; media_edit: ./editExec; media_analyze: ./analyzeExec;
   *  agent_run: a multi-step run (lib/agent/run); studio_run: a studio generation a Live call started on the user's
   *  spoken yes (app/api/agent/approvals). */
  op: 'montage' | 'audio_extract' | 'media_edit' | 'media_analyze' | 'agent_run' | 'studio_run';
  phase: 'quote' | 'run' | 'cancel' | 'refund' | 'approve' | 'resume' | 'step' | 'analyze';
  outcome: 'ok' | 'refused' | 'failed' | 'replayed' | 'cancelled' | 'retried' | 'lost';
  jobId?: string;
  /** The multi-step run this belongs to: the run itself, or the run a step's job was started by. */
  runId?: string;
  /** The capability that ran (lib/agent/capabilities id); filled from `op` by the live audit when absent. */
  toolId?: string;
  /** How the user said yes to what this started (lib/agent/contracts AgentApproval channel). */
  approval?: 'tap' | 'panel-button' | 'voice-transcript';
  files?: number;
  credits?: number;
  durationSec?: number;
  attempt?: number;
  detail?: string;
}

export interface MontageExecDeps {
  /** A file reference the caller sent → a URL ffmpeg may read. Only the caller's own upload or Library item. */
  resolveFile(ref: string, userId: string): Promise<FileRef>;
  probe(url: string): Promise<BannerProbe | null>;
  analyzeTrack(url: string): Promise<{ probe: BannerProbe; grid: BeatGrid | null } | null>;
  /** The montage lane. Aborting `signal` kills the ffmpeg of the leg that is running; `onStage` reports each leg. */
  render(req: MontageRequest, opts: { jobId: string; signal: AbortSignal; onStage: (step: string, pct: number) => Promise<unknown> }): Promise<MontageOutcome>;
  /** generation_jobs as a lease queue (lib/orchestrator/jobLease). */
  store: LeaseStore;
  billing: {
    reserve(userId: string, credits: number, ref: string): Promise<{ proceed: boolean; charged: boolean; reason: string }>;
    /** Pay back what the ledger shows was debited under `ref` (at most `credits`), once. 'nothing' = no debit to pay back. */
    refund(userId: string, ref: string, credits: number): Promise<'refunded' | 'nothing' | 'error'>;
  };
  audit(ev: AuditEvent): Promise<void>;
  /** The quote-signing key; empty = quotes cannot be made (fail closed). */
  key(): string;
  now(): number;
  newId(): string;
  /** Calls `tick` every `ms` until the returned function is called (the worker's heartbeat). */
  every(ms: number, tick: () => Promise<void>): () => void;
}

export type MontageErrorCode =
  | 'bad_input' | 'too_many_files' | 'media_not_yours' | 'unreadable' | 'no_clip' | 'no_track' | 'several_tracks'
  | 'too_many_clips' | 'plan_failed' | 'not_configured' | 'invalid_request' | 'quote_invalid' | 'quote_changed'
  | 'quote_expired' | 'in_progress' | 'already_failed' | 'jobs_unavailable' | 'insufficient_credits'
  | 'billing_unavailable' | 'render_failed' | 'qc_failed' | 'cancelled' | 'not_found' | 'not_running';

export interface MontageError {
  ok: false;
  error: MontageErrorCode;
  message: string;
  /** Which of the caller's files (0-based, in the order sent) the error is about. */
  files?: number[];
  jobId?: string;
}

export interface MontageQuote {
  jobId: string;
  credits: number;
  totalSec: number;
  shots: number;
  clips: number;
  aspect: MontageAspect;
  beatSynced: boolean;
  bpm: number | null;
  musicStartSec: number;
  /** Files (0-based, in the order sent) too short for one shot: named in the quote, never dropped silently. */
  unusedFiles: number[];
  expiresAt: number;
}

export type QuoteResult = { ok: true; quote: MontageQuote; request: MontageRequest; token: string } | MontageError;

/** Where a job is, as its owner sees it. */
export type JobView =
  | { ok: true; jobId: string; status: 'queued' | 'running'; stage: string | null; pct: number; attempt: number }
  | { ok: true; jobId: string; status: 'completed'; videoUrl: string; durationSec: number; aspect: string }
  | { ok: true; jobId: string; status: 'failed'; error: MontageErrorCode };

export type RunResult = (JobView & { replay: boolean }) | MontageError;

const err = (error: MontageErrorCode, message: string, extra: Partial<MontageError> = {}): MontageError =>
  ({ ok: false, error, message, ...extra });

const LIMITS = { maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC };

export interface QuoteInput {
  userId: string;
  files: unknown;
  prompt?: unknown;
  aspect?: unknown;
  targetSec?: unknown;
  /** Where the music starts, in seconds into the track; read from the prompt when absent (lib/agent/params). */
  musicFromSec?: unknown;
}

const positive = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined);

/** Analyse, plan and price. Spends nothing, writes nothing but an audit event. */
export async function quoteMontage(deps: MontageExecDeps, input: QuoteInput): Promise<QuoteResult> {
  const { userId } = input;
  const refuse = async (e: MontageError): Promise<MontageError> => {
    await deps.audit({ userId, op: 'montage', phase: 'quote', outcome: 'refused', detail: e.error });
    return e;
  };
  const files = Array.isArray(input.files) ? input.files : null;
  if (!files || !files.length || files.some((f) => typeof f !== 'string' || !f.trim() || f.length > 2048)) {
    return refuse(err('bad_input', 'Send the clips and the track as file references.'));
  }
  if (files.length > MAX_FILES) return refuse(err('too_many_files', `At most ${MAX_FILES} files: one track and up to ${MAX_FILES - 1} clips.`));
  if (!deps.key()) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));

  // ── the caller's own files only ────────────────────────────────────────────────────────────────────────────────
  const urls: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const r = await deps.resolveFile((files[i] as string).trim(), userId);
    if (!r.ok) {
      return refuse(r.reason === 'not_yours'
        ? err('media_not_yours', `File ${i + 1} is not yours.`, { files: [i] })
        : err('unreadable', `File ${i + 1} cannot be read.`, { files: [i] }));
    }
    urls.push(r.url);
  }

  // ── analyse: which is a clip, which is the track, how long is each, where is the beat ─────────────────────────────
  const probes: Array<BannerProbe | null> = [];
  for (const url of urls) probes.push(await deps.probe(url));
  const sorted = sortInputs(probes);
  if (!sorted.ok) {
    const message: Record<typeof sorted.error, string> = {
      unreadable: 'Some files could not be read as video or audio.',
      no_clip: 'Attach at least one video clip.',
      no_track: 'Attach the music track too.',
      several_tracks: 'Attach exactly one music track.',
      too_many_clips: `At most ${MAX_FILES - 1} clips in one edit.`,
    };
    return refuse(err(sorted.error, message[sorted.error], sorted.files ? { files: sorted.files } : {}));
  }
  const track = await deps.analyzeTrack(urls[sorted.track]!);
  if (!track || !(track.probe.durationSec > 0)) {
    return refuse(err('unreadable', 'The music track could not be read.', { files: [sorted.track] }));
  }

  // ── plan ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const clipProbes = sorted.clips.map((i) => probes[i]!);
  // The user's words name the length, the music start and the frame („20 წამიანი", „მუსიკა 5 წამიდან", „9:16"): the same
  // reader the chat uses to decide that a message changes this plan (lib/agent/params), so the card and the edit never
  // disagree. A plan changed in the chat comes back with the change on a later line, and a later line wins.
  const prompt = typeof input.prompt === 'string' ? input.prompt.slice(0, 2000) : '';
  const said = prompt ? minePlanParams(prompt) : {};
  const askedSec = positive(input.targetSec) ?? said.durationSec;
  const target = askedSec ? Math.min(askedSec, MAX_TOTAL_SEC) : undefined;
  const musicFromSec = positive(input.musicFromSec) ?? said.musicStartSec;
  const plan = planBeatCuts({
    clipDurationsSec: clipProbes.map((p) => p.durationSec),
    musicSec: track.probe.durationSec,
    grid: track.grid,
    ...(target ? { targetSec: target } : {}),
    ...(musicFromSec ? { musicFromSec } : {}),
    ...LIMITS,
  });
  if (!plan.ok) return refuse(err('plan_failed', plan.error ?? 'No edit fits these files.'));

  const aspect: MontageAspect =
    input.aspect === '9:16' || input.aspect === '16:9' || input.aspect === '1:1'
      ? input.aspect
      : said.aspect ?? aspectFromClips(clipProbes);
  const body = montageBody(plan, sorted.clips.map((i) => urls[i]!), urls[sorted.track]!, aspect);
  const valid = validateMontageRequest(body);
  if (!valid.ok || !valid.request) return refuse(err('plan_failed', valid.error ?? 'The plan did not validate.'));
  const request = valid.request;

  // ── price + sign ───────────────────────────────────────────────────────────────────────────────────────────────
  const jobId = deps.newId();
  const credits = MONTAGE_PRICE_CREDITS;
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = signQuote({ u: userId, j: jobId, f: bodyFingerprint(request), c: credits, x: expiresAt }, deps.key());
  if (!token) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));

  const quote: MontageQuote = {
    jobId,
    credits,
    totalSec: timelineDuration(request.shots),
    shots: request.shots.length,
    clips: sorted.clips.length,
    aspect,
    beatSynced: plan.beatSynced,
    bpm: plan.bpm,
    musicStartSec: plan.musicStartSec,
    unusedFiles: plan.unusedClips.map((c) => sorted.clips[c]!),
    expiresAt,
  };
  await deps.audit({ userId, op: 'montage', phase: 'quote', outcome: 'ok', jobId, files: files.length, credits, durationSec: quote.totalSec });
  return { ok: true, quote, request, token };
}

export interface RunInput {
  userId: string;
  request: unknown;
  token: unknown;
  /** The user's own words, kept on the job for the Library card. */
  prompt?: unknown;
  /** The multi-step run (lib/agent/run) this job is a step of: kept on the row (`_parent`) and in its audit. Server-set only. */
  parent?: string;
  /** How the user said yes (lib/agent/approval, parsed by the route): kept on the row (`_approval`) and in the audit. Absent = the Start tap. */
  approval?: RunApproval;
}

export const CANCELLED = 'cancelled by the user';

/** The error column of a failed row → the code the chat speaks. Rows are written `<code>: <detail>`. */
export function codeOfRowError(error: string | null): MontageErrorCode {
  const e = error ?? '';
  if (/^cancel/i.test(e)) return 'cancelled';
  for (const code of ['qc_failed', 'insufficient_credits', 'billing_unavailable', 'invalid_request'] as const) {
    if (e.startsWith(code)) return code;
  }
  return 'render_failed';
}

/** The owner's view of a row. */
export function viewOf(row: LeaseRow): JobView {
  if (row.status === 'completed') {
    const r = row.result ?? {};
    const url = typeof r.videoUrl === 'string' ? r.videoUrl : row.signedUrl ?? '';
    return {
      ok: true, jobId: row.id, status: 'completed', videoUrl: url,
      durationSec: typeof r.durationSec === 'number' ? r.durationSec : 0, aspect: typeof r.aspect === 'string' ? r.aspect : '',
    };
  }
  if (row.status === 'failed') return { ok: true, jobId: row.id, status: 'failed', error: codeOfRowError(row.error) };
  return {
    ok: true, jobId: row.id, status: row.status === 'pending' ? 'queued' : 'running',
    stage: row.stage, pct: row.pct, attempt: row.exec?.attempt ?? 0,
  };
}

/** The run a job is a step of (`params._parent`, written by the server when a run queues it), for its audit rows. */
export function runIdOf(row: Pick<LeaseRow, 'params'>): { runId: string } | Record<string, never> {
  const p = row.params._parent;
  return typeof p === 'string' && p ? { runId: p } : {};
}

/** The charge a row claims, if any. A claim, not a fact: the refund pays back only what the ledger shows. */
export function reserveOf(row: LeaseRow): { ref: string; credits: number } | null {
  const r = row.params._reserve as { ref?: unknown; credits?: unknown } | undefined;
  return r && typeof r.ref === 'string' && typeof r.credits === 'number' && r.credits > 0 ? { ref: r.ref, credits: r.credits } : null;
}

/** Pay a final row's debt (its refund), then clear it. Safe to call by everyone, any number of times. */
export async function payDebt(deps: MontageExecDeps, row: LeaseRow): Promise<void> {
  if (!row.exec?.owe) return;
  const reserve = reserveOf(row);
  const paid = reserve ? await deps.billing.refund(row.userId, reserve.ref, reserve.credits) : 'nothing';
  if (paid === 'error') {
    await deps.audit({ userId: row.userId, op: 'montage', phase: 'refund', outcome: 'failed', jobId: row.id, credits: reserve?.credits, detail: 'refund did not land; the sweep retries it' });
    return;
  }
  await settled(deps.store, row.id);
  await deps.audit({ userId: row.userId, op: 'montage', phase: 'refund', outcome: 'ok', jobId: row.id, credits: reserve?.credits, detail: paid });
}

/**
 * Queue a quote the user confirmed. Never twice for one quote; charges (when the edit costs anything) only after its
 * row exists, holding the row from the workers until the charge landed. The render is the worker's.
 */
export async function enqueueMontageJob(deps: MontageExecDeps, input: RunInput): Promise<RunResult> {
  const { userId } = input;
  const approval = input.approval ?? TAP;
  const valid = validateMontageRequest(input.request);
  if (!valid.ok || !valid.request) return err('invalid_request', valid.error ?? 'The edit is not valid.');
  const request = valid.request;

  const check = verifyQuote(input.token, deps.key(), { userId, fingerprint: bodyFingerprint(request), now: deps.now() });
  if (!check.ok) {
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'refused', detail: `quote_${check.reason}` });
    if (check.reason === 'expired') return err('quote_expired', 'This quote has expired. Ask again for a fresh one.');
    if (check.reason === 'changed') return err('quote_changed', 'The edit differs from the one quoted.');
    return err('quote_invalid', 'This quote is not valid.');
  }
  const { j: jobId, c: credits } = check.claims;
  const totalSec = timelineDuration(request.shots);
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 500) : '';
  const ref = produceRef('agent-montage', jobId);

  // ── one job per quote: the insert is the idempotency check ───────────────────────────────────────────────────────
  const put = await enqueue(deps.store, {
    id: jobId,
    userId,
    serviceType: 'film',
    kind: MONTAGE_KIND,
    hold: credits > 0,
    params: {
      subtype: 'montage',
      via: 'agent-g',
      shots: request.shots.length,
      aspect: request.aspect,
      orientation: request.aspect === '9:16' ? 'vertical' : 'landscape',
      durationSec: totalSec,
      ...(prompt ? { prompt } : {}),
      _job: { request },
      ...(credits > 0 ? { _reserve: { ref, credits } } : {}),
      ...(input.parent ? { _parent: input.parent } : {}),
      ...approvalParams(approval),
    },
  });
  if (put === 'error') return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
  if (put === 'exists') {
    const row = await deps.store.read(jobId);
    if (!row || row.userId !== userId) return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
    const view = viewOf(row);
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'replayed', jobId, detail: view.status, ...(input.parent ? { runId: input.parent } : {}) });
    if (view.status === 'failed') return err('already_failed', 'This edit already ran and did not finish. Ask again for a fresh quote.', { jobId });
    return { ...view, replay: true };
  }

  // ── pay, when it costs anything; the row is held from the workers until then ────────────────────────────────────
  if (credits > 0) {
    const r = await deps.billing.reserve(userId, credits, ref);
    if (!r.proceed) {
      const code = r.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable';
      await failPending(deps.store, jobId, code);
      await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'refused', jobId, credits, detail: code });
      return err(code, code === 'insufficient_credits' ? 'Not enough credits for this edit.' : 'Billing is unavailable; nothing was charged.', { jobId });
    }
    if (!(await release(deps.store, jobId))) {
      // Cancelled while it was being charged (the cancel owes the refund and paid it), or the store is down.
      const row = await deps.store.read(jobId);
      if (row?.status === 'failed') return { ...viewOf(row), replay: false };
      return err('jobs_unavailable', 'The job could not be started; anything charged is paid back by the sweep.', { jobId });
    }
  }
  await deps.audit({
    userId, op: 'montage', phase: 'run', outcome: 'ok', jobId, files: request.shots.length + 1, credits, durationSec: totalSec,
    approval: approval.channel, detail: withNote('queued', approval), ...(input.parent ? { runId: input.parent } : {}),
  });
  return { ok: true, jobId, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false };
}

/** A pending row no worker took within this long is handed to one by the owner's status read. */
export const KICK_AFTER_MS = 15_000;

/** Where the owner's job is, and whether it needs a worker now (none took it, or its worker stopped renewing). */
export async function montageJobStatus(
  deps: MontageExecDeps,
  input: { userId: string; jobId: unknown },
): Promise<{ view: JobView; needsWorker: boolean } | MontageError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const row = jobId ? await deps.store.read(jobId) : null;
  if (!row || row.userId !== input.userId || row.exec?.kind !== MONTAGE_KIND) return err('not_found', 'No such edit.');
  const now = deps.now();
  const needsWorker = claimable(row, now) && (row.status === 'processing' || now - row.createdAt >= KICK_AFTER_MS);
  return { view: viewOf(row), needsWorker };
}

/** The owner stops a queued or running edit. Its worker kills the render at its next heartbeat; a charge is paid back now. */
export async function cancelMontageJob(
  deps: MontageExecDeps,
  input: { userId: string; jobId: unknown },
): Promise<{ ok: true } | MontageError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const before = jobId ? await deps.store.read(jobId) : null;
  if (!before || before.exec?.kind !== MONTAGE_KIND) return err('not_found', 'No such edit.');
  const r = await cancel(deps.store, jobId, input.userId, CANCELLED, reserveOf(before) !== null);
  if (!r.ok) return r.reason === 'final' ? err('not_running', 'This edit is no longer running.', { jobId }) : err('not_found', 'No such edit.');
  await deps.audit({ userId: input.userId, op: 'montage', phase: 'cancel', outcome: 'cancelled', jobId });
  await payDebt(deps, r.row);
  return { ok: true };
}
