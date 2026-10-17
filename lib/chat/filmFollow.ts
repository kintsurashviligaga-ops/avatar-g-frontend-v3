/**
 * lib/chat/filmFollow.ts — a film keeps going when its tab closes (owner's decision 2026-10-17 12:28Z, "სერვერზე").
 *
 * A chat film is driven by the browser: its polls send each next scene, and the tab stitches the master. Closed mid-film,
 * nothing moved again, no refund came and the whole quote stayed charged. Now the film START also files a FOLLOW row
 * (generation_jobs, the lease queue of lib/orchestrator/jobLease, kind 'film-follow'), and a per-minute sweep
 * (lib/chat/filmFollowWorker, app/api/film/sweep) takes the film over once its tab has gone quiet: it polls as the owner
 * (the next scenes go out), decides like the tab would (the same salvage rules, lib/chat/filmStudioClient), stitches the
 * master through the same route with the same body, and when the film cannot be finished gives back what is still charged.
 *
 * This file is the pure part: the signed record, the takeover timings and the decision.
 *
 * ⚠️ THE RECORD IS SIGNED. generation_jobs is owner-writable (RLS), so a row's params prove nothing by themselves: a user
 * could file a follow row for a film they already received and collect its refund. The record (owner, film, poll token,
 * session, start time, stitch plan) is HMAC-signed by the server at the start and checked before every act; it lives for
 * FOLLOW_TTL_MS, inside the hour the film's status record lives (lib/chat/filmStatusStore), so a delivered master is always
 * still visible to the refund check (lib/chat/filmFollowWorker payDebt).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_FILM_MAX_POLL_MS,
  MIN_SALVAGE_CLIPS,
  canSalvagePartialCut,
  clipsSettled,
  everyClipLanded,
  readyClipUrls,
  type FilmFollowPlan,
  type FilmStudioMatrix,
} from './filmStudioClient';

export const FILM_FOLLOW_KIND = 'film-follow';
/** No poll from the film's tab for this long: the tab is gone and the server drives. A hidden tab Chrome throttles still
 *  polls about once a minute, so it keeps the film. */
export const FOLLOW_TAKEOVER_MS = 150_000;
/** The same patience as the tab (driveFilmStudio's poll deadline), counted from the start. */
export const FOLLOW_MAX_MS = DEFAULT_FILM_MAX_POLL_MS;
/** A stitch someone else started (the tab's, or an earlier attempt) is left alone this long past the deadline. */
export const FOLLOW_STITCH_WINDOW_MS = 11 * 60_000;
/** How long the signed record holds. Inside the status record's hour, so the refund check can always see a master. */
export const FOLLOW_TTL_MS = 50 * 60_000;
/** Claims of one follow row: a finalize that dies is tried again, and a busy stitch elsewhere costs an attempt. */
export const FOLLOW_MAX_ATTEMPTS = 3;

/** The row's id: one per film, so a replayed start files nothing new. */
export function followJobId(tokenId: string): string {
  return `film-follow:${tokenId}`;
}

export interface FilmFollowRecord {
  /** The owner: the user the film was charged to. */
  u: string;
  /** The film's status-tracker id (lib/chat/filmStatusStore deriveFilmTokenId). */
  t: string;
  /** The `film:` poll token. */
  p: string;
  /** The session the scenes were dispatched under (a poll under another session reads as a routing blip). */
  s: string;
  /** Start, epoch ms. */
  c: number;
  /** The brief the score is composed from (the tab sends its dispatch message). */
  m: string;
  /** The stitch choices made in the studio. */
  plan: FilmFollowPlan;
}

const DOMAIN = 'film-follow:v1';
/** The poll token rides in the record (a few KB: clip task refs and the signed narration links). Bounded either way. */
export const MAX_POLL_TOKEN = 120_000;
const MAX_SIGNED = 256_000;
const mac = (key: string, payload: string) => createHmac('sha256', key).update(`${DOMAIN}:${payload}`).digest('base64url');

/** `<payload>.<mac>`: a string, so the JSONB column cannot reorder what was signed. null without a key (fail closed). */
export function signFollow(rec: FilmFollowRecord, key: string): string | null {
  if (!key || !rec.u || !rec.t || !rec.p || !rec.s || !(rec.c > 0) || rec.p.length > MAX_POLL_TOKEN) return null;
  const payload = Buffer.from(JSON.stringify({ v: 1, ...rec })).toString('base64url');
  return `${payload}.${mac(key, payload)}`;
}

export type FollowCheck =
  | { ok: true; rec: FilmFollowRecord }
  | { ok: false; reason: 'invalid' }
  /** Authentic, but past FOLLOW_TTL_MS: nothing more is done FOR the film, but its debt can still be checked and paid. */
  | { ok: false; reason: 'expired'; rec: FilmFollowRecord };

/** Check a row's signed record: authentic, for that row's owner and id, and still inside FOLLOW_TTL_MS at `now`. */
export function verifyFollow(signed: unknown, key: string, expect: { userId: string; jobId: string; now: number }): FollowCheck {
  if (!key || typeof signed !== 'string' || signed.length > MAX_SIGNED) return { ok: false, reason: 'invalid' };
  const [payload, sig, extra] = signed.split('.');
  if (!payload || !sig || extra !== undefined) return { ok: false, reason: 'invalid' };
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(key, payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };
  let r: Partial<FilmFollowRecord> & { v?: unknown };
  try {
    r = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof r;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (r.v !== 1 || typeof r.u !== 'string' || typeof r.t !== 'string' || typeof r.p !== 'string' || typeof r.s !== 'string'
    || typeof r.c !== 'number' || typeof r.m !== 'string' || !r.plan || typeof r.plan !== 'object') return { ok: false, reason: 'invalid' };
  if (r.u !== expect.userId || followJobId(r.t) !== expect.jobId) return { ok: false, reason: 'invalid' };
  const rec: FilmFollowRecord = { u: r.u, t: r.t, p: r.p, s: r.s, c: r.c, m: r.m, plan: r.plan as FilmFollowPlan };
  if (!(expect.now < r.c + FOLLOW_TTL_MS)) return { ok: false, reason: 'expired', rec };
  return { ok: true, rec };
}

const ORIENTATIONS = ['landscape', 'vertical', 'square', 'portrait'] as const;
const TRANSITIONS = ['crossfade', 'cut', 'dissolve', 'zoom', 'slide', 'fade_black'] as const;
const JOINS = ['cut', 'crossfade', 'dissolve', 'fade_black'] as const;
const GENDERS = ['male', 'female', 'duet'] as const;
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;

/**
 * The stitch plan the dispatch sent, reduced to what the tab's own builder reads, each field checked. The soundtrack is
 * kept only as a web link: /api/video/assemble refuses anything else, and its owner check (lib/security/callerMedia) still
 * runs on it when the server stitches.
 */
export function sanitizeFollowPlan(raw: unknown): FilmFollowPlan {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mixRaw = o.audioMix && typeof o.audioMix === 'object' && !Array.isArray(o.audioMix) ? (o.audioMix as Record<string, unknown>) : null;
  const audioMix = mixRaw
    ? {
        ...(mixRaw.threeTrack === true ? { threeTrack: true } : {}),
        ...(num(mixRaw.musicVolume, 0, 1.5) !== undefined ? { musicVolume: num(mixRaw.musicVolume, 0, 1.5) } : {}),
        ...(num(mixRaw.sfxVolume, 0, 1.5) !== undefined ? { sfxVolume: num(mixRaw.sfxVolume, 0, 1.5) } : {}),
        ...(mixRaw.smartDuck === false ? { smartDuck: false } : {}),
        ...(num(mixRaw.duckDb, -40, 0) !== undefined ? { duckDb: num(mixRaw.duckDb, -40, 0) } : {}),
      }
    : null;
  const joins = Array.isArray(o.joinTransitions) ? o.joinTransitions.slice(0, 23).map((j) => pick(j, JOINS)) : [];
  const soundtrack = typeof o.soundtrackUrl === 'string' && /^https:\/\//.test(o.soundtrackUrl) && o.soundtrackUrl.length <= 4096 ? o.soundtrackUrl : undefined;
  const orientation = pick(o.orientation, ORIENTATIONS);
  const transition = pick(o.transition, TRANSITIONS);
  const vocalGender = pick(o.vocalGender, GENDERS);
  const locale = pick(o.locale, ['ka', 'en', 'ru'] as const);
  const finalDurationSec = num(o.finalDurationSec, 1, 600);
  return {
    ...(orientation ? { orientation } : {}),
    ...(transition ? { transition } : {}),
    ...(joins.length && joins.every(Boolean) ? { joinTransitions: joins as NonNullable<FilmFollowPlan['joinTransitions']> } : {}),
    ...(o.noMusic === true ? { noMusic: true } : {}),
    ...(o.musicVideoMode === true ? { musicVideoMode: true } : {}),
    ...(soundtrack ? { soundtrackUrl: soundtrack } : {}),
    ...(locale ? { locale } : {}),
    ...(vocalGender ? { vocalGender } : {}),
    ...(audioMix && Object.keys(audioMix).length ? { audioMix } : {}),
    ...(finalDurationSec !== undefined ? { finalDurationSec } : {}),
  };
}

export type FollowDecision =
  | { kind: 'wait' }
  | { kind: 'assemble' }
  | { kind: 'fail'; reason: 'scenes_failed' | 'timed_out' };

/**
 * What the tab would do with this poll, `ageMs` after the start. The same rules as driveFilmStudio: every scene in →
 * stitch; every scene settled but some failed → stitch the survivors when at least MIN_SALVAGE_CLIPS landed (a one-scene
 * film: its one clip), else the film has failed; past the deadline → the same salvage-or-fail. Two of the tab's early
 * exits are not copied, on purpose: a scene failing does not end the wait for scenes still rendering (the tab stitches
 * what it has at once), and there is no no-progress stall (DEFAULT_FILM_STALL_MS): the deadline alone ends a film that
 * stopped moving. A server that waits delivers the fuller film.
 */
export function decideFollow(matrix: FilmStudioMatrix | null, ageMs: number): FollowDecision {
  const clips = readyClipUrls(matrix).length;
  const enough = canSalvagePartialCut(matrix) || (matrix?.sceneCount === 1 && clips === 1);
  if (matrix?.readyToStitch) return enough ? { kind: 'assemble' } : { kind: 'fail', reason: 'scenes_failed' };
  if (clipsSettled(matrix) && !everyClipLanded(matrix)) return enough ? { kind: 'assemble' } : { kind: 'fail', reason: 'scenes_failed' };
  if (ageMs > FOLLOW_MAX_MS) return enough ? { kind: 'assemble' } : { kind: 'fail', reason: 'timed_out' };
  return { kind: 'wait' };
}

/** Exported for the worker's tests: the salvage floor the decision uses. */
export const FOLLOW_MIN_CLIPS = MIN_SALVAGE_CLIPS;
