/**
 * lib/twin/store.ts — every storage operation of Digital Twin v0: service role, the private `twins` bucket, and an
 * owner-prefix check (lib/twin/paths.ts) before each sign, copy, download and remove.
 *
 * ⚠️ NEVER THROUGH THE GENERIC ADAPTER. lib/orchestrator/storage-adapter.ts refuses this bucket on purpose (its signers
 * take caller-named paths). This module signs directly — and only paths it derived from the caller's own id.
 * ⚠️ NEVER getPublicUrl. The bucket is private; a public URL would be a dead link at best and a leak if it ever flipped.
 * ⚠️ supabase-js storage RETURNS `{ error }`, it does not throw — every answer is read. A storage failure surfaces as a
 * TwinStorageError (the routes answer 503); "storage was down" is never reported as "no twin" or "deleted".
 *
 * The commit flow (POST /api/twin/upload-url → browser uploads → POST /api/twin/commit):
 *   1. signStagingUploads — signed upload URLs for `staging/<slot>.<ext>` only (cleared first).
 *   2. promoteCapture     — COPIES staging into a fresh `twin-<captureId>/` and validates the COPIES (size, MIME, magic
 *                           bytes). Staging stays writable through its 2-hour upload URLs; the copies are never an upload
 *                           target, so what was checked is what is kept.
 *   3. writeTwinManifest  — the switch. Until it lands, the previous twin (if any) is still the twin.
 *   4. pruneTwinCaptures  — best-effort removal of the previous capture and staging.
 */
import 'server-only';
import { randomBytes } from 'crypto';

import type { HandoffJtiStore } from '@/lib/avatar/handoff';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  LEGACY_LIVE_AVATAR_BUCKET,
  MANIFEST_NAME,
  TWIN_PRIVATE_BUCKET,
  assertOwnTwinPath,
  handoffJtiPath,
  isCaptureId,
  legacyLiveAvatarDir,
  twinCaptureDir,
  twinCapturePath,
  twinManifestPath,
  twinStagingDir,
  twinStagingPath,
  twinUserPrefix,
} from './paths';
import type { CaptureTicket } from './ticket';
import { TWIN_LIMITS, TWIN_PHOTO_SLOTS, type TwinManifest, type TwinObject, type TwinPhotoSlot, type TwinSlot } from './types';
import { checkTwinObject, isPhotoSlot, parseManifest } from './validate';

type StorageError = { message?: string; statusCode?: string | number; status?: number } | null;

export interface StorageEntry {
  name: string;
  id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
}

/** The slice of the supabase-js bucket API this module uses (a test fake implements exactly this). */
export interface TwinBucketApi {
  upload(path: string, body: Buffer, opts: { contentType: string; upsert: boolean; cacheControl?: string }): Promise<{ error: StorageError }>;
  download(path: string): PromiseLike<{ data: Blob | null; error: StorageError }>;
  list(dir: string, opts?: { limit?: number; offset?: number; search?: string }): Promise<{ data: StorageEntry[] | null; error: StorageError }>;
  remove(paths: string[]): Promise<{ error: StorageError }>;
  copy(fromPath: string, toPath: string): Promise<{ error: StorageError }>;
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: StorageError }>;
  createSignedUploadUrl(path: string, opts: { upsert: boolean }): Promise<{ data: { token: string } | null; error: StorageError }>;
  /** Only ever called on the LEGACY public bucket (lib/twin/resolve.ts legacy poster) — never on `twins`. */
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

export interface TwinStorageClient {
  storage: {
    from(bucket: string): TwinBucketApi;
    getBucket(id: string): Promise<{ data: { public?: boolean } | null; error: StorageError }>;
  };
}

/** A storage answer the store cannot act on. Routes answer 503 — never "no twin", never "deleted". */
export class TwinStorageError extends Error {
  constructor(readonly op: string) {
    super(`twin storage: ${op}`);
    this.name = 'TwinStorageError';
  }
}

/** GET /api/twin and the twin-first poster sign for this long: long enough to view and pick, short enough to expire. */
export const TWIN_URL_TTL_SEC = 15 * 60;

const PAGE = 100;
const MAX_OBJECTS = 2000;
const MAX_DEPTH = 4;
const MANIFEST_MAX_BYTES = 16 * 1024;

/** The service-role storage client. A missing key is a TwinStorageError (503), like any other storage outage. */
export function twinStorageClient(): TwinStorageClient {
  try {
    return createServiceRoleClient() as unknown as TwinStorageClient;
  } catch {
    throw new TwinStorageError('unconfigured');
  }
}

const errText = (e: StorageError): string => `${e?.message ?? ''} ${e?.statusCode ?? ''} ${e?.status ?? ''}`;
const isDuplicate = (e: StorageError): boolean => /already exists|duplicate|\b409\b/i.test(errText(e));
const isFolder = (e: StorageEntry): boolean => !e.id && !e.metadata;
const maxBytes = (slot: TwinSlot): number => (isPhotoSlot(slot) ? TWIN_LIMITS.photoMaxBytes : TWIN_LIMITS.voiceMaxBytes);

function twins(sb: TwinStorageClient): TwinBucketApi {
  return sb.storage.from(TWIN_PRIVATE_BUCKET);
}

/**
 * Inside `prefix` by construction (a listed child of our own folder) — no `..` / `.` / empty segment. Looser than
 * isOwnTwinPath on purpose: an odd object NAME must never make a person's data undeletable.
 */
function under(prefix: string): (p: string) => boolean {
  return (p) => p.startsWith(prefix) && p.length > prefix.length && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

let bucketChecked = false;

/**
 * The twin bucket exists and REPORTS `public: false` — or nothing is signed into it. It is never created here (it is
 * provisioned by migration 20261001f); a hand-made public `twins` bucket would publish every face, so it is refused.
 */
export async function assertTwinBucketPrivate(sb: TwinStorageClient): Promise<void> {
  if (bucketChecked) return;
  const { data, error } = await sb.storage.getBucket(TWIN_PRIVATE_BUCKET);
  if (error || !data) throw new TwinStorageError('bucket_unavailable');
  if (data.public !== false) {
    // eslint-disable-next-line no-console
    console.error(`[twin] ⚠️ bucket "${TWIN_PRIVATE_BUCKET}" is PUBLIC — refusing to store biometrics in it. Make it private.`);
    throw new TwinStorageError('bucket_public');
  }
  bucketChecked = true;
}

/** Test seam: forget the per-instance bucket check. */
export function __resetTwinBucketCheck(): void {
  bucketChecked = false;
}

/**
 * The caller's manifest: null when there is none (or it fails validation); throws when storage cannot answer.
 *
 * ⚠️ EXISTENCE COMES FROM list(), NOT FROM A FAILED download(). supabase-js downloads with `noResolveJson`, so a
 * missing object comes back as a StorageUnknownError whose message is the stringified Response — "{}", no status —
 * indistinguishable from an outage. Reading that as "an outage" made every first-time user a 503; reading it as
 * "absent" would make an outage look like "no twin". So: list the folder (an exact-name match, like
 * storageObjectExists), and only download what is there — a failed download of a listed manifest IS an outage.
 */
export async function readTwinManifest(sb: TwinStorageClient, uid: string): Promise<TwinManifest | null> {
  const api = twins(sb);
  const listed = await api.list(twinUserPrefix(uid).slice(0, -1), { limit: PAGE, search: MANIFEST_NAME });
  if (listed.error || !Array.isArray(listed.data)) throw new TwinStorageError('manifest_list');
  if (!listed.data.some((e) => e?.name === MANIFEST_NAME && !isFolder(e))) return null;
  const { data, error } = await api.download(twinManifestPath(uid));
  if (error || !data) throw new TwinStorageError('manifest_read');
  if (data.size > MANIFEST_MAX_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(await data.text());
  } catch {
    raw = null;
  }
  const manifest = parseManifest(raw, uid);
  // eslint-disable-next-line no-console
  if (!manifest) console.warn('[twin] manifest failed validation — treated as no twin');
  return manifest;
}

async function listDir(api: TwinBucketApi, dir: string): Promise<StorageEntry[]> {
  const out: StorageEntry[] = [];
  for (let offset = 0; out.length < MAX_OBJECTS; offset += PAGE) {
    const { data, error } = await api.list(dir, { limit: PAGE, offset });
    if (error || !Array.isArray(data)) throw new TwinStorageError('list');
    out.push(...data.filter((e) => e && typeof e.name === 'string' && e.name.length > 0));
    if (data.length < PAGE) break;
  }
  return out;
}

/** Every object (not folder) under `dir`, recursively; each path must pass `owns` or nothing is returned. */
async function listTree(api: TwinBucketApi, dir: string, owns: (p: string) => boolean, depth = 0, acc: string[] = []): Promise<string[]> {
  if (depth > MAX_DEPTH) throw new TwinStorageError('tree_too_deep');
  for (const e of await listDir(api, dir)) {
    const p = `${dir}/${e.name}`;
    if (!owns(p)) throw new TwinStorageError('foreign_path');
    if (isFolder(e)) await listTree(api, p, owns, depth + 1, acc);
    else acc.push(p);
    if (acc.length > MAX_OBJECTS) throw new TwinStorageError('too_many_objects');
  }
  return acc;
}

async function removePaths(api: TwinBucketApi, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await api.remove(paths.slice(i, i + PAGE));
    if (error) throw new TwinStorageError('remove');
  }
}

/** Empty the caller's staging folder (an abandoned capture's uploads go before a new one is signed). */
export async function clearStaging(sb: TwinStorageClient, uid: string): Promise<void> {
  const api = twins(sb);
  await removePaths(api, await listTree(api, twinStagingDir(uid), under(`${twinStagingDir(uid)}/`)));
}

/** One upsert-able signed upload per requested slot, all into the caller's staging folder. */
export async function signStagingUploads(
  sb: TwinStorageClient,
  uid: string,
  slots: CaptureTicket['s'],
): Promise<Partial<Record<TwinSlot, { path: string; token: string }>>> {
  const api = twins(sb);
  const out: Partial<Record<TwinSlot, { path: string; token: string }>> = {};
  for (const slot of Object.keys(slots) as TwinSlot[]) {
    const path = assertOwnTwinPath(uid, twinStagingPath(uid, slot, slots[slot]!));
    const { data, error } = await api.createSignedUploadUrl(path, { upsert: true });
    if (error || !data?.token) throw new TwinStorageError('sign_upload');
    out[slot] = { path, token: data.token };
  }
  return out;
}

/** A commit in flight is younger than this; pruning never touches a capture folder that young (see pruneTwinCaptures). */
export const CAPTURE_GRACE_MS = 10 * 60 * 1000;

/** 16 hex chars: the creation second (8) + 4 random bytes (8) — unique per user, and its age is readable from the name. */
export function newCaptureId(now: number = Date.now()): string {
  return Math.floor(now / 1000).toString(16).padStart(8, '0').slice(-8) + randomBytes(4).toString('hex');
}

/** How old a capture id is, in ms (its first 8 hex chars are its creation second). */
export function captureIdAgeMs(captureId: string, now: number = Date.now()): number {
  return now - parseInt(captureId.slice(0, 8), 16) * 1000;
}

export type PromoteResult =
  | { ok: true; captureId: string; photos: Record<TwinPhotoSlot, TwinObject>; voice: TwinObject | null }
  | { ok: false; status: 400 | 413 | 415; error: string; slot?: TwinSlot };

/**
 * Copy the staged capture into a fresh `twin-<captureId>/` and validate the copies. On a refusal the copies AND the
 * staged objects are removed (an object that failed validation is not kept); on a storage failure the copies are
 * removed and the error is thrown (staging stays, so the same commit can be retried).
 */
export async function promoteCapture(sb: TwinStorageClient, uid: string, ticket: CaptureTicket): Promise<PromoteResult> {
  if (ticket.u !== uid) return { ok: false, status: 400, error: 'ticket_mismatch' };
  const api = twins(sb);
  const staged = new Map((await listDir(api, twinStagingDir(uid))).filter((e) => !isFolder(e)).map((e) => [e.name, e]));
  const slots = (Object.keys(ticket.s) as TwinSlot[]).filter((slot) => staged.has(`${slot}.${ticket.s[slot]}`));
  const refuse = async (status: 400 | 413 | 415, error: string, slot?: TwinSlot, copies: string[] = []): Promise<PromoteResult> => {
    await removePaths(api, copies).catch(() => undefined);
    await clearStaging(sb, uid).catch(() => undefined);
    return { ok: false, status, error, ...(slot ? { slot } : {}) };
  };

  for (const slot of TWIN_PHOTO_SLOTS) {
    if (!slots.includes(slot)) return { ok: false, status: 400, error: 'missing_photo', slot };
  }
  // Refuse an oversized staged object before copying or downloading a byte of it.
  for (const slot of slots) {
    const size = Number(staged.get(`${slot}.${ticket.s[slot]}`)?.metadata?.size);
    if (Number.isFinite(size) && size > maxBytes(slot)) return refuse(413, 'too_large', slot);
  }

  const captureId = newCaptureId();
  const copies: string[] = [];
  try {
    for (const slot of slots) {
      const ext = ticket.s[slot]!;
      const to = assertOwnTwinPath(uid, twinCapturePath(uid, captureId, slot, ext));
      const { error } = await api.copy(assertOwnTwinPath(uid, twinStagingPath(uid, slot, ext)), to);
      if (error) throw new TwinStorageError('copy');
      copies.push(to);
    }
    const meta = new Map((await listDir(api, twinCaptureDir(uid, captureId))).map((e) => [e.name, e]));
    const objects: Partial<Record<TwinSlot, TwinObject>> = {};
    for (const slot of slots) {
      const ext = ticket.s[slot]!;
      const path = twinCapturePath(uid, captureId, slot, ext);
      const { data, error } = await api.download(path);
      if (error || !data) throw new TwinStorageError('download');
      if (data.size > maxBytes(slot)) return refuse(413, 'too_large', slot, copies);
      const bytes = new Uint8Array(await data.arrayBuffer());
      const check = checkTwinObject(slot, {
        storedMime: meta.get(`${slot}.${ext}`)?.metadata?.mimetype ?? data.type,
        bytes: bytes.byteLength,
        head: bytes.subarray(0, 32),
        expectedExt: ext,
      });
      if (!check.ok) return refuse(check.status, check.reason, slot, copies);
      objects[slot] = { path, mime: check.mime, bytes: bytes.byteLength };
    }
    return {
      ok: true,
      captureId,
      photos: { front: objects.front!, left: objects.left!, right: objects.right! },
      voice: objects.voice ?? null,
    };
  } catch (e) {
    await removePaths(api, copies).catch(() => undefined);
    throw e;
  }
}

/** Remove a promoted capture that will not be committed (its manifest write failed, or the handoff link was spent). */
export async function discardCapture(sb: TwinStorageClient, uid: string, captureId: string): Promise<void> {
  const api = twins(sb);
  const dir = twinCaptureDir(uid, captureId);
  await removePaths(api, await listTree(api, dir, under(`${dir}/`)));
}

/** The switch: until this lands, the previous twin (if any) is still the twin. */
export async function writeTwinManifest(sb: TwinStorageClient, manifest: TwinManifest): Promise<void> {
  const path = assertOwnTwinPath(manifest.userId, twinManifestPath(manifest.userId));
  // ⚠️ cacheControl 0: the manifest is overwritten in place, and a CDN copy of the old one would resurrect the old twin.
  const { error } = await twins(sb).upload(path, Buffer.from(JSON.stringify(manifest)), {
    contentType: 'application/json',
    upsert: true,
    cacheControl: '0',
  });
  if (error) throw new TwinStorageError('manifest_write');
}

/**
 * After a commit: remove staging and every capture folder the CURRENT manifest does not point at (best-effort — the
 * caller logs a miss).
 *
 * ⚠️ RELATIVE TO THE MANIFEST AS IT IS NOW, AND NEVER A YOUNG FOLDER. Two overlapping commits (a double submit, two
 * tabs) each promote their own folder before writing the manifest. Pruning "everything but mine" let commit A delete
 * commit B's folder an instant before B's manifest landed — a twin pointing at removed files, unsignable for good.
 * A folder younger than CAPTURE_GRACE_MS may belong to a commit still in flight, so it waits for a later prune — except
 * `previous`, the capture the manifest pointed at BEFORE this commit: that one was committed, not in flight, so a
 * re-capture removes the face it replaced at once.
 */
export async function pruneTwinCaptures(
  sb: TwinStorageClient,
  uid: string,
  opts: { previous?: string | null; now?: number } = {},
): Promise<void> {
  const api = twins(sb);
  const root = twinUserPrefix(uid).slice(0, -1);
  const now = opts.now ?? Date.now();
  const live = (await readTwinManifest(sb, uid))?.captureId ?? null;
  const stale = (await listDir(api, root)).filter((e) => {
    if (!isFolder(e)) return false;
    if (e.name === 'staging') return true;
    if (!e.name.startsWith('twin-') || e.name === `twin-${live}`) return false;
    const id = e.name.slice('twin-'.length);
    return id === opts.previous || !isCaptureId(id) || captureIdAgeMs(id, now) >= CAPTURE_GRACE_MS;
  });
  for (const e of stale) {
    const dir = `${root}/${e.name}`;
    await removePaths(api, await listTree(api, dir, under(`${dir}/`)));
  }
}

/** One short-lived signed URL for one of the caller's own objects — owner-checked before the service role signs it. */
export async function signOwnTwinObject(sb: TwinStorageClient, uid: string, path: string, ttlSec: number = TWIN_URL_TTL_SEC): Promise<string> {
  const { data, error } = await twins(sb).createSignedUrl(assertOwnTwinPath(uid, path), ttlSec);
  if (error || !data?.signedUrl) throw new TwinStorageError('sign');
  return data.signedUrl;
}

/** Short-lived signed URLs for every object of the caller's committed twin. */
export async function signTwinUrls(
  sb: TwinStorageClient,
  manifest: TwinManifest,
  ttlSec: number = TWIN_URL_TTL_SEC,
): Promise<Record<TwinPhotoSlot, string> & { voice: string | null }> {
  const sign = (path: string): Promise<string> => signOwnTwinObject(sb, manifest.userId, path, ttlSec);
  const [front, left, right, voice] = await Promise.all([
    sign(manifest.photos.front.path),
    sign(manifest.photos.left.path),
    sign(manifest.photos.right.path),
    manifest.voice ? sign(manifest.voice.path) : Promise.resolve(null),
  ]);
  return { front, left, right, voice };
}

/**
 * Erase everything biometric the user has: `twins/<uid>/**` (manifest, captures, staging, the Live-Avatar voice sample)
 * and the legacy public `live-avatars/<uid>/**` (poster, pre-Wave-1 voice). The manifest goes FIRST, so a delete that
 * fails half-way reads as "no twin" (and is finished by a retry), never as a twin pointing at removed files.
 */
export async function deleteTwinData(sb: TwinStorageClient, uid: string): Promise<{ twins: number; legacy: number }> {
  const twinApi = twins(sb);
  const legacyApi = sb.storage.from(LEGACY_LIVE_AVATAR_BUCKET);
  const prefix = twinUserPrefix(uid);
  const twinPaths = await listTree(twinApi, prefix.slice(0, -1), under(prefix));
  const legacyDir = legacyLiveAvatarDir(uid);
  const legacyPaths = await listTree(legacyApi, legacyDir, under(`${legacyDir}/`));
  const manifest = twinManifestPath(uid);
  if (twinPaths.includes(manifest)) await removePaths(twinApi, [manifest]);
  await removePaths(twinApi, twinPaths.filter((p) => p !== manifest));
  await removePaths(legacyApi, legacyPaths);
  return { twins: twinPaths.length, legacy: legacyPaths.length };
}

/**
 * Used phone-handoff tokens, as marker objects `handoff/<jti>` in the private twin bucket. A create with
 * `upsert: false` is atomic in storage (a unique row per bucket + name), so of two concurrent claims exactly one wins.
 */
export function twinHandoffJtiStore(sb: TwinStorageClient = twinStorageClient()): HandoffJtiStore {
  return {
    async claim(jti, exp) {
      const { error } = await twins(sb).upload(handoffJtiPath(jti), Buffer.from(String(exp)), { contentType: 'text/plain', upsert: false });
      if (!error) return 'claimed';
      if (isDuplicate(error)) return 'used';
      throw new TwinStorageError('jti_claim');
    },
    async release(jti) {
      try {
        await twins(sb).remove([handoffJtiPath(jti)]);
      } catch {
        /* best-effort: the worst case is a link that must be re-scanned */
      }
    },
    async isClaimed(jti) {
      try {
        const { data, error } = await twins(sb).list('handoff', { limit: PAGE, search: jti });
        if (error || !Array.isArray(data)) return null;
        return data.some((e) => e?.name === jti);
      } catch {
        return null;
      }
    },
  };
}

