/**
 * lib/video/director/storyboard.ts — the storyboard's rules (V2, V4) and the one way to lock it: freeze().
 *
 * A draft (from planStoryboard, the user, or an import) is an ordinary mutable object the user reviews and edits.
 * Approval freezes a COPY: deep Object.freeze, `__frozen: true`, `frozenAt`. From then on nothing — not the LLM, not
 * a later edit to the draft, not a retry — can change a shot, its order, its prompt or the consistency lock; an edit
 * produces a new draft (draftFromFrozen) that must be approved and frozen again.
 *
 * validateStoryboard refuses, before any money is spent, what Veo would otherwise refuse (or, worse, what the engine
 * would silently "fix" — snap 5 s to 6 s, render 1:1 as 16:9, drop a reference image): a shot that cannot render
 * exactly as written must be fixed by the user at review time, not adapted by the system (V6).
 *
 * Pure and dependency-free: the studio UI can validate a draft as the user types.
 */
import type { ConsistencyLock, FrozenStoryboard, Shot, Storyboard } from './types';

/** Veo's clip lengths (lib/veo/types VeoDuration). */
export const VEO_SHOT_DURATIONS: readonly number[] = [4, 6, 8];
/** The only frames Veo renders (lib/veo/types VeoAspect). 1:1 / 4:5 would be a crop in post, not what was approved. */
export const VEO_ASPECT_RATIOS: readonly string[] = ['16:9', '9:16'];
/** Veo tiers (lib/veo/types VeoTier) — the repo's VideoQuality. */
export const VEO_QUALITIES: readonly string[] = ['standard', 'fast', 'lite'];
/** Google: asset reference images require an 8 s clip and are not accepted by Lite. */
export const VEO_REFERENCE_DURATION = 8;

const UINT32_MAX = 0xffff_ffff;
const CREATED_BY: readonly Storyboard['createdBy'][] = ['user', 'agent_planner', 'imported'];

export class StoryboardValidationError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[], prefix = 'storyboard is invalid') {
    super(`${prefix}: ${problems.join('; ')}`);
    this.name = 'StoryboardValidationError';
    this.problems = problems;
  }
}

export class StoryboardNotFrozenError extends Error {
  constructor(message = 'only a frozen (user-approved) storyboard can be executed — call freeze() first') {
    super(message);
    this.name = 'StoryboardNotFrozenError';
  }
}

export type StoryboardValidation = { ok: true } | { ok: false; problems: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNonBlank = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isUint32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= UINT32_MAX;

/**
 * What the Veo engine can read as a reference image without a guess: a public https URL (fetched with the SSRF guard)
 * or an inline base64 image. gs:// is left out — the Gemini API transport cannot read it.
 */
export function isSupportedReferenceImage(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  return /^https:\/\/\S+$/i.test(v) || /^data:image\/[a-z0-9.+-]+;base64,\S+$/i.test(v);
}

/** Short, never the whole value (prompts are long; a reference may be a signed URL or base64). */
function shown(v: unknown): string {
  const s = typeof v === 'string' ? JSON.stringify(v) : String(v);
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
}

function lockProblems(lock: unknown): string[] {
  if (!isRecord(lock)) return ['consistencyLock is missing'];
  const problems: string[] = [];
  if (lock.enforceAcrossShots !== true) problems.push('consistencyLock.enforceAcrossShots must be true');
  if (typeof lock.aspectRatio !== 'string' || !VEO_ASPECT_RATIOS.includes(lock.aspectRatio)) {
    problems.push(`consistencyLock.aspectRatio must be one of ${VEO_ASPECT_RATIOS.join(', ')} (got ${shown(lock.aspectRatio)})`);
  }
  if (lock.seed !== undefined && !isUint32(lock.seed)) {
    problems.push(`consistencyLock.seed must be a whole number from 0 to ${UINT32_MAX} (got ${shown(lock.seed)})`);
  }
  if (lock.characterReference !== undefined && !isSupportedReferenceImage(lock.characterReference)) {
    problems.push('consistencyLock.characterReference must be an https:// URL or a base64 data:image URL');
  }
  if (lock.styleReference !== undefined && typeof lock.styleReference !== 'string') {
    problems.push('consistencyLock.styleReference must be a string');
  }
  return problems;
}

function shotProblems(shot: unknown, i: number, lock: Partial<ConsistencyLock>): string[] {
  if (!isRecord(shot)) return [`shots[${i}] is not a shot`];
  const at = isNonBlank(shot.id) ? `shot "${shot.id}"` : `shots[${i}]`;
  const problems: string[] = [];
  if (!isNonBlank(shot.id)) problems.push(`${at}: id is required`);
  if (typeof shot.order !== 'number' || !Number.isInteger(shot.order) || shot.order < 0) {
    problems.push(`${at}: order must be a non-negative whole number (got ${shown(shot.order)})`);
  }
  if (typeof shot.description !== 'string') problems.push(`${at}: description must be a string`);
  // Checked, never repaired: the prompt is sent exactly as written (V3).
  if (!isNonBlank(shot.prompt)) problems.push(`${at}: prompt must not be empty`);
  if (shot.negativePrompt !== undefined && !isNonBlank(shot.negativePrompt)) {
    problems.push(`${at}: negativePrompt must be omitted or contain text`);
  }
  if (typeof shot.durationSeconds !== 'number' || !VEO_SHOT_DURATIONS.includes(shot.durationSeconds)) {
    problems.push(`${at}: durationSeconds must be ${VEO_SHOT_DURATIONS.join(', ')} (got ${shown(shot.durationSeconds)})`);
  }
  if (typeof shot.aspectRatio !== 'string' || !VEO_ASPECT_RATIOS.includes(shot.aspectRatio)) {
    problems.push(`${at}: aspectRatio must be ${VEO_ASPECT_RATIOS.join(' or ')} (got ${shown(shot.aspectRatio)})`);
  } else if (shot.aspectRatio !== lock.aspectRatio) {
    problems.push(`${at}: aspectRatio ${shot.aspectRatio} differs from the locked ${shown(lock.aspectRatio)} (one aspect ratio per storyboard)`);
  }
  if (typeof shot.quality !== 'string' || !VEO_QUALITIES.includes(shot.quality)) {
    problems.push(`${at}: quality must be ${VEO_QUALITIES.join(', ')} (got ${shown(shot.quality)})`);
  }
  if (shot.seed !== undefined && !isUint32(shot.seed)) {
    problems.push(`${at}: seed must be a whole number from 0 to ${UINT32_MAX} (got ${shown(shot.seed)})`);
  }
  if (shot.referenceImage !== undefined && !isSupportedReferenceImage(shot.referenceImage)) {
    problems.push(`${at}: referenceImage must be an https:// URL or a base64 data:image URL`);
  }
  // The reference that will actually be sent (the shot's own wins over the lock's, V4) must be one Veo accepts as is.
  const reference = shot.referenceImage ?? lock.characterReference;
  if (reference !== undefined) {
    if (shot.durationSeconds !== VEO_REFERENCE_DURATION) {
      problems.push(`${at}: Veo renders a reference image only in an ${VEO_REFERENCE_DURATION} s clip (got ${shown(shot.durationSeconds)} s)`);
    }
    if (shot.quality === 'lite') problems.push(`${at}: the lite tier does not accept reference images`);
  }
  if (shot.cameraMotion !== undefined && typeof shot.cameraMotion !== 'string') problems.push(`${at}: cameraMotion must be a string`);
  if (shot.notes !== undefined && typeof shot.notes !== 'string') problems.push(`${at}: notes must be a string`);
  return problems;
}

/**
 * Every rule a storyboard must meet before it can be frozen (approval is checked by freeze, not here, so a draft can
 * be validated while the user edits it). Never throws; reports every problem, not just the first.
 */
export function validateStoryboard(storyboard: unknown): StoryboardValidation {
  if (!isRecord(storyboard)) return { ok: false, problems: ['not a storyboard'] };
  const problems: string[] = [];
  if (!isNonBlank(storyboard.id)) problems.push('id is required');
  if (typeof storyboard.title !== 'string') problems.push('title must be a string');
  if (!isNonBlank(storyboard.createdAt)) problems.push('createdAt is required');
  if (!CREATED_BY.includes(storyboard.createdBy as Storyboard['createdBy'])) {
    problems.push(`createdBy must be ${CREATED_BY.join(', ')}`);
  }
  if (typeof storyboard.approvedByUser !== 'boolean') problems.push('approvedByUser must be a boolean');

  problems.push(...lockProblems(storyboard.consistencyLock));
  const lock: Partial<ConsistencyLock> = isRecord(storyboard.consistencyLock) ? storyboard.consistencyLock : {};

  const shots = storyboard.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    problems.push('a storyboard needs at least one shot');
    return { ok: false, problems };
  }
  shots.forEach((shot, i) => problems.push(...shotProblems(shot, i, lock)));

  const ids = shots.map((s: unknown) => (isRecord(s) ? s.id : undefined));
  const dupIds = ids.filter((id, i) => typeof id === 'string' && ids.indexOf(id) !== i);
  if (dupIds.length > 0) problems.push(`shot ids must be unique (repeated: ${[...new Set(dupIds)].map(shown).join(', ')})`);

  const orders = shots.map((s: unknown) => (isRecord(s) ? s.order : undefined)).filter((o): o is number => Number.isInteger(o));
  if (orders.length === shots.length) {
    const sorted = [...orders].sort((a, b) => a - b);
    if (new Set(sorted).size !== sorted.length) {
      problems.push('shot orders must be unique');
    } else if (sorted.some((o, i) => i > 0 && o !== (sorted[i - 1] as number) + 1)) {
      problems.push(`shot orders must be contiguous (got ${sorted.join(', ')})`);
    }
  }

  const total = shots.reduce((sum: number, s: unknown) => sum + (isRecord(s) && typeof s.durationSeconds === 'number' ? s.durationSeconds : 0), 0);
  if (storyboard.totalDurationSeconds !== total) {
    problems.push(`totalDurationSeconds must equal the sum of the shots (${total}, got ${shown(storyboard.totalDurationSeconds)})`);
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

// ── Copy / freeze ────────────────────────────────────────────────────────────────────────────────────────────────

function copyShot(s: Shot): Shot {
  return {
    id: s.id,
    order: s.order,
    description: s.description,
    prompt: s.prompt,
    ...(s.negativePrompt !== undefined ? { negativePrompt: s.negativePrompt } : {}),
    ...(s.referenceImage !== undefined ? { referenceImage: s.referenceImage } : {}),
    ...(s.seed !== undefined ? { seed: s.seed } : {}),
    durationSeconds: s.durationSeconds,
    aspectRatio: s.aspectRatio,
    quality: s.quality,
    ...(s.cameraMotion !== undefined ? { cameraMotion: s.cameraMotion } : {}),
    ...(s.notes !== undefined ? { notes: s.notes } : {}),
  };
}

function copyLock(l: ConsistencyLock): ConsistencyLock {
  return {
    ...(l.seed !== undefined ? { seed: l.seed } : {}),
    ...(l.characterReference !== undefined ? { characterReference: l.characterReference } : {}),
    ...(l.styleReference !== undefined ? { styleReference: l.styleReference } : {}),
    aspectRatio: l.aspectRatio,
    enforceAcrossShots: l.enforceAcrossShots,
  };
}

/**
 * A fresh, plain, mutable copy carrying only the contract's fields — so a stray `__frozen` / `frozenAt` (or anything
 * else a planner or importer attached) never travels into a draft, and a frozen original is never aliased.
 */
export function copyStoryboard(s: Storyboard): Storyboard {
  return {
    id: s.id,
    title: s.title,
    totalDurationSeconds: s.totalDurationSeconds,
    shots: s.shots.map(copyShot),
    consistencyLock: copyLock(s.consistencyLock),
    createdAt: s.createdAt,
    createdBy: s.createdBy,
    approvedByUser: s.approvedByUser,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/**
 * Lock an approved storyboard (V2). Returns a deep-frozen COPY with `__frozen: true` and `frozenAt`; the caller's draft
 * is left as it was and can no longer reach the frozen one. Throws StoryboardValidationError when the storyboard is
 * not approved by the user or breaks a rule — nothing invalid is ever frozen.
 */
export function freeze(storyboard: Storyboard, clock: () => Date = () => new Date()): FrozenStoryboard {
  const problems: string[] = [];
  if (!isRecord(storyboard) || storyboard.approvedByUser !== true) problems.push('the user has not approved this storyboard');
  const validation = validateStoryboard(storyboard);
  if (!validation.ok) problems.push(...validation.problems);
  if (problems.length > 0) throw new StoryboardValidationError(problems, 'cannot freeze the storyboard');

  const frozen: FrozenStoryboard = { ...copyStoryboard(storyboard), __frozen: true, frozenAt: clock().toISOString() };
  return deepFreeze(frozen);
}

/** True only for what freeze() produced: the brand AND an actually frozen object graph (a forged `__frozen` fails). */
export function isFrozen(value: unknown): value is FrozenStoryboard {
  if (!isRecord(value)) return false;
  const v = value as Partial<FrozenStoryboard>;
  return (
    v.__frozen === true &&
    typeof v.frozenAt === 'string' &&
    v.approvedByUser === true &&
    Object.isFrozen(value) &&
    Array.isArray(v.shots) &&
    Object.isFrozen(v.shots) &&
    v.shots.every((s) => Object.isFrozen(s)) &&
    isRecord(v.consistencyLock) &&
    Object.isFrozen(v.consistencyLock)
  );
}

/**
 * A frozen storyboard read back from OUR OWN storage (a run row the server wrote from freeze()'s output). JSON loses
 * the object freeze, so the brand, the approval and every rule are checked again and the graph is frozen anew with its
 * original frozenAt. Never call this on a client's body: the client sends drafts, and only freeze() approves them.
 */
export function restoreFrozen(stored: unknown): FrozenStoryboard {
  const problems: string[] = [];
  if (!isRecord(stored)) throw new StoryboardValidationError(['not a stored storyboard'], 'cannot restore the frozen storyboard');
  if (stored.__frozen !== true || typeof stored.frozenAt !== 'string' || !stored.frozenAt) problems.push('it was never frozen');
  if (stored.approvedByUser !== true) problems.push('the user has not approved this storyboard');
  const validation = validateStoryboard(stored);
  if (!validation.ok) problems.push(...validation.problems);
  if (problems.length > 0) throw new StoryboardValidationError(problems, 'cannot restore the frozen storyboard');
  const frozen: FrozenStoryboard = { ...copyStoryboard(stored as unknown as Storyboard), __frozen: true, frozenAt: stored.frozenAt as string };
  return deepFreeze(frozen);
}

/**
 * The "edit" decision (V2): a frozen storyboard is never changed, so an edit starts from a new, unapproved draft copy.
 * The user edits it, approves it, and freezes it again — which is a new FrozenStoryboard with its own frozenAt.
 */
export function draftFromFrozen(frozen: FrozenStoryboard): Storyboard {
  return { ...copyStoryboard(frozen), approvedByUser: false };
}

/** The shots in the director's order (V2). A sorted COPY of the array; the shot objects are the frozen ones. */
export function shotsInOrder(storyboard: Storyboard): Shot[] {
  return [...storyboard.shots].sort((a, b) => a.order - b.order);
}
