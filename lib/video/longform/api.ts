/**
 * lib/video/longform/api.ts — the long-form routes' request and response shapes (pure, no I/O):
 *
 *   parseLongformCreateBody   POST /api/video/longform's body → a typed request, or every reason it is refused
 *   runDirectorWithDeadline   the Director under ONE overall deadline (the route's lambda is 300 s)
 *   longformStatusView        a job row + its scene rows → what GET /api/video/longform/[id] answers
 *
 * ⚠️ CLIENT TEXT IS CAPPED HERE AND AGAIN IN THE DIRECTOR. Brief, dialogue and negative prompt are refused above
 * their caps (not silently cut — the user would not know what was dropped); director.ts clips and strips control
 * characters on its own anyway, and nothing the client sends reaches Veo except through the Director's bible/shots.
 */
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import type { OutputFormat, VeoResolution, VeoTier } from '@/lib/veo/types';
import { runLongformDirector, type DirectorGenerate, type DirectorInput, type DirectorResult } from './director';
import { LONGFORM_SCENE_SEC } from './plan';
import { jobFromRow, sceneFromRow, type Row } from './rows';
import { isTerminalJob, type JobStatus, type SceneStatus } from './stateMachine';

// ── Create body ──────────────────────────────────────────────────────────────────────────────────────────────

export const LONGFORM_BRIEF_MAX = 4000;
export const LONGFORM_DIALOGUE_MAX = 1000;
export const LONGFORM_NEGATIVE_MAX = 800;
export const LONGFORM_MAX_REFERENCE_IMAGES = 3;
const SEED_MAX = 4_294_967_295;

const TIERS: readonly VeoTier[] = ['standard', 'fast', 'lite'];
const RESOLUTIONS: readonly VeoResolution[] = ['720p', '1080p', '4k'];
const FORMATS: readonly OutputFormat[] = ['16:9', '9:16', '1:1', '4:5'];

export interface LongformCreateInput {
  prompt: string;
  /** Raw: the grid (8…240 in 8 s steps) is plan.validateLongformRequest's to judge, with every reason at once. */
  seconds: number;
  tier: VeoTier;
  /** 4k parses (it is a Veo resolution) and is then refused by the plan's validation, with its reason. */
  resolution: VeoResolution;
  format: OutputFormat;
  generateAudio: boolean;
  language: string | null;
  mode: string | null;
  dialogue: string | null;
  negativePrompt: string | null;
  referenceImageUrls: string[];
  /** Null = the route picks one (one seed for the whole film is continuity, not determinism). */
  seed: number | null;
}

export interface LongformBodyIssue {
  code: string;
  message: string;
}

export type LongformCreateParse = { ok: true; value: LongformCreateInput } | { ok: false; reasons: LongformBodyIssue[] };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function optionalText(
  body: Record<string, unknown>,
  key: string,
  max: number,
  reasons: LongformBodyIssue[],
): string | null {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    reasons.push({ code: `invalid_${key}`, message: `${key} must be text.` });
    return null;
  }
  const t = v.trim();
  if (t.length > max) {
    reasons.push({ code: `invalid_${key}`, message: `${key} must be at most ${max} characters.` });
    return null;
  }
  return t || null;
}

function oneOf<T extends string>(
  body: Record<string, unknown>,
  key: string,
  options: readonly T[],
  fallback: T,
  reasons: LongformBodyIssue[],
): T {
  const v = body[key];
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
  reasons.push({ code: `invalid_${key}`, message: `${key} must be one of ${options.join(', ')}.` });
  return fallback;
}

/** Validate the create body's SHAPE. Every problem is reported, not just the first. Never throws. */
export function parseLongformCreateBody(raw: unknown): LongformCreateParse {
  const reasons: LongformBodyIssue[] = [];
  if (!isRecord(raw)) return { ok: false, reasons: [{ code: 'invalid_body', message: 'The request body must be a JSON object.' }] };

  const promptRaw = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (!promptRaw) reasons.push({ code: 'invalid_prompt', message: 'Describe the film (prompt).' });
  else if (promptRaw.length > LONGFORM_BRIEF_MAX) reasons.push({ code: 'invalid_prompt', message: `The brief must be at most ${LONGFORM_BRIEF_MAX} characters.` });

  const seconds = typeof raw.seconds === 'number' ? raw.seconds : typeof raw.seconds === 'string' && raw.seconds.trim() ? Number(raw.seconds) : Number.NaN;
  if (!Number.isFinite(seconds)) reasons.push({ code: 'invalid_duration', message: 'Length (seconds) must be a number.' });

  const tier = oneOf<VeoTier>(raw, 'tier', TIERS, 'fast', reasons);
  const resolution = oneOf<VeoResolution>(raw, 'resolution', RESOLUTIONS, '1080p', reasons);
  const format = oneOf<OutputFormat>(raw, 'format', FORMATS, '16:9', reasons);

  let generateAudio = true;
  if (raw.generateAudio !== undefined && raw.generateAudio !== null) {
    if (typeof raw.generateAudio === 'boolean') generateAudio = raw.generateAudio;
    else reasons.push({ code: 'invalid_generateAudio', message: 'generateAudio must be true or false.' });
  }

  let language = optionalText(raw, 'language', 20, reasons);
  if (language && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(language)) {
    reasons.push({ code: 'invalid_language', message: 'language must be a language tag such as "ka" or "en-US".' });
    language = null;
  }
  let mode = optionalText(raw, 'mode', 32, reasons);
  if (mode && !/^[a-z_]+$/.test(mode)) {
    reasons.push({ code: 'invalid_mode', message: 'mode must be a lowercase word such as "film" or "music_video".' });
    mode = null;
  }
  const dialogue = optionalText(raw, 'dialogue', LONGFORM_DIALOGUE_MAX, reasons);
  const negativePrompt = optionalText(raw, 'negativePrompt', LONGFORM_NEGATIVE_MAX, reasons);

  const referenceImageUrls: string[] = [];
  if (raw.referenceImageUrls !== undefined && raw.referenceImageUrls !== null) {
    const list = raw.referenceImageUrls;
    if (!Array.isArray(list) || list.length > LONGFORM_MAX_REFERENCE_IMAGES) {
      reasons.push({ code: 'invalid_referenceImageUrls', message: `Up to ${LONGFORM_MAX_REFERENCE_IMAGES} reference image URLs.` });
    } else {
      for (const u of list) {
        // ⚠️ https AND public: these are fetched on our behalf (Veo / the engine), so a private-range host is refused
        // here rather than probed for a caller.
        if (typeof u === 'string' && u.length <= 2048 && /^https:\/\//i.test(u.trim()) && isPublicHttpUrl(u.trim())) referenceImageUrls.push(u.trim());
        else {
          reasons.push({ code: 'invalid_referenceImageUrls', message: 'Reference images must be public https URLs.' });
          break;
        }
      }
    }
  }

  let seed: number | null = null;
  if (raw.seed !== undefined && raw.seed !== null) {
    if (typeof raw.seed === 'number' && Number.isInteger(raw.seed) && raw.seed >= 0 && raw.seed <= SEED_MAX) seed = raw.seed;
    else reasons.push({ code: 'invalid_seed', message: `seed must be a whole number from 0 to ${SEED_MAX}.` });
  }

  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    value: {
      prompt: promptRaw,
      seconds,
      tier,
      resolution,
      format,
      generateAudio,
      language,
      mode,
      dialogue,
      negativePrompt,
      referenceImageUrls,
      seed,
    },
  };
}

// ── The Director, under a deadline ───────────────────────────────────────────────────────────────────────────

/**
 * The whole storyboard — bible + one call per act + retries — must land inside this. The create route's lambda has
 * 300 s (route maxDuration + vercel.json); the other 60 s are auth, reads, validation and the inserts.
 */
export const DIRECTOR_DEADLINE_MS = 240_000;
/** A call is not started with less than this left: it could not finish, and it would still be billed. */
const MIN_CALL_MS = 5_000;

export type DirectorDeadlineResult = DirectorResult | { ok: false; error: 'director_timeout'; detail: string; calls: number };

/**
 * runLongformDirector with ONE overall deadline. Each call is capped at what is left (timeoutMs) and aborted when
 * the deadline passes (signal); no call starts after it; and the race returns at the deadline even if a provider
 * ignores the abort. A storyboard that missed the deadline is reported as `director_timeout`, whatever the
 * Director itself concluded from the calls that were cut short.
 */
export async function runDirectorWithDeadline(
  input: DirectorInput,
  generate: DirectorGenerate,
  opts: { deadlineMs?: number; now?: () => number } = {},
): Promise<DirectorDeadlineResult> {
  const now = opts.now ?? Date.now;
  const deadlineAt = now() + Math.max(0, opts.deadlineMs ?? DIRECTOR_DEADLINE_MS);
  const controller = new AbortController();
  let calls = 0;
  const guarded: DirectorGenerate = async (prompt, callOpts) => {
    const left = deadlineAt - now();
    if (controller.signal.aborted || left < MIN_CALL_MS) return null;
    calls++;
    return generate(prompt, { ...callOpts, timeoutMs: Math.min(callOpts.timeoutMs ?? left, left), signal: controller.signal });
  };
  const timedOut = (): DirectorDeadlineResult => ({
    ok: false,
    error: 'director_timeout',
    detail: `the storyboard did not finish within ${Math.round((opts.deadlineMs ?? DIRECTOR_DEADLINE_MS) / 1000)} s`,
    calls,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), Math.max(0, deadlineAt - now()));
  });
  try {
    const r = await Promise.race([runLongformDirector(input, guarded), deadline]);
    if (r === 'timeout') return timedOut();
    if (!r.ok && (controller.signal.aborted || deadlineAt - now() < MIN_CALL_MS)) return timedOut();
    return r;
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}

// ── Status view ──────────────────────────────────────────────────────────────────────────────────────────────

/** A job id as the routes accept it (the table's gen_random_uuid). Anything else is a 404, never a query. */
export const isLongformJobId = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export interface LongformSceneView {
  ordinal: number;
  act: number;
  status: SceneStatus;
  /** A freshly signed clip URL — only while the film is not done (after it, the clips are deleted). */
  url: string | null;
}

export interface LongformStatusView {
  id: string;
  status: JobStatus;
  terminal: boolean;
  seconds: number;
  sceneCount: number;
  tier: VeoTier;
  format: OutputFormat;
  title: string;
  progress: { total: number; delivered: number; failed: number; inFlight: number; queued: number };
  hold: { reason: string; until: string } | null;
  cancelRequested: boolean;
  /** A short machine code (`deadline`, `too_many_scene_failures`, …). Provider detail never leaves the server. */
  errorCode: string | null;
  film: { url: string; bytes: number | null } | null;
  credits: { perScene: number; total: number };
  scenes: LongformSceneView[];
  createdAt: string | null;
  completedAt: string | null;
}

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * Row → response. Mapped through jobFromRow/sceneFromRow (never throws on content) and then REDUCED: no ledger refs,
 * no operation names, no provider error text, no storage paths — only what the owner's UI needs. URLs are passed in
 * already signed (the route signs from the stored paths, so a link never outlives its 7-day signature).
 */
export function longformStatusView(
  jobRow: Row,
  sceneRows: readonly Row[],
  signed: { film?: string | null; clips?: ReadonlyMap<number, string> } = {},
): LongformStatusView {
  const job = jobFromRow(jobRow);
  const scenes = sceneRows.map(sceneFromRow).sort((a, b) => a.ordinal - b.ordinal);
  const count = (pred: (s: SceneStatus) => boolean) => scenes.filter((s) => pred(s.status)).length;
  const total = job.sceneCount || scenes.length;
  const done = job.status === 'done';
  const outputBytes = typeof jobRow.output_bytes === 'number' ? jobRow.output_bytes : null;
  return {
    id: job.id,
    status: job.status,
    terminal: isTerminalJob(job.status),
    seconds: total * LONGFORM_SCENE_SEC,
    sceneCount: total,
    tier: job.tier,
    format: job.format,
    title: job.bible.title,
    progress: {
      total,
      delivered: count((s) => s === 'delivered'),
      failed: count((s) => s === 'failed'),
      inFlight: count((s) => s === 'submitted' || s === 'rendering'),
      queued: count((s) => s === 'queued'),
    },
    hold: job.holdReason && job.holdUntil !== null ? { reason: job.holdReason, until: new Date(job.holdUntil).toISOString() } : null,
    cancelRequested: job.cancelRequested,
    errorCode: job.errorCode,
    film: done && signed.film ? { url: signed.film, bytes: outputBytes } : null,
    credits: { perScene: job.creditsPerScene, total: job.creditsPerScene * total },
    scenes: scenes.map((s) => ({
      ordinal: s.ordinal,
      act: s.act,
      status: s.status,
      url: !done && s.status === 'delivered' ? signed.clips?.get(s.ordinal) ?? null : null,
    })),
    createdAt: isoOrNull(jobRow.created_at),
    completedAt: isoOrNull(jobRow.completed_at),
  };
}
