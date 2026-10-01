/**
 * lib/video/longform/rows.ts — longform_jobs / longform_scenes rows ⇄ the tick's records (pure, no I/O).
 *
 * The column names are the migration's (supabase/migrations/20261001b_longform_jobs.sql); the records are
 * stateMachine.ts's. Times are ISO strings in the database and epoch milliseconds in the machine.
 *
 * ⚠️ READING A ROW NEVER THROWS ON CONTENT. A job whose row cannot be mapped would be leased, error and be re-leased
 * every tick without ever reaching settle() — so it could never hit its deadline and refund. Bad JSON degrades to a
 * safe default instead (an empty bible keeps only the look out of the prompt; the scene's subject was already locked
 * into its shot when the storyboard was written). Everything read from jsonb is coerced, never trusted.
 *
 * The WRITE side (jobInsertRow / sceneInsertRows / directedColumns) is what the create route inserts: the job
 * `directing` first, its scenes after it, then the promotion to `planned` (stateMachine.ts, `directed`).
 */
import type { OutputFormat, ShotSpec, VeoResolution, VeoTier } from '@/lib/veo/types';
import { coerceBible, coerceCamera, type LongformBible, type LongformScene } from './director';
import type { LongformPlan } from './plan';
import { JOB_STATUSES, SCENE_STATUSES, type HoldReason, type JobStatus, type SceneStatus } from './stateMachine';
import type { JobPatch, LongformJobOptions, LongformJobRecord, LongformSceneRecord, ScenePatch } from './tick';

export type Row = Record<string, unknown>;

const HOLD_REASONS: readonly HoldReason[] = ['insufficient_credits', 'billing_unavailable', 'platform_budget', 'provider_unavailable'];
const TIERS: readonly VeoTier[] = ['standard', 'fast', 'lite'];
const FORMATS: readonly OutputFormat[] = ['16:9', '9:16', '1:1', '4:5'];

const str = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strOrNull = (v: unknown, max = 4000): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const intOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);
const ms = (v: unknown): number | null => {
  if (typeof v !== 'string' && !(v instanceof Date)) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const iso = (v: number | null | undefined): string | null => (typeof v === 'number' && Number.isFinite(v) ? new Date(v).toISOString() : null);
function pick<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isHttps = (v: unknown): v is string => typeof v === 'string' && /^https:\/\/[^\s]+$/i.test(v);

/** A bible that renders nothing film-specific — used only when the stored one is unreadable. */
export function emptyBible(actCount: number): LongformBible {
  return {
    title: '',
    logline: '',
    characters: [],
    primaryCharacterId: null,
    look: { colorGrade: '', lighting: '', cameraStyle: '', palette: [], negativePrompt: '' },
    arc: Array.from({ length: Math.max(1, actCount) }, (_, act) => ({ act, title: `Act ${act + 1}`, summary: '', beat: '', closingImage: '' })),
    music: { genre: '', mood: '', tempoBpm: null, instrumentation: '', direction: '' },
  };
}

export function coerceOptions(raw: unknown): LongformJobOptions {
  const o = isRecord(raw) ? raw : {};
  const refs = Array.isArray(o.referenceImageUrls) ? o.referenceImageUrls.filter(isHttps).slice(0, 3) : [];
  const negative = str(o.negativePrompt, 800);
  const musicDur = Number(o.musicDurationSec);
  return {
    ...(negative ? { negativePrompt: negative } : {}),
    ...(refs.length ? { referenceImageUrls: refs } : {}),
    ...(isHttps(o.musicUrl) ? { musicUrl: o.musicUrl } : {}),
    ...(Number.isFinite(musicDur) && musicDur > 0 ? { musicDurationSec: musicDur } : {}),
  };
}

/** The stored shot, coerced; a missing/unusable action falls back to the scene's own prose (never a throw). */
export function coerceShot(spec: unknown, ordinal: number): ShotSpec {
  const s = isRecord(spec) ? spec : {};
  const shot = isRecord(s.shot) ? s.shot : {};
  const audio = isRecord(shot.audio) ? shot.audio : {};
  const dialogue = (Array.isArray(audio.dialogue) ? audio.dialogue : [])
    .filter(isRecord)
    .map((d) => ({ speaker: str(d.speaker, 60) || 'The subject', line: str(d.line, 200), ...(str(d.language, 20) ? { language: str(d.language, 20) } : {}) }))
    .filter((d) => d.line)
    .slice(0, 2);
  const action = str(shot.action, 1200) || str(s.action, 1200) || str(s.imagePrompt, 1200) || 'the scene continues';
  const opt = (k: string, v: unknown, max: number) => (str(v, max) ? { [k]: str(v, max) } : {});
  return {
    ordinal,
    subject: str(shot.subject, 4000),
    action,
    ...opt('setting', shot.setting, 400),
    camera: coerceCamera(shot.camera),
    ...opt('lighting', shot.lighting, 400),
    ...opt('style', shot.style, 400),
    ...opt('mood', shot.mood, 200),
    audio: { dialogue, ...opt('sfx', audio.sfx, 300), ...opt('ambience', audio.ambience, 300) },
    hasStartImage: false,
    transitionOut: 'cut',
  };
}

export function jobFromRow(r: Row): LongformJobRecord {
  const actCount = Math.max(1, int(r.act_count, 1));
  return {
    id: str(r.id, 64),
    userId: str(r.user_id, 64),
    status: pick<JobStatus>(r.status, JOB_STATUSES, 'failed'),
    cancelRequested: r.cancel_requested === true,
    holdUntil: ms(r.hold_until),
    holdReason: r.hold_reason ? pick<HoldReason>(r.hold_reason, HOLD_REASONS, 'provider_unavailable') : null,
    stitchAttempts: Math.max(0, int(r.stitch_attempts)),
    deadlineAt: ms(r.deadline_at) ?? 0,
    errorCode: strOrNull(r.error_code, 120),
    outputUrl: strOrNull(r.output_url),
    sceneCount: Math.max(0, int(r.scene_count)),
    tier: pick<VeoTier>(r.tier, TIERS, 'fast'),
    format: pick<OutputFormat>(r.format, FORMATS, '16:9'),
    resolution: pick<VeoResolution>(r.resolution, ['720p', '1080p'], '1080p'),
    generateAudio: r.generate_audio !== false,
    bible: coerceBible(r.bible, actCount) ?? emptyBible(actCount),
    options: coerceOptions(r.options),
    seed: intOrNull(r.seed),
    creditsPerScene: Math.max(0, int(r.credits_per_scene)),
    refundsPending: r.refunds_pending === true,
    prompt: str(r.prompt, 4000),
    trimToSeconds: intOrNull(r.trim_to_seconds),
  };
}

export function sceneFromRow(r: Row): LongformSceneRecord {
  const ordinal = int(r.ordinal);
  const spec = isRecord(r.spec) ? r.spec : {};
  return {
    ordinal,
    act: Math.max(0, int(r.act)),
    status: pick<SceneStatus>(r.status, SCENE_STATUSES, 'failed'),
    attempts: Math.max(0, int(r.attempts)),
    operation: strOrNull(r.operation_name, 512),
    nextAttemptAt: ms(r.next_attempt_at),
    submittedAt: ms(r.submitted_at),
    dependsOn: intOrNull(r.depends_on),
    seedFrameUrl: strOrNull(r.seed_frame_url),
    chargeRef: strOrNull(r.charge_ref, 200),
    chargeCredits: Math.max(0, int(r.charge_credits)),
    refunded: r.refunded === true,
    outputUrl: strOrNull(r.output_url),
    error: strOrNull(r.error_detail, 300),
    spec: { ...spec, shot: coerceShot(spec, ordinal) },
    outputBytes: intOrNull(r.output_bytes),
    outputPath: strOrNull(r.output_path, 512),
  };
}

/** `retries_exhausted: unavailable` → `retries_exhausted` — a queryable code next to the readable detail. */
export const errorCodeOf = (error: string | null): string | null => (error ? (error.split(':')[0]?.trim().slice(0, 64) || null) : null);

/** A scene patch → the columns to UPDATE. Only the keys present in the patch are written. */
export function scenePatchToColumns(p: ScenePatch): Row {
  const c: Row = {};
  const set = (k: keyof ScenePatch, col: string, v: () => unknown) => {
    if (Object.prototype.hasOwnProperty.call(p, k)) c[col] = v();
  };
  set('status', 'status', () => p.status);
  set('attempts', 'attempts', () => p.attempts);
  set('operation', 'operation_name', () => p.operation ?? null);
  set('nextAttemptAt', 'next_attempt_at', () => iso(p.nextAttemptAt));
  set('submittedAt', 'submitted_at', () => iso(p.submittedAt));
  set('dependsOn', 'depends_on', () => p.dependsOn ?? null);
  set('seedFrameUrl', 'seed_frame_url', () => p.seedFrameUrl ?? null);
  set('chargeRef', 'charge_ref', () => p.chargeRef ?? null);
  set('chargeCredits', 'charge_credits', () => p.chargeCredits);
  set('refunded', 'refunded', () => p.refunded);
  set('outputUrl', 'output_url', () => p.outputUrl ?? null);
  if (Object.prototype.hasOwnProperty.call(p, 'error')) {
    c.error_detail = p.error ?? null;
    c.error_code = errorCodeOf(p.error ?? null);
  }
  set('transport', 'transport', () => p.transport ?? null);
  set('model', 'model', () => p.model ?? null);
  set('outputBytes', 'output_bytes', () => p.outputBytes ?? null);
  set('outputPath', 'output_path', () => p.outputPath ?? null);
  set('deliveredAt', 'delivered_at', () => iso(p.deliveredAt));
  return c;
}

export function jobPatchToColumns(p: JobPatch): Row {
  const c: Row = {};
  const set = (k: keyof JobPatch, col: string, v: () => unknown) => {
    if (Object.prototype.hasOwnProperty.call(p, k)) c[col] = v();
  };
  set('status', 'status', () => p.status);
  set('cancelRequested', 'cancel_requested', () => p.cancelRequested);
  set('holdUntil', 'hold_until', () => iso(p.holdUntil));
  set('holdReason', 'hold_reason', () => p.holdReason ?? null);
  set('stitchAttempts', 'stitch_attempts', () => p.stitchAttempts);
  set('deadlineAt', 'deadline_at', () => iso(p.deadlineAt));
  set('errorCode', 'error_code', () => p.errorCode ?? null);
  set('outputUrl', 'output_url', () => p.outputUrl ?? null);
  set('refundsPending', 'refunds_pending', () => p.refundsPending);
  set('outputPath', 'output_path', () => p.outputPath ?? null);
  set('outputBytes', 'output_bytes', () => p.outputBytes ?? null);
  set('completedAt', 'completed_at', () => iso(p.completedAt));
  set('errorDetail', 'error_detail', () => (p.errorDetail ?? null));
  return c;
}

// ── Inserts (the create route) ───────────────────────────────────────────────────────────────────────────────

const MIN = 60_000;
/**
 * How long a job may sit `directing`. The route writes the job, then its scenes, then promotes it — seconds of
 * work. Past this the create died mid-write; claim_longform_jobs then hands the row to a tick, which fails it.
 */
export const LONGFORM_DIRECTING_GRACE_MS = 10 * MIN;
/** The render deadline from promotion (the migration's default, restated so the route sets it explicitly). */
export const LONGFORM_JOB_DEADLINE_MS = 24 * 60 * MIN;

export interface JobInsertInput {
  id: string;
  userId: string;
  /** The user's brief (validated 1…4000 chars by the route). */
  prompt: string;
  /** A validated, PRICED plan — credits are required: a job without them would render free. */
  plan: LongformPlan & { credits: NonNullable<LongformPlan['credits']> };
  bible: LongformBible;
  format: OutputFormat;
  options: LongformJobOptions;
  seed: number | null;
  now: number;
}

/** The longform_jobs row, inserted `directing` (not claimable) with the short directing deadline. */
export function jobInsertRow(input: JobInsertInput): Row {
  const { plan } = input;
  const perScene = plan.credits?.perScene;
  // ⚠️ Refuse rather than write credits_per_scene 0: every act reservation would then debit nothing.
  if (typeof perScene !== 'number' || !Number.isInteger(perScene) || perScene <= 0) {
    throw new Error('jobInsertRow: a long-form job needs a positive per-scene credit price');
  }
  return {
    id: input.id,
    user_id: input.userId,
    status: 'directing' satisfies JobStatus,
    prompt: str(input.prompt, 4000),
    seconds: plan.seconds,
    trim_to_seconds: null,
    scene_count: plan.sceneCount,
    act_count: plan.acts.length,
    tier: plan.tier,
    format: pick<OutputFormat>(input.format, FORMATS, '16:9'),
    resolution: plan.resolution,
    generate_audio: plan.generateAudio,
    bible: input.bible,
    options: coerceOptions(input.options),
    seed: input.seed,
    estimate_usd: plan.cost.totalUsd,
    credits_per_scene: perScene,
    deadline_at: iso(input.now + LONGFORM_DIRECTING_GRACE_MS),
  };
}

export interface SceneInsertInput {
  jobId: string;
  userId: string;
  scenes: readonly LongformScene[];
  /**
   * Act openers render from the previous act's LAST FRAME (depends_on = ordinal − 1). Off when the job uses
   * reference images: Veo takes references OR a first frame, so a dependency would only serialise the acts.
   */
  chainActFrames: boolean;
}

/** One `queued` longform_scenes row per director scene; spec = the whole scene (the tick renders spec.shot). */
export function sceneInsertRows(input: SceneInsertInput): Row[] {
  return input.scenes.map((scene) => ({
    job_id: input.jobId,
    user_id: input.userId,
    ordinal: scene.ordinal,
    act: scene.act,
    status: 'queued' satisfies SceneStatus,
    spec: scene,
    depends_on: input.chainActFrames && scene.continuity.seedFromPreviousActLastFrame && scene.ordinal > 0 ? scene.ordinal - 1 : null,
  }));
}

/** directing → planned (stateMachine `directed`), with the full render deadline counted from now. */
export function directedColumns(now: number): Row {
  return jobPatchToColumns({ status: 'planned', deadlineAt: now + LONGFORM_JOB_DEADLINE_MS });
}
