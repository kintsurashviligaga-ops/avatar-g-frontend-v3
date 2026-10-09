/**
 * Media a REQUEST names (a bare upload path, or a URL of one of our storage objects) that the server then signs
 * with the service role, for a provider or ffmpeg to fetch.
 *
 * ⚠️ THE SIGNER IS THE SERVICE ROLE, SO IT READS ANY OBJECT. Until 2026-10-08 the editors, lip-sync, remix, assemble,
 * montage, motion control, voice training, dubbing and 3D signed whatever path or storage URL the body named, and
 * re-signed an expired link for whoever still held it. One account could have the server fetch another account's
 * upload (a path learnt while Production's storage read policy was open, or an old shared link) and get the result
 * back. Now one of our objects is signed for a caller only when:
 *   · it is an upload under the caller's own prefix (`omni-uploads/<uid>/`, `<uid>/`, `photo-studio/<uid>/`,
 *     `audio-studio/<uid>/`), or
 *   · one of the caller's own Library rows (`generation_jobs`, server-written or verified when filed) holds that exact
 *     object, or
 *   · the URL still carries a token our storage honours right now: the caller already holds a live grant.
 * Anything else of ours is refused. A URL on any other host is not ours and is returned as given, for the route's own
 * external rule (an SSRF check, or "own storage only").
 */
import 'server-only';
import {
  createSignedAssetUrl,
  describeSupabaseObjectUrl,
  libraryMediaBuckets,
  ownStorageHosts,
  verifyFileableUrl,
  type StorageObjectRef,
} from '@/lib/orchestrator/storage-adapter';
import { isTwinBucket } from '@/lib/avatar/twinStorage';

/** Prefixes whose second segment is the owner's user id: browser uploads and the editors' chainable outputs. */
export const OWNED_UPLOAD_PREFIXES = ['omni-uploads', 'photo-studio', 'audio-studio'] as const;

/** The characters a server-minted storage path uses; no backslashes, no spaces. */
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,400}$/;

export function uploadBucket(env: NodeJS.ProcessEnv = process.env): string {
  return env.UPLOAD_BUCKET?.trim() || 'uploads';
}

/** True when `path` (in the upload bucket) sits under THIS user's own folder. */
export function ownsUploadObject(path: string, userId: string | null | undefined): boolean {
  if (!userId || !SAFE_PATH.test(path) || path.includes('..') || path.includes('//')) return false;
  if (path.startsWith(`${userId}/`)) return true;
  return OWNED_UPLOAD_PREFIXES.some((prefix) => path.startsWith(`${prefix}/${userId}/`));
}

/** The bucket the editing agent reads its sources from and writes its outputs to. */
export const EDITING_BUCKET = 'job-artifacts';

/**
 * True when a `jobs` row's object is one POST /api/editing/jobs minted for THIS user: `editing-input/<uid>/…` for a
 * source, `editing-output/<uid>/…` for anything the agent writes. The bucket and path come from the row, and a signed-in
 * user can write their own `jobs` rows, so the editing routes sign or download nothing else. The input path ends in the
 * uploaded file's own extension, so this does not demand the strict SAFE_PATH characters, only no `..`, `//` or `\`.
 */
export function ownsEditingObject(
  bucket: unknown,
  path: unknown,
  userId: string | null | undefined,
  kind: 'input' | 'output',
): boolean {
  if (!userId || bucket !== EDITING_BUCKET || typeof path !== 'string') return false;
  if (path.includes('..') || path.includes('//') || path.includes('\\')) return false;
  return path.startsWith(`editing-${kind}/${userId}/`);
}

export interface CallerMediaDeps {
  env?: NodeJS.ProcessEnv;
  sign?: (bucket: string, path: string, ttlSec: number) => Promise<string | null>;
  /** Does one of `userId`'s own Library rows hold exactly this object? */
  recordedFor?: (userId: string, bucket: string, path: string) => Promise<boolean>;
  /** Does our storage honour this signed URL's token right now? */
  liveToken?: (url: string) => Promise<boolean>;
}

type JobRow = { user_id?: string | null; signed_url?: string | null; result?: unknown; params?: unknown };

/** A loose LIKE pattern for the object (every unusual character is a wildcard); each hit is re-checked exactly. */
function objectUrlPattern(bucket: string, path: string): string {
  const loose = (s: string) => s.replace(/[^A-Za-z0-9/.-]/g, '%');
  return `%/${loose(bucket)}/${loose(path)}%`;
}

function rowUrls(row: JobRow): string[] {
  const urls: string[] = [];
  if (typeof row.signed_url === 'string' && row.signed_url) urls.push(row.signed_url);
  const r = row.result as Record<string, unknown> | null | undefined;
  if (r && typeof r.url === 'string' && r.url) urls.push(r.url);
  return urls;
}

/** The Library's own rule (app/api/studio/library mayResign): a manual save counts only when it was verified. */
function rowMayVouch(row: JobRow): boolean {
  const params = (row.params ?? {}) as Record<string, unknown>;
  return params.source !== 'manual-save' || params.storage_verified === true;
}

async function recordedForCaller(userId: string, bucket: string, path: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    // Loaded on use: most callers never get this far (own upload paths are decided above).
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const svc = createServiceRoleClient();
    const pattern = objectUrlPattern(bucket, path);
    const hosts = ownStorageHosts(env);
    const results = await Promise.all(['signed_url', 'result->>url'].map((column) =>
      svc.from('generation_jobs').select('user_id, signed_url, result, params').eq('user_id', userId).like(column, pattern).limit(10)));
    for (const { data } of results) {
      for (const row of (Array.isArray(data) ? data : []) as JobRow[]) {
        if (row.user_id !== userId || !rowMayVouch(row)) continue;
        for (const url of rowUrls(row)) {
          const ref = describeSupabaseObjectUrl(url);
          if (ref && hosts.has(ref.host) && ref.bucket === bucket && ref.path === path) return true;
        }
      }
    }
  } catch {
    /* cannot tell → not proven */
  }
  return false;
}

async function tokenIsLive(url: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const verdict = await verifyFileableUrl(url, { env, isPublicUrl: () => false }).catch(() => null);
  return verdict?.ok === true && verdict.kind === 'own-signed';
}

/** May `userId` have the server read this object of ours? `url` is the string `ref` was read from. */
export async function callerMayRead(
  url: string,
  ref: StorageObjectRef,
  userId: string | null | undefined,
  deps: CallerMediaDeps = {},
): Promise<boolean> {
  const env = deps.env ?? process.env;
  if (isTwinBucket(ref.bucket)) return false; // biometrics: only lib/avatar/twinStorage signs, for the owner
  if (ref.bucket === uploadBucket(env) && ownsUploadObject(ref.path, userId)) return true;
  if (userId && libraryMediaBuckets(env).has(ref.bucket)) {
    const recorded = deps.recordedFor
      ? await deps.recordedFor(userId, ref.bucket, ref.path).catch(() => false)
      : await recordedForCaller(userId, ref.bucket, ref.path, env);
    if (recorded) return true;
  }
  if (ref.access !== 'sign' || !ref.token) return false;
  return deps.liveToken ? deps.liveToken(url).catch(() => false) : tokenIsLive(url, env);
}

export type CallerMedia =
  /** `own`: one of our objects, freshly signed for this caller (or a public-bucket URL, as given). Otherwise external. */
  | { ok: true; url: string; own: boolean }
  /** `invalid`: not a string, empty, too long, or a scheme other than https. */
  | { ok: false; reason: 'invalid' | 'not_owner' | 'unavailable' };

/**
 * Resolve one media reference a request named. A bare path must be the caller's own upload; a URL of ours must pass
 * callerMayRead; a URL on another host comes back untouched with `own: false`.
 */
export async function resolveCallerMedia(
  value: unknown,
  userId: string | null | undefined,
  ttlSec: number,
  deps: CallerMediaDeps = {},
): Promise<CallerMedia> {
  if (typeof value !== 'string') return { ok: false, reason: 'invalid' };
  const s = value.trim();
  if (!s || s.length > 4000) return { ok: false, reason: 'invalid' };
  const env = deps.env ?? process.env;
  const sign = deps.sign ?? createSignedAssetUrl;

  if (/^https:\/\//i.test(s)) {
    const ref = describeSupabaseObjectUrl(s);
    if (!ref || !ownStorageHosts(env).has(ref.host)) return { ok: true, url: s, own: false };
    // A public URL is readable only on a public bucket, by anyone, and nothing new is minted for it.
    if (ref.access === 'public') return { ok: true, url: s, own: true };
    if (!(await callerMayRead(s, ref, userId, deps))) return { ok: false, reason: 'not_owner' };
    const signed = await sign(ref.bucket, ref.path, ttlSec).catch(() => null);
    return signed ? { ok: true, url: signed, own: true } : { ok: false, reason: 'unavailable' };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return { ok: false, reason: 'invalid' };

  const path = s.replace(/^\/+/, '');
  if (!ownsUploadObject(path, userId)) return { ok: false, reason: 'not_owner' };
  const signed = await sign(uploadBucket(env), path, ttlSec).catch(() => null);
  return signed ? { ok: true, url: signed, own: true } : { ok: false, reason: 'unavailable' };
}

/**
 * For a route that hands request-named URLs to reSignIfInternal later (assemble, montage): the index of the first one
 * that is a signed URL of OURS the caller may not read, or -1. External and public URLs are the route's own business:
 * reSignIfInternal re-signs neither.
 */
export async function firstUnreadableOwnUrl(
  values: readonly unknown[],
  userId: string | null | undefined,
  deps: CallerMediaDeps = {},
): Promise<number> {
  const hosts = ownStorageHosts(deps.env ?? process.env);
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (typeof v !== 'string') continue;
    const ref = describeSupabaseObjectUrl(v);
    if (!ref || ref.access !== 'sign' || !hosts.has(ref.host)) continue;
    if (!(await callerMayRead(v, ref, userId, deps))) return i;
  }
  return -1;
}
