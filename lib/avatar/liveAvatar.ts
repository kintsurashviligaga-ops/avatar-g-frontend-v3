/**
 * lib/avatar/liveAvatar.ts — the user's saved Live-Avatar photo: PRIVATE, with a stable id, an active pointer, and a
 * delete. The owner's P0 correction task (2026-10-24, phase 2) replaces the public poster
 * (`avatars/live-avatars/<uid>/poster.jpg`, readable by anyone who guessed the user id) with this.
 *
 * Layout in the private `twins` bucket, beside the Digital Twin and the voice sample (lib/twin/paths.ts):
 *
 *   twins/<uid>/live-avatar.json                 the manifest: WHICH avatar is active, and its facts (the pointer)
 *   twins/<uid>/live-avatar-<id>/photo.jpg       the photo the app shows (upright, no metadata, ≤1920 px)
 *   twins/<uid>/live-avatar-<id>/custom.png      Google's custom-avatar portrait (9:16, ≥720×1280, RGB PNG) — when
 *                                                the source was big enough (lib/avatar/livePhoto.ts)
 *
 * ⚠️ NO DATABASE. Production has no `avatar_assets` table and no `profiles.core_avatar_id` (schema-drift snapshot), and
 * a schema change there is the owner's call. The manifest IS the record: id, owner, created/updated times, the active
 * pointer. A save writes a fresh folder, then the manifest LAST, so a save that fails half-way leaves the old avatar
 * active, never a pointer to missing files.
 *
 * ⚠️ PRIVATE ONLY. Every path is derived from the caller's own id and owner-checked before a sign or a remove; the
 * photo is only ever handed out as a short-lived signed URL. The generic signers refuse this bucket (isTwinBucket).
 *
 * ⚠️ THE OLD PUBLIC POSTER IS MOVED, NOT LEFT. The first read by its owner copies it in here (same checks, metadata
 * stripped) and removes the public file; a new save removes it too.
 */
import 'server-only';

import { LEGACY_LIVE_AVATAR_BUCKET, assertOwnTwinPath, isCaptureId, isOwnTwinPath, twinUserPrefix } from '@/lib/twin/paths';
import {
  CAPTURE_GRACE_MS,
  TwinStorageError,
  assertTwinBucketPrivate,
  captureIdAgeMs,
  newCaptureId,
  type TwinBucketApi,
  type TwinStorageClient,
} from '@/lib/twin/store';
import { TWIN_PRIVATE_BUCKET } from '@/lib/avatar/twinStorage';
import { sniffMime } from '@/lib/twin/validate';
import { prepareLivePhoto, type CustomPrepReason, type LivePhotoError, type PreparedImage } from './livePhoto';

/** Signed photo URLs live this long — the app re-reads GET /api/avatar/core for a fresh one. */
export const LIVE_AVATAR_URL_TTL_SEC = 60 * 60;

const MANIFEST_MAX_BYTES = 16 * 1024;
const LEGACY_POSTER = (uid: string) => `live-avatars/${uid}/poster.jpg`;

export type LiveAvatarSource = 'camera' | 'upload' | 'handoff' | 'legacy';

interface StoredImage { path: string; mime: string; bytes: number; width: number; height: number }

export interface LiveAvatarManifest {
  v: 1;
  userId: string;
  /** Stable for the life of this photo: a new save is a new id (16 hex, time-prefixed, lib/twin/store newCaptureId). */
  avatarId: string;
  createdAt: string;
  updatedAt: string;
  source: LiveAvatarSource;
  photo: StoredImage;
  custom: StoredImage | null;
  prep: { ok: boolean; reasons: CustomPrepReason[]; faceChecked: false };
}

/**
 * Google's custom-avatar access for this deployment. Custom avatars are allowlist-only on Vertex; until the owner's
 * project is allowlisted AND a real session has proven it, this stays 'unavailable' (BLOCKED_EXTERNAL).
 */
export type CustomAvatarAccess = 'available' | 'unavailable';
export function customAvatarAccess(value: string | undefined = process.env.VERTEX_LIVE_CUSTOM_AVATAR): CustomAvatarAccess {
  return value?.trim().toLowerCase() === 'allowlisted' ? 'available' : 'unavailable';
}

/** The three states the owner asked the screen to tell apart, plus "nothing saved". */
export type LiveAvatarState = 'none' | 'saved_photo' | 'custom_ready' | 'custom_unavailable';
export function liveAvatarState(m: LiveAvatarManifest | null, access: CustomAvatarAccess = customAvatarAccess()): LiveAvatarState {
  if (!m) return 'none';
  if (!m.prep.ok) return 'saved_photo';
  return access === 'available' ? 'custom_ready' : 'custom_unavailable';
}

const MANIFEST_NAME = 'live-avatar.json';

export function liveAvatarManifestPath(uid: string): string {
  return `${twinUserPrefix(uid)}${MANIFEST_NAME}`;
}

export function liveAvatarDir(uid: string, avatarId: string): string {
  if (!isCaptureId(avatarId)) throw new Error('live avatar: bad id');
  return `${twinUserPrefix(uid)}live-avatar-${avatarId}`;
}

function twins(sb: TwinStorageClient): TwinBucketApi {
  return sb.storage.from(TWIN_PRIVATE_BUCKET);
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const SOURCES: LiveAvatarSource[] = ['camera', 'upload', 'handoff', 'legacy'];

function parseImage(raw: unknown, expectedPath: string, mime: string): StoredImage | null {
  const o = raw as Partial<StoredImage> | null;
  if (!o || o.path !== expectedPath || o.mime !== mime) return null;
  for (const k of ['bytes', 'width', 'height'] as const) if (typeof o[k] !== 'number' || !Number.isFinite(o[k]) || o[k]! <= 0) return null;
  return { path: o.path, mime: o.mime, bytes: o.bytes!, width: o.width!, height: o.height! };
}

/** A manifest read back from storage, rebuilt field by field: any path not derived from this user and id → null. */
export function parseLiveAvatarManifest(raw: unknown, uid: string): LiveAvatarManifest | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || m.v !== 1 || m.userId !== uid || !isCaptureId(m.avatarId)) return null;
  if (typeof m.createdAt !== 'string' || !ISO_RE.test(m.createdAt) || typeof m.updatedAt !== 'string' || !ISO_RE.test(m.updatedAt)) return null;
  if (!SOURCES.includes(m.source as LiveAvatarSource)) return null;
  const dir = liveAvatarDir(uid, m.avatarId);
  const photo = parseImage(m.photo, `${dir}/photo.jpg`, 'image/jpeg');
  if (!photo) return null;
  const custom = m.custom === null ? null : parseImage(m.custom, `${dir}/custom.png`, 'image/png');
  if (m.custom !== null && !custom) return null;
  const p = m.prep as Record<string, unknown> | null;
  if (!p || typeof p.ok !== 'boolean' || p.ok !== (custom !== null) || !Array.isArray(p.reasons)) return null;
  const reasons = p.reasons.filter((r): r is CustomPrepReason => r === 'too_small' || r === 'too_large');
  return { v: 1, userId: uid, avatarId: m.avatarId, createdAt: m.createdAt, updatedAt: m.updatedAt, source: m.source as LiveAvatarSource, photo, custom, prep: { ok: p.ok, reasons, faceChecked: false } };
}

/**
 * The active manifest, or null when there is none. A corrupt manifest reads as none. Throws TwinStorageError on an outage.
 * ⚠️ Existence comes from list(), as in lib/twin/store readTwinManifest: supabase-js reports a MISSING object's download
 * as an error with no status ("{}"), indistinguishable from an outage.
 */
export async function readLiveAvatar(sb: TwinStorageClient, uid: string): Promise<LiveAvatarManifest | null> {
  const api = twins(sb);
  const listed = await api.list(twinUserPrefix(uid).slice(0, -1), { limit: 100, search: MANIFEST_NAME });
  if (listed.error || !Array.isArray(listed.data)) throw new TwinStorageError('live_avatar_list');
  if (!listed.data.some((e) => e?.name === MANIFEST_NAME && (e.id || e.metadata))) return null;
  const { data, error } = await api.download(liveAvatarManifestPath(uid));
  if (error || !data) throw new TwinStorageError('live_avatar_read');
  if (data.size > MANIFEST_MAX_BYTES) return null;
  let manifest: LiveAvatarManifest | null = null;
  try {
    manifest = parseLiveAvatarManifest(JSON.parse(await data.text()), uid);
  } catch {
    manifest = null;
  }
  if (!manifest) console.warn('[live-avatar] manifest failed validation — treated as no avatar');
  return manifest;
}

async function put(api: TwinBucketApi, uid: string, path: string, img: PreparedImage): Promise<StoredImage> {
  const { error } = await api.upload(assertOwnTwinPath(uid, path), img.bytes, { contentType: img.mime, upsert: false, cacheControl: 'private, max-age=0' });
  if (error) throw new TwinStorageError('live_avatar_upload');
  return { path, mime: img.mime, bytes: img.bytes.byteLength, width: img.width, height: img.height };
}

/** Every object of this user's OTHER live-avatar folders older than the grace period (a concurrent save keeps its own). */
async function staleFolders(api: TwinBucketApi, uid: string, keep: string, now: number): Promise<string[]> {
  const prefix = twinUserPrefix(uid).slice(0, -1);
  const { data, error } = await api.list(prefix, { limit: 100 });
  if (error || !Array.isArray(data)) return [];
  const out: string[] = [];
  for (const e of data) {
    const id = e?.name?.startsWith('live-avatar-') ? e.name.slice('live-avatar-'.length) : '';
    if (!isCaptureId(id) || id === keep || captureIdAgeMs(id, now) < CAPTURE_GRACE_MS) continue;
    const dir = liveAvatarDir(uid, id);
    const { data: files } = await api.list(dir, { limit: 100 });
    for (const f of files ?? []) if (f?.name) out.push(`${dir}/${f.name}`);
  }
  return out.filter((p) => isOwnTwinPath(uid, p));
}

async function removeLegacyPoster(sb: TwinStorageClient, uid: string): Promise<void> {
  try {
    const { error } = await sb.storage.from(LEGACY_LIVE_AVATAR_BUCKET).remove([LEGACY_POSTER(uid)]);
    if (error) console.warn('[live-avatar] legacy public poster not removed:', error.message);
  } catch (e) {
    console.warn('[live-avatar] legacy public poster not removed:', e instanceof Error ? e.message : e);
  }
}

export type SaveResult = { ok: true; manifest: LiveAvatarManifest } | ({ ok: false } & LivePhotoError) | { ok: false; status: 503; error: 'storage_unavailable' };

/**
 * Save a new photo as the user's active Live Avatar. The CALLER authorizes `uid` (the session, or a verified handoff
 * token). Order: check + prepare → bucket is private → upload into a fresh folder → manifest (the switch) → tidy up
 * the older folders and the legacy public poster (best-effort: a miss there never fails the save).
 */
export async function saveLiveAvatar(
  sb: TwinStorageClient,
  uid: string,
  input: { mime: string; bytes: Buffer; source: LiveAvatarSource },
  now: Date = new Date(),
): Promise<SaveResult> {
  const prepared = await prepareLivePhoto(input.mime, input.bytes);
  if ('error' in prepared) return { ok: false, ...prepared };
  try {
    await assertTwinBucketPrivate(sb);
    const api = twins(sb);
    const previous = await readLiveAvatar(sb, uid).catch(() => null);
    const avatarId = newCaptureId(now.getTime());
    const dir = liveAvatarDir(uid, avatarId);
    const photo = await put(api, uid, `${dir}/photo.jpg`, prepared.photo);
    const custom = prepared.custom ? await put(api, uid, `${dir}/custom.png`, prepared.custom) : null;
    const at = now.toISOString();
    const manifest: LiveAvatarManifest = {
      v: 1, userId: uid, avatarId, createdAt: at, updatedAt: at, source: input.source, photo, custom, prep: prepared.prep,
    };
    const { error } = await api.upload(liveAvatarManifestPath(uid), Buffer.from(JSON.stringify(manifest)), { contentType: 'application/json', upsert: true, cacheControl: 'private, max-age=0' });
    if (error) {
      await api.remove([photo.path, ...(custom ? [custom.path] : [])]).catch(() => undefined);
      throw new TwinStorageError('live_avatar_manifest');
    }
    try {
      const stale = await staleFolders(api, uid, avatarId, now.getTime());
      if (previous && previous.avatarId !== avatarId) {
        for (const p of [previous.photo.path, previous.custom?.path]) if (p && !stale.includes(p)) stale.push(p);
      }
      if (stale.length) await api.remove(stale);
    } catch (e) {
      console.warn('[live-avatar] older photos not removed:', e instanceof Error ? e.message : e);
    }
    await removeLegacyPoster(sb, uid);
    return { ok: true, manifest };
  } catch (e) {
    console.error('[live-avatar] save failed:', e instanceof Error ? e.message : e);
    return { ok: false, status: 503, error: 'storage_unavailable' };
  }
}

/**
 * Move the old PUBLIC poster into private storage, once, on its owner's own read. Nothing to move → null. The public
 * file is removed only after the private copy is the active avatar (saveLiveAvatar).
 */
export async function migrateLegacyPoster(sb: TwinStorageClient, uid: string): Promise<LiveAvatarManifest | null> {
  try {
    const legacy = sb.storage.from(LEGACY_LIVE_AVATAR_BUCKET);
    const { data: files, error: listErr } = await legacy.list(`live-avatars/${uid}`, { limit: 100, search: 'poster.jpg' });
    if (listErr || !files?.some((f) => f?.name === 'poster.jpg')) return null;
    const { data, error } = await legacy.download(LEGACY_POSTER(uid));
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    const mime = sniffMime(bytes.subarray(0, 16)) ?? 'application/octet-stream';
    const saved = await saveLiveAvatar(sb, uid, { mime, bytes, source: 'legacy' });
    if (saved.ok) return saved.manifest;
    console.warn('[live-avatar] legacy poster not moved:', saved.error);
    return null;
  } catch (e) {
    console.warn('[live-avatar] legacy poster not moved:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** The active avatar, moving the legacy public poster in first when there is no private one yet. */
export async function resolveLiveAvatar(sb: TwinStorageClient, uid: string): Promise<LiveAvatarManifest | null> {
  return (await readLiveAvatar(sb, uid)) ?? (await migrateLegacyPoster(sb, uid));
}

/** Short-lived signed URLs for the owner's own photo (and portrait). */
export async function signLiveAvatar(sb: TwinStorageClient, m: LiveAvatarManifest): Promise<{ photo: string; custom: string | null }> {
  const sign = async (path: string) => {
    const { data, error } = await twins(sb).createSignedUrl(assertOwnTwinPath(m.userId, path), LIVE_AVATAR_URL_TTL_SEC);
    if (error || !data?.signedUrl) throw new TwinStorageError('live_avatar_sign');
    return data.signedUrl;
  };
  const [photo, custom] = await Promise.all([sign(m.photo.path), m.custom ? sign(m.custom.path) : Promise.resolve(null)]);
  return { photo, custom };
}

/**
 * Delete the user's Live Avatar: the manifest FIRST (so a half-done delete reads as "no avatar"), then every
 * live-avatar folder, then the legacy public poster. The voice sample and the Digital Twin are not touched.
 */
export async function deleteLiveAvatar(sb: TwinStorageClient, uid: string): Promise<{ removed: number }> {
  const api = twins(sb);
  const { error } = await api.remove([liveAvatarManifestPath(uid)]);
  if (error) throw new TwinStorageError('live_avatar_delete');
  const paths = await staleFolders(api, uid, '', Number.MAX_SAFE_INTEGER);
  if (paths.length) {
    const { error: rmErr } = await api.remove(paths);
    if (rmErr) throw new TwinStorageError('live_avatar_delete');
  }
  await removeLegacyPoster(sb, uid);
  return { removed: paths.length + 1 };
}

/** What the routes answer about an avatar: no bytes, no storage paths — only the id, times, state and signed URLs. */
export async function describeLiveAvatar(sb: TwinStorageClient, m: LiveAvatarManifest) {
  const urls = await signLiveAvatar(sb, m);
  const access = customAvatarAccess();
  return {
    id: m.avatarId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    state: liveAvatarState(m, access),
    photoUrl: urls.photo,
    photo: { width: m.photo.width, height: m.photo.height },
    custom: m.custom ? { width: m.custom.width, height: m.custom.height, bytes: m.custom.bytes } : null,
    prep: m.prep,
    customAccess: access,
    expiresIn: LIVE_AVATAR_URL_TTL_SEC,
  };
}
export type LiveAvatarView = Awaited<ReturnType<typeof describeLiveAvatar>>;
