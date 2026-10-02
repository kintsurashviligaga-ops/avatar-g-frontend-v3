/**
 * lib/genjutsu/contract.ts — the REQUEST CONTRACT of the VFX module: one wire shape for POST /api/genjutsu/quote and
 * POST /api/genjutsu/generate, validated by one function the routes and the tests share. Pure and client-safe.
 *
 *   { op, preset?, prompt?, aspect?, quality?, keepSound?,
 *     video?: { path, durationSec, sizeBytes },            ← motion / swap only; a storage PATH, never a URL
 *     references: [{ ref, role }],                          ← up to 40; a storage PATH each
 *     referencesTotal?, expectedCredits?, confirmedGel? }
 *
 * ⚠️ ONLY OUR OWN STORAGE PATHS CROSS THIS WIRE. The browser uploads straight to the `uploads` bucket (components/studio/
 * ui/useUpload) and names the object by its path; the route swaps a path under the CALLER's own `omni-uploads/<uid>/`
 * prefix for a signed URL (lib/studio/media's owner rule) and refuses everything else. A URL here would make the server
 * fetch (or hand a provider) a host the user chose — so a scheme in `video.path` or `references[].ref` is a validation
 * error, not something to be "handled". No SSRF surface is added.
 *
 * ⚠️ THE CLAIMED VIDEO LENGTH IS CHECKED HERE ONLY FOR SHAPE AND RANGE. The browser measured it (an HTMLVideoElement);
 * a forged request can claim anything, and a price that scales with seconds must not trust it — the route measures the
 * stored file itself (lib/genjutsu/mp4Duration) and uses THAT. This function's job is the early, cheap refusal.
 */
import { UPLOAD_PREFIX } from '@/lib/studio/media';
import { ENGINES, qualityFor } from './engines';
import {
  MAX_REFERENCES, SOURCE_VIDEO_MAX_BYTES, SOURCE_VIDEO_MAX_SEC, SOURCE_VIDEO_MIN_SEC, USER_PROMPT_MAX_CHARS,
} from './limits';
import { cleanUserText, getPreset } from './presets';
import {
  isGenjutsuOp, isReferenceRole, type GenjutsuAspect, type GenjutsuOp, type GenjutsuQuality, type ReferenceRole,
} from './types';

/** Stable, machine-readable reasons. The UI maps each to ka / en / ru copy (components/studio/genjutsu/copy). */
export type IssueCode =
  | 'invalid_body'
  | 'unknown_field'
  | 'bad_op'
  | 'unknown_preset'
  | 'bad_prompt'
  | 'preset_or_prompt'
  | 'bad_aspect'
  | 'bad_quality'
  | 'video_required'
  | 'video_not_allowed'
  | 'bad_video'
  | 'video_duration'
  | 'video_size'
  | 'too_many_references'
  | 'bad_reference'
  | 'reference_required'
  | 'character_required'
  | 'bad_expected_credits'
  | 'bad_confirmed_gel';

export interface Issue {
  path: string;
  code: IssueCode;
}

export interface GenjutsuVideoRef {
  /** A storage path under the caller's own upload prefix. */
  path: string;
  /** As the BROWSER measured it. The route re-measures the stored file and trusts only its own number. */
  durationSec: number;
  sizeBytes: number;
}

export interface GenjutsuReference {
  /** A storage path under the caller's own upload prefix. */
  ref: string;
  role: ReferenceRole;
}

export interface GenjutsuRequest {
  op: GenjutsuOp;
  preset: string | null;
  /** The user's optional line, cleaned (one paragraph, ≤ 500 chars). Still in the user's language. */
  prompt: string;
  aspect: GenjutsuAspect;
  /** Resolved against what the op offers — a quality the engine lacks is refused, never quietly swapped. */
  quality: GenjutsuQuality;
  keepSound: boolean;
  video: GenjutsuVideoRef | null;
  /** In the user's order — the selection rule picks from this. */
  references: GenjutsuReference[];
  /** How many photos the user has picked in all (≥ references.length); shown back as "Using N of M". */
  referencesTotal: number;
  /** The price the browser showed. A mismatch with the server's own number is refused BEFORE any charge. */
  expectedCredits: number | null;
  /** Provider-quoted ops: the GEL price the user confirmed (the studio saga refuses a stale one). */
  confirmedGel: number | null;
}

export type ParseResult = { ok: true; value: GenjutsuRequest } | { ok: false; issues: Issue[] };

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'op', 'preset', 'prompt', 'aspect', 'quality', 'keepSound', 'video', 'references', 'referencesTotal', 'expectedCredits', 'confirmedGel',
]);

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A bare path inside our own bucket: no scheme, no traversal, a tame character set, bounded length. */
export function isStoragePath(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s || s.length > 512 || s !== v) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false; // https:, data:, file:, gs: … — never a path
  if (s.startsWith('/') || s.includes('..') || s.includes('//')) return false;
  return /^[A-Za-z0-9_\-./]+$/.test(s);
}

/** True when `path` sits under THIS user's own upload prefix (lib/studio/media's rule: unguessable ≠ authorised). */
export function ownsUploadPath(path: string, userId: string): boolean {
  return !!userId && path.startsWith(`${UPLOAD_PREFIX}/${userId}/`);
}

export function parseGenjutsuRequest(raw: unknown): ParseResult {
  if (!isObject(raw)) return { ok: false, issues: [{ path: '(root)', code: 'invalid_body' }] };
  const issues: Issue[] = [];
  const bad = (path: string, code: IssueCode) => { issues.push({ path, code }); };

  for (const k of Object.keys(raw)) if (!ALLOWED_KEYS.has(k)) bad(k, 'unknown_field');

  const op = raw.op;
  if (!isGenjutsuOp(op)) {
    bad('op', 'bad_op');
    return { ok: false, issues };
  }
  const engine = ENGINES[op];

  // preset / prompt — at least one; the preset must be one we ship.
  let preset: string | null = null;
  if (raw.preset !== undefined && raw.preset !== null) {
    if (typeof raw.preset !== 'string' || !getPreset(raw.preset)) bad('preset', 'unknown_preset');
    else preset = raw.preset;
  }
  let prompt = '';
  if (raw.prompt !== undefined && raw.prompt !== null) {
    // Bounded before cleaning: a megabyte "prompt" is refused, not scanned.
    if (typeof raw.prompt !== 'string' || raw.prompt.length > USER_PROMPT_MAX_CHARS * 4) bad('prompt', 'bad_prompt');
    else prompt = cleanUserText(raw.prompt);
  }
  if (!preset && !prompt) bad('preset', 'preset_or_prompt');

  // aspect (scene only — motion / swap follow the source video, so a stray value is tolerated and ignored).
  let aspect: GenjutsuAspect = '16:9';
  if (raw.aspect !== undefined && raw.aspect !== null) {
    if (raw.aspect === '16:9' || raw.aspect === '9:16') aspect = raw.aspect;
    else bad('aspect', 'bad_aspect');
  }

  // quality — one the op offers, or refused.
  let quality: GenjutsuQuality = engine.defaultQuality;
  if (raw.quality !== undefined && raw.quality !== null) {
    if ((raw.quality === 'fast' || raw.quality === 'standard' || raw.quality === 'pro') && engine.qualities.includes(raw.quality)) {
      quality = qualityFor(op, raw.quality);
    } else bad('quality', 'bad_quality');
  }

  let keepSound = true;
  if (raw.keepSound !== undefined && raw.keepSound !== null) {
    if (typeof raw.keepSound === 'boolean') keepSound = raw.keepSound;
    else bad('keepSound', 'invalid_body');
  }

  // video — required for motion / swap, forbidden for scene.
  let video: GenjutsuVideoRef | null = null;
  if (raw.video !== undefined && raw.video !== null) {
    if (!engine.needsVideo) bad('video', 'video_not_allowed');
    else if (!isObject(raw.video) || !isStoragePath(raw.video.path)) bad('video.path', 'bad_video');
    else {
      const d = raw.video.durationSec;
      const s = raw.video.sizeBytes;
      if (typeof d !== 'number' || !Number.isFinite(d)) bad('video.durationSec', 'bad_video');
      else if (d < SOURCE_VIDEO_MIN_SEC || d > SOURCE_VIDEO_MAX_SEC) bad('video.durationSec', 'video_duration');
      if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) bad('video.sizeBytes', 'bad_video');
      else if (s > SOURCE_VIDEO_MAX_BYTES) bad('video.sizeBytes', 'video_size');
      if (typeof d === 'number' && typeof s === 'number' && Number.isFinite(d) && Number.isFinite(s)
        && d >= SOURCE_VIDEO_MIN_SEC && d <= SOURCE_VIDEO_MAX_SEC && s > 0 && s <= SOURCE_VIDEO_MAX_BYTES) {
        video = { path: raw.video.path as string, durationSec: d, sizeBytes: Math.round(s) };
      }
    }
  } else if (engine.needsVideo) {
    bad('video', 'video_required');
  }

  // references — up to 40, each a storage path with a role.
  const references: GenjutsuReference[] = [];
  if (raw.references !== undefined && raw.references !== null) {
    if (!Array.isArray(raw.references)) bad('references', 'bad_reference');
    else if (raw.references.length > MAX_REFERENCES) bad('references', 'too_many_references');
    else {
      raw.references.forEach((r, i) => {
        if (!isObject(r) || !isStoragePath(r.ref) || !isReferenceRole(r.role)) bad(`references.${i}`, 'bad_reference');
        else references.push({ ref: r.ref, role: r.role });
      });
    }
  }
  if (op !== 'scene' && references.length === 0) bad('references', 'reference_required');
  if (engine.requiresRole && references.length > 0 && !references.some((r) => r.role === engine.requiresRole)) {
    bad('references', 'character_required');
  }

  let referencesTotal = references.length;
  if (raw.referencesTotal !== undefined && raw.referencesTotal !== null) {
    const t = raw.referencesTotal;
    if (typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= MAX_REFERENCES) referencesTotal = Math.max(t, references.length);
    else bad('referencesTotal', 'invalid_body');
  }

  let expectedCredits: number | null = null;
  if (raw.expectedCredits !== undefined && raw.expectedCredits !== null) {
    const c = raw.expectedCredits;
    if (typeof c === 'number' && Number.isInteger(c) && c > 0 && c < 100_000) expectedCredits = c;
    else bad('expectedCredits', 'bad_expected_credits');
  }
  let confirmedGel: number | null = null;
  if (raw.confirmedGel !== undefined && raw.confirmedGel !== null) {
    const g = raw.confirmedGel;
    if (typeof g === 'number' && Number.isFinite(g) && g > 0 && g < 100_000) confirmedGel = g;
    else bad('confirmedGel', 'bad_confirmed_gel');
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: { op, preset, prompt, aspect, quality, keepSound, video, references, referencesTotal, expectedCredits, confirmedGel },
  };
}
