/**
 * lib/agent/media/montageManifest.ts — the files an Agent G montage was asked to use, fixed once, at quote time.
 *
 * THE INVARIANT (owner, 2026-10-11): "If 3 videos are required, an output made from only 1 or 2 is not a completed
 * task." So the quote writes down exactly what the user sent — every file, in their order, what it is (video or the
 * music) and how long it is — and every later step checks against THAT list, never against whatever plan reached it:
 *
 *   quote   builds the manifest from the resolved, probed inputs; files = manifest = videos and photos + exactly one
 *           audio (a photo is a still shot: owner 2026-10-11 11:37Z, a product photo among the clips). The
 *           manifest rides INSIDE the quoted request (each shot names the manifest file it is cut from, `source`), so
 *           the token's fingerprint binds it: a run cannot add, drop or swap a file without failing the signature.
 *   run     re-reads the request + manifest (parseAgentRequest), checks every video has a shot, verifies the token over
 *           both, and stores both in params._job.
 *   worker  re-reads them from the row before rendering (same checks: present, count unchanged, every video shot),
 *           then after the render QCs that every video's frames are really in the output (./montageAsk qcClips).
 *
 * Pure (no I/O): every rule here is unit-tested.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import { MAX_SHOTS, validateMontageRequest, type MontageRequest, type MontageShot } from '@/lib/services/montage/montagePlan';

/**
 * One file the user sent, in the order sent. `index` is its 0-based position; `path` the file reference sent. A photo
 * (`image`) has no length of its own: its `durationSec` is 0 and its one shot sets how long it shows.
 */
export type MontageManifestItem = { index: number; path: string; name: string; kind: 'video' | 'audio' | 'image'; durationSec: number };

/** A shot of an Agent G montage: the lane's shot, plus the manifest file (`source`, its index) it is cut from. */
export interface AgentMontageShot extends MontageShot {
  source: number;
}

/** The montage request Agent G quotes and runs: the lane's request, every shot naming its file, and the manifest. */
export interface AgentMontageRequest extends MontageRequest {
  shots: AgentMontageShot[];
  manifest: MontageManifestItem[];
}

/** One track plus at most MAX_SHOTS clips: a clip is used at least once, so more could never all appear. */
export const MAX_MANIFEST_FILES = MAX_SHOTS + 1;
/** A file name longer than this is cut (a name is shown on the card, never used as a path). */
export const MAX_NAME_CHARS = 200;
const MAX_PATH_CHARS = 2048;
/** No real clip or track is longer than a day; past it the number is garbage. */
const MAX_DURATION_SEC = 86_400;

// Control characters (C0, DEL, C1) and the bidi overrides that could make a name read as another.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/gu; // eslint-disable-line no-control-regex

const r3 = (n: number) => Number(n.toFixed(3));

/** The last segment of a file reference, without a query: the name a file has when the client sent none. */
export function baseName(path: string): string {
  const noQuery = path.split(/[?#]/)[0] ?? '';
  const last = noQuery.split('/').filter(Boolean).pop() ?? '';
  let decoded = last;
  try { decoded = decodeURIComponent(last); } catch { /* keep it raw */ }
  return decoded.replace(UNSAFE, '').trim().slice(0, MAX_NAME_CHARS);
}

/** A display name from untrusted input: control and bidi characters removed, trimmed, capped; else the path's base name. */
export function cleanName(raw: unknown, path: string): string {
  const s = typeof raw === 'string' ? raw.replace(UNSAFE, '').trim().slice(0, MAX_NAME_CHARS).trim() : '';
  return s || baseName(path) || 'file';
}

/**
 * The client's optional `names`, parallel to `files`. Absent = none (each name falls back to the path's base name).
 * Present, it must be an array of strings exactly as long as `files`: a list that does not line up would put one
 * file's name on another, so it is refused rather than guessed.
 */
export function parseNames(raw: unknown, count: number): { ok: true; names: string[] | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, names: null };
  if (!Array.isArray(raw)) return { ok: false, error: 'names must be an array of strings' };
  if (raw.length !== count) return { ok: false, error: `names has ${raw.length} entries for ${count} files` };
  if (raw.some((n) => typeof n !== 'string' || n.length > 4 * MAX_NAME_CHARS)) return { ok: false, error: 'names must be short strings' };
  return { ok: true, names: raw as string[] };
}

/**
 * The manifest of a quote: every file sent, in the order sent. `track` is the index of the one audio file, `stills` the
 * photos; every other file is a video (the caller sorted them, ./montageAsk sortInputs, so `probes` are all readable).
 */
export function buildManifest(
  files: readonly string[],
  names: readonly string[] | null,
  probes: ReadonlyArray<Pick<BannerProbe, 'durationSec'>>,
  track: number,
  stills: readonly number[] = [],
): MontageManifestItem[] {
  return files.map((path, index) => {
    const kind: MontageManifestItem['kind'] = index === track ? 'audio' : stills.includes(index) ? 'image' : 'video';
    return {
      index,
      path: path.trim(),
      name: cleanName(names?.[index], path.trim()),
      kind,
      durationSec: kind === 'image' ? 0 : r3(probes[index]?.durationSec ?? 0),
    };
  });
}

export type ManifestCheck =
  /** `videos` and `stills` (photos): manifest indices; together they are every picture of the edit. */
  | { ok: true; manifest: MontageManifestItem[]; videos: number[]; stills: number[]; audio: number }
  | { ok: false; error: string };

/**
 * A manifest from untrusted input (a run body, a stored row), checked and copied: 2…MAX_MANIFEST_FILES items, each at
 * its own index, with a path, a clean name, a kind and a length (0 for a photo, positive otherwise); exactly one audio,
 * at least one video, every other item a video or a photo. Nothing is repaired: a manifest that is not exactly what a
 * quote writes is refused.
 */
export function checkManifest(raw: unknown): ManifestCheck {
  if (!Array.isArray(raw)) return { ok: false, error: 'the manifest is missing' };
  if (raw.length < 2) return { ok: false, error: `the manifest lists ${raw.length} file(s); a montage needs a clip and the music` };
  if (raw.length > MAX_MANIFEST_FILES) return { ok: false, error: `the manifest lists ${raw.length} files; at most ${MAX_MANIFEST_FILES}` };
  const manifest: MontageManifestItem[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const it = raw[i] as Record<string, unknown> | null;
    if (!it || typeof it !== 'object' || Array.isArray(it)) return { ok: false, error: `manifest item ${i + 1} is not an object` };
    if (it.index !== i) return { ok: false, error: `manifest item ${i + 1} is out of order` };
    const path = typeof it.path === 'string' ? it.path : '';
    if (!path.trim() || path !== path.trim() || path.length > MAX_PATH_CHARS) return { ok: false, error: `manifest item ${i + 1} has no file reference` };
    const name = typeof it.name === 'string' ? it.name : '';
    if (!name || name.length > MAX_NAME_CHARS || name !== cleanName(name, path)) return { ok: false, error: `manifest item ${i + 1} has no clean name` };
    if (it.kind !== 'video' && it.kind !== 'audio' && it.kind !== 'image') return { ok: false, error: `manifest item ${i + 1} is neither video, photo nor audio` };
    const d = it.durationSec;
    if (it.kind === 'image') {
      if (d !== 0) return { ok: false, error: `manifest item ${i + 1} is a photo with a length` };
    } else if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0 || d > MAX_DURATION_SEC) {
      return { ok: false, error: `manifest item ${i + 1} has no length` };
    }
    manifest.push({ index: i, path, name, kind: it.kind, durationSec: r3(d as number) });
  }
  const videos = manifest.filter((m) => m.kind === 'video').map((m) => m.index);
  const stills = manifest.filter((m) => m.kind === 'image').map((m) => m.index);
  const audios = manifest.filter((m) => m.kind === 'audio').map((m) => m.index);
  if (audios.length !== 1) return { ok: false, error: `the manifest lists ${audios.length} music tracks; exactly one is required` };
  if (!videos.length || videos.length + stills.length + 1 !== manifest.length) return { ok: false, error: 'the manifest must list the clips and exactly one track' };
  return { ok: true, manifest, videos, stills, audio: audios[0]! };
}

export type Coverage = { ok: true } | { ok: false; error: string; missing: number[] };

/**
 * Does every picture (video or photo) in the manifest have a shot, and every shot come from a picture in it, of its own
 * kind (a photo's shot is an image shot, a video's a video shot)? The set of shot sources must equal the set of the
 * manifest's picture indices; `missing` names the pictures with no shot (0-based manifest indices).
 */
export function checkCoverage(shots: ReadonlyArray<{ source?: unknown; kind?: unknown }>, manifest: readonly MontageManifestItem[]): Coverage {
  for (let i = 0; i < shots.length; i += 1) {
    const s = shots[i]?.source;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s >= manifest.length) {
      return { ok: false, error: `shot ${i + 1} does not name a file of the manifest`, missing: [] };
    }
    const kind = manifest[s]!.kind;
    if (kind === 'audio') return { ok: false, error: `shot ${i + 1} is cut from file ${s + 1}, which is not a video`, missing: [] };
    if ((shots[i]?.kind === 'image') !== (kind === 'image')) {
      return { ok: false, error: `shot ${i + 1} does not show file ${s + 1} as the ${kind === 'image' ? 'photo' : 'video'} it is`, missing: [] };
    }
  }
  const used = new Set(shots.map((s) => s.source as number));
  const missing = manifest.filter((m) => m.kind !== 'audio' && !used.has(m.index)).map((m) => m.index);
  if (missing.length) {
    return { ok: false, error: `file ${missing.map((m) => m + 1).join(', ')} of ${manifest.length} has no shot`, missing };
  }
  return { ok: true };
}

export type AgentRequestCheck =
  | { ok: true; request: AgentMontageRequest; manifest: MontageManifestItem[] }
  | { ok: false; code: 'invalid_request' | 'manifest_invalid'; error: string; missing?: number[] };

/**
 * An Agent G montage request from untrusted input (the run body, the stored row), normalized the way the quote
 * normalized it, so the fingerprint of a request that came back unchanged is the quote's: the lane's own validation
 * (lib/services/montage/montagePlan), then the manifest, then every shot's `source`, then coverage. The result is the
 * one object the run signs, stores and renders.
 */
export function parseAgentRequest(raw: unknown): AgentRequestCheck {
  const valid = validateMontageRequest(raw);
  if (!valid.ok || !valid.request) return { ok: false, code: 'invalid_request', error: valid.error ?? 'the edit is not valid' };
  const body = raw as { shots: Array<Record<string, unknown> | null>; manifest?: unknown };
  const m = checkManifest(body.manifest);
  if (!m.ok) return { ok: false, code: 'manifest_invalid', error: m.error };
  // validateMontageRequest keeps the shots in order, one for one, so the raw shot i is the validated shot i.
  const shots: AgentMontageShot[] = valid.request.shots.map((s, i) => ({ ...s, source: body.shots[i]?.source as number }));
  const cover = checkCoverage(shots, m.manifest);
  if (!cover.ok) return { ok: false, code: 'manifest_invalid', error: cover.error, missing: cover.missing };
  if (!valid.request.musicUrl) return { ok: false, code: 'manifest_invalid', error: 'the music track of the manifest is not in the edit' };
  return { ok: true, request: { ...valid.request, shots, manifest: m.manifest }, manifest: m.manifest };
}

/** The manifest indices of the videos in the order they first appear in the edit (the user's order, see beatPlan). */
export function clipOrder(shots: ReadonlyArray<{ source: number }>): number[] {
  const seen: number[] = [];
  for (const s of shots) if (!seen.includes(s.source)) seen.push(s.source);
  return seen;
}

/** Same manifest? Compared item by item (a stored copy must equal the one inside the signed request). */
export function sameManifest(a: readonly MontageManifestItem[], b: readonly MontageManifestItem[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i]!;
    return x.index === y.index && x.path === y.path && x.name === y.name && x.kind === y.kind && x.durationSec === y.durationSec;
  });
}
