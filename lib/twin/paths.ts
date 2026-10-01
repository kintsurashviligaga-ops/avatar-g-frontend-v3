/**
 * lib/twin/paths.ts — every Digital Twin object path: DERIVED from the user id (never taken from a request) and
 * owner-checked before any sign, copy, list or remove.
 *
 * Layout in the private TWIN_PRIVATE_BUCKET (`twins`), under the same `twins/<uid>/` root as the Live-Avatar voice
 * sample (lib/avatar/twinStorage.ts twinVoicePath), so ONE prefix holds everything biometric a user has:
 *
 *   twins/<uid>/twin.json                 the manifest — the source of truth (lib/twin/types.ts)
 *   twins/<uid>/staging/<nonce>/<slot>.<ext>  the ONLY paths a signed upload URL is ever issued for (one folder per
 *                                         capture: the nonce lives in the capture ticket, lib/twin/ticket.ts)
 *   twins/<uid>/twin-<captureId>/…        a committed capture: server-side copies of staging, never upload targets
 *   twins/<uid>/voice.<ext>               the Live-Avatar enrollment voice sample (lib/avatar/enroll.ts)
 *   handoff/<jti>                         used phone-handoff tokens (lib/avatar/handoff.ts) — no user data
 *
 * ⚠️ THE OWNER-PREFIX CHECK IS NOT DECORATION. A twin path is guessable from the user id alone, and the generic signers
 * refuse this bucket (lib/orchestrator/storage-adapter.ts refuseTwin) precisely because they sign whatever path a
 * caller names. The twin store signs with the service role itself, so it proves every path is the CALLER's own first —
 * a manifest naming any other path is treated as corrupt, not followed.
 *
 * Pure (no server-only import): the capture UI shares the MIME → extension mapping.
 */
import { TWIN_PRIVATE_BUCKET } from '@/lib/avatar/twinStorage';
import { TWIN_PHOTO_MIMES, TWIN_PHOTO_SLOTS, TWIN_SLOTS, TWIN_VOICE_MIMES, type TwinSlot } from './types';

export { TWIN_PRIVATE_BUCKET };

/** The legacy, PUBLIC Live-Avatar bucket: `live-avatars/<uid>/poster.jpg` (and voice samples from before Wave 1). */
export const LEGACY_LIVE_AVATAR_BUCKET = 'avatars';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** No `%` (no encoded traversal), no spaces, backslashes or control characters. */
const SAFE_PATH_RE = /^[A-Za-z0-9._/-]+$/;
/** A committed capture id: 8 random bytes as hex (lib/twin/store.ts newCaptureId). */
const CAPTURE_ID_RE = /^[0-9a-f]{16}$/;
/** A capture's staging nonce: 16 random bytes as hex (lib/twin/ticket.ts newStagingNonce). */
const NONCE_RE = /^[0-9a-f]{32}$/;
/** A handoff token id (lib/avatar/handoff.ts mints 16 random bytes, base64url → 22 chars). */
const JTI_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_PATH = 256;

export function isTwinUserId(uid: unknown): uid is string {
  return typeof uid === 'string' && UUID_RE.test(uid);
}

export function isCaptureId(id: unknown): id is string {
  return typeof id === 'string' && CAPTURE_ID_RE.test(id);
}

export function isStagingNonce(n: unknown): n is string {
  return typeof n === 'string' && NONCE_RE.test(n);
}

function requireUid(uid: string): string {
  if (!isTwinUserId(uid)) throw new Error('twin: not a user id');
  return uid;
}

/** `twins/<uid>/` — the root of one user's twin data (the Live-Avatar voice sample included). */
export function twinUserPrefix(uid: string): string {
  return `twins/${requireUid(uid)}/`;
}

export const MANIFEST_NAME = 'twin.json';

/** The manifest object — one per user, overwritten on every commit. */
export function twinManifestPath(uid: string): string {
  return `${twinUserPrefix(uid)}${MANIFEST_NAME}`;
}

function slotExts(slot: TwinSlot): string[] {
  return Object.values((TWIN_PHOTO_SLOTS as readonly string[]).includes(slot) ? TWIN_PHOTO_MIMES : TWIN_VOICE_MIMES);
}

function slotFile(slot: TwinSlot, ext: string): string {
  if (!(TWIN_SLOTS as readonly string[]).includes(slot)) throw new Error('twin: bad slot');
  if (!slotExts(slot).includes(ext)) throw new Error('twin: bad extension');
  return `${slot}.${ext}`;
}

/** The staging folder (no trailing slash — the shape storage `list()` takes). */
export function twinStagingDir(uid: string): string {
  return `${twinUserPrefix(uid)}staging`;
}

/** One capture's own staging folder (no trailing slash). */
export function twinStagingNonceDir(uid: string, nonce: string): string {
  if (!isStagingNonce(nonce)) throw new Error('twin: bad staging nonce');
  return `${twinStagingDir(uid)}/${nonce}`;
}

/**
 * Upload target: the same (user, capture nonce, slot, extension) always names the same staging object.
 *
 * ⚠️ PER-CAPTURE, NOT PER-USER. Upload tokens are upsert-able for 2 hours. With one shared `staging/<slot>.<ext>`, a token
 * from an EARLIER capture (another tab, a leaked URL) could overwrite a later capture's photo between its PUT and its
 * commit — and the commit would keep a face nobody reviewed. Each capture now stages under its own random nonce, and the
 * commit copies only from the nonce its ticket names.
 */
export function twinStagingPath(uid: string, nonce: string, slot: TwinSlot, ext: string): string {
  return `${twinStagingNonceDir(uid, nonce)}/${slotFile(slot, ext)}`;
}

/** A committed capture's folder (no trailing slash). */
export function twinCaptureDir(uid: string, captureId: string): string {
  if (!isCaptureId(captureId)) throw new Error('twin: bad capture id');
  return `${twinUserPrefix(uid)}twin-${captureId}`;
}

/** Deterministic: the same (user, capture, slot, extension) always names the same committed object. */
export function twinCapturePath(uid: string, captureId: string, slot: TwinSlot, ext: string): string {
  return `${twinCaptureDir(uid, captureId)}/${slotFile(slot, ext)}`;
}

/** `audio/webm;codecs=opus` → `audio/webm`. Non-strings → ''. */
export function baseMime(mime: unknown): string {
  return typeof mime === 'string' ? (mime.split(';')[0] ?? '').trim().toLowerCase() : '';
}

/** The path extension for a slot's MIME, or null when that MIME is not allowed in that slot. */
export function extForSlotMime(slot: TwinSlot, mime: unknown): string | null {
  const table = (TWIN_PHOTO_SLOTS as readonly string[]).includes(slot) ? TWIN_PHOTO_MIMES : TWIN_VOICE_MIMES;
  return table[baseMime(mime)] ?? null;
}

function isUnder(prefix: string, path: unknown): path is string {
  if (typeof path !== 'string' || path.length > MAX_PATH || !SAFE_PATH_RE.test(path)) return false;
  if (!path.startsWith(prefix) || path.length === prefix.length) return false;
  return path.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** True only for a clean path inside `twins/<uid>/` — another user's id, `..`, `//`, `%2e`, `\` all fail. */
export function isOwnTwinPath(uid: string, path: unknown): path is string {
  return isTwinUserId(uid) && isUnder(`twins/${uid}/`, path);
}

/** isOwnTwinPath or throw — the guard every signer, copier and remover runs first. */
export function assertOwnTwinPath(uid: string, path: unknown): string {
  if (!isOwnTwinPath(uid, path)) throw new Error('twin: path outside the owner prefix');
  return path;
}

/** `live-avatars/<uid>` in LEGACY_LIVE_AVATAR_BUCKET (no trailing slash — the shape storage `list()` takes). */
export function legacyLiveAvatarDir(uid: string): string {
  return `live-avatars/${requireUid(uid)}`;
}

/** Owner check for the legacy public folder, for the twin DELETE (it erases the legacy Live-Avatar files too). */
export function isOwnLegacyLiveAvatarPath(uid: string, path: unknown): path is string {
  return isTwinUserId(uid) && isUnder(`live-avatars/${uid}/`, path);
}

/** The marker that records a phone-handoff token as used. Only a well-formed token id ever becomes a path. */
export function handoffJtiPath(jti: string): string {
  if (typeof jti !== 'string' || !JTI_RE.test(jti)) throw new Error('twin: bad token id');
  return `handoff/${jti}`;
}
