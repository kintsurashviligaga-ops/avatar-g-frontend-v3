/**
 * lib/agent/media/montageExec.ts — Agent G cuts the user's clips to their music, as a real job.
 *
 * The first media execution Agent G does itself (PROJECT_MASTER Section F, slice 1), in three calls:
 *
 *   quote   the caller's own files only → probe each (clip or track?) → find the track's beat → plan the cuts →
 *           price it. Spends nothing and writes nothing; returns the plan and a signed quote (./quoteToken).
 *   run     only with that quote, which the USER confirmed in the chat: one job row under the quote's job id (so a
 *           second run of the same quote reports the first instead of rendering again) → reserve credits when the
 *           edit costs any → the EXISTING montage lane (lib/services/montage runMontage, ffmpeg-static) → QC of the
 *           master → completed row (= the Library) or failed row + refund. Every step leaves an audit event.
 *   cancel  the owner stops a running job; the render stops before its next leg and nothing is delivered.
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
import { MAX_FILES, aspectFromClips, aspectFromPrompt, montageBody, qcMaster, sortInputs } from './montageAsk';
import { QUOTE_TTL_MS, signQuote, verifyQuote } from './quoteToken';

/**
 * What an Agent G montage costs, in credits. The owner chose FREE on 2026-10-09 (decision card in the Master Task
 * thread), the same as Montage Studio (lib/catalog video.editing has no pricing key): no provider is called, only the
 * function's own ffmpeg. A non-zero price turns on the reserve → refund path below, which is tested with one.
 */
export const MONTAGE_PRICE_CREDITS = 0;

export type FileRef = { ok: true; url: string } | { ok: false; reason: 'not_yours' | 'unreadable' };

export interface JobSnap {
  userId: string;
  status: string;
  result: Record<string, unknown> | null;
}

export interface AuditEvent {
  userId: string;
  op: 'montage';
  phase: 'quote' | 'run' | 'cancel';
  outcome: 'ok' | 'refused' | 'failed' | 'replayed' | 'cancelled';
  jobId?: string;
  files?: number;
  credits?: number;
  durationSec?: number;
  detail?: string;
}

export interface MontageExecDeps {
  /** A file reference the caller sent → a URL ffmpeg may read. Only the caller's own upload or Library item. */
  resolveFile(ref: string, userId: string): Promise<FileRef>;
  probe(url: string): Promise<BannerProbe | null>;
  analyzeTrack(url: string): Promise<{ probe: BannerProbe; grid: BeatGrid | null } | null>;
  render(req: MontageRequest, opts: { jobId: string; shouldContinue: () => Promise<boolean> }): Promise<MontageOutcome>;
  jobs: {
    create(input: { id: string; userId: string; params: Record<string, unknown> }): Promise<boolean>;
    snapshot(id: string): Promise<JobSnap | null>;
    fail(id: string, error: string): Promise<void>;
    complete(id: string, out: { signedUrl: string; result: Record<string, unknown> }): Promise<void>;
  };
  billing: {
    reserve(userId: string, credits: number, ref: string): Promise<{ proceed: boolean; charged: boolean; reason: string }>;
    recordReservation(jobId: string, r: { ref: string; credits: number }): Promise<void>;
    refund(userId: string, credits: number, ref: string, charged: boolean): Promise<void>;
  };
  audit(ev: AuditEvent): Promise<void>;
  /** The quote-signing key; empty = quotes cannot be made (fail closed). */
  key(): string;
  now(): number;
  newId(): string;
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
export type RunResult =
  | { ok: true; jobId: string; videoUrl: string; durationSec: number; aspect: string; replay: boolean; qc?: string[] }
  | (MontageError & { problems?: string[] });

const err = (error: MontageErrorCode, message: string, extra: Partial<MontageError> = {}): MontageError =>
  ({ ok: false, error, message, ...extra });

const LIMITS = { maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC };

export interface QuoteInput {
  userId: string;
  files: unknown;
  prompt?: unknown;
  aspect?: unknown;
  targetSec?: unknown;
}

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
  const target = typeof input.targetSec === 'number' && Number.isFinite(input.targetSec) && input.targetSec > 0
    ? Math.min(input.targetSec, MAX_TOTAL_SEC)
    : undefined;
  const plan = planBeatCuts({
    clipDurationsSec: clipProbes.map((p) => p.durationSec),
    musicSec: track.probe.durationSec,
    grid: track.grid,
    ...(target ? { targetSec: target } : {}),
    ...LIMITS,
  });
  if (!plan.ok) return refuse(err('plan_failed', plan.error ?? 'No edit fits these files.'));

  const aspect: MontageAspect =
    input.aspect === '9:16' || input.aspect === '16:9' || input.aspect === '1:1'
      ? input.aspect
      : aspectFromPrompt(typeof input.prompt === 'string' ? input.prompt : '') ?? aspectFromClips(clipProbes);
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
}

const CANCELLED = 'cancelled by the user';

/** Run a quote the user confirmed. Never twice for one quote; refunds whatever it charged when it does not deliver. */
export async function runMontageJob(deps: MontageExecDeps, input: RunInput): Promise<RunResult> {
  const { userId } = input;
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

  // ── one job per quote: the insert is the idempotency check ───────────────────────────────────────────────────────
  const created = await deps.jobs.create({
    id: jobId,
    userId,
    params: {
      subtype: 'montage',
      via: 'agent-g',
      shots: request.shots.length,
      aspect: request.aspect,
      orientation: request.aspect === '9:16' ? 'vertical' : 'landscape',
      durationSec: totalSec,
      ...(prompt ? { prompt } : {}),
    },
  });
  if (!created) {
    const snap = await deps.jobs.snapshot(jobId);
    if (!snap || snap.userId !== userId) return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'replayed', jobId, detail: snap.status });
    const url = typeof snap.result?.videoUrl === 'string' ? snap.result.videoUrl : '';
    if (snap.status === 'completed' && url) {
      const d = typeof snap.result?.durationSec === 'number' ? snap.result.durationSec : totalSec;
      return { ok: true, jobId, videoUrl: url, durationSec: d, aspect: request.aspect, replay: true };
    }
    if (snap.status === 'failed') return err('already_failed', 'This edit already ran and did not finish. Ask again for a fresh quote.', { jobId });
    return err('in_progress', 'This edit is already being made.', { jobId });
  }

  // ── pay, when it costs anything ────────────────────────────────────────────────────────────────────────────────
  const ref = produceRef('agent-montage', jobId);
  let charged = false;
  if (credits > 0) {
    const r = await deps.billing.reserve(userId, credits, ref);
    if (!r.proceed) {
      const code = r.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable';
      await deps.jobs.fail(jobId, code);
      await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'refused', jobId, credits, detail: code });
      return err(code, code === 'insufficient_credits' ? 'Not enough credits for this edit.' : 'Billing is unavailable; nothing was charged.', { jobId });
    }
    charged = r.charged;
    if (charged) await deps.billing.recordReservation(jobId, { ref, credits });
  }
  await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'ok', jobId, files: request.shots.length + 1, credits, durationSec: totalSec, detail: 'started' });

  const isCancelled = async () => (await deps.jobs.snapshot(jobId))?.status === 'failed';
  const stop = async (code: MontageErrorCode, message: string, detail: string, problems?: string[]): Promise<RunResult> => {
    const cancelled = code === 'cancelled';
    if (!cancelled) await deps.jobs.fail(jobId, detail);
    await deps.billing.refund(userId, credits, ref, charged);
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: cancelled ? 'cancelled' : 'failed', jobId, credits, detail });
    return { ...err(code, message, { jobId }), ...(problems ? { problems } : {}) };
  };

  // ── render: the existing montage lane ──────────────────────────────────────────────────────────────────────────
  let outcome: MontageOutcome;
  try {
    outcome = await deps.render(request, { jobId, shouldContinue: async () => !(await isCancelled()) });
  } catch (e) {
    outcome = { ok: false, step: 'resolve', error: e instanceof Error ? e.message : 'render failed' };
  }
  if (await isCancelled()) return stop('cancelled', 'The edit was cancelled.', CANCELLED);
  if (!outcome.ok) return stop('render_failed', `The edit failed at ${outcome.step}.`, `${outcome.step}: ${outcome.error}`.slice(0, 300));

  // ── QC before delivery ─────────────────────────────────────────────────────────────────────────────────────────
  const problems: string[] = [];
  if (!outcome.result.hasMusic) problems.push('the music did not mix');
  const qc = qcMaster(await deps.probe(outcome.result.videoUrl), totalSec);
  problems.push(...qc.problems);
  if (problems.length) return stop('qc_failed', 'The finished edit failed its check and was not delivered.', `qc: ${problems.join('; ')}`, problems);
  if (await isCancelled()) return stop('cancelled', 'The edit was cancelled.', CANCELLED);

  const videoUrl = outcome.result.videoUrl;
  await deps.jobs.complete(jobId, {
    signedUrl: videoUrl,
    result: { videoUrl, subtype: 'montage', via: 'agent-g', durationSec: qc.durationSec, aspect: request.aspect },
  });
  await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'ok', jobId, credits, durationSec: qc.durationSec, detail: 'delivered' });
  return { ok: true, jobId, videoUrl, durationSec: qc.durationSec, aspect: request.aspect, replay: false };
}

/** The owner stops a running edit. */
export async function cancelMontageJob(
  deps: MontageExecDeps,
  input: { userId: string; jobId: unknown },
): Promise<{ ok: true } | MontageError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const snap = jobId ? await deps.jobs.snapshot(jobId) : null;
  if (!snap || snap.userId !== input.userId) return err('not_found', 'No such edit.');
  if (snap.status === 'completed' || snap.status === 'failed') return err('not_running', 'This edit is no longer running.', { jobId });
  await deps.jobs.fail(jobId, CANCELLED);
  await deps.audit({ userId: input.userId, op: 'montage', phase: 'cancel', outcome: 'cancelled', jobId });
  return { ok: true };
}
