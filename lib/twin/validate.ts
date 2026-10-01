/**
 * lib/twin/validate.ts — pure checks for what lands in the twin bucket: an uploaded object (size, declared MIME, real
 * bytes) and the manifest read back from storage.
 *
 * ⚠️ A SIGNED UPLOAD URL CANNOT CONSTRAIN WHAT IS SENT. createSignedUploadUrl fixes the PATH only; the browser chooses
 * the Content-Type and the bytes, and only the bucket's 25 MB cap stops it. So /api/twin/commit checks every object
 * after it lands: the size against the slot's bounds, the stored MIME against the slot's allowlist AND the extension the
 * capture ticket fixed, and the first bytes against that MIME's signature — an HTML page labelled image/jpeg is refused.
 * (It checks the COMMITTED copies, not staging: staging stays writable through its upload URLs until they expire.)
 *
 * ⚠️ A MANIFEST IS RE-VALIDATED ON EVERY READ, NOT TRUSTED. Every path in it must equal the path derived from the
 * caller's own id; anything else means a corrupt (or tampered) manifest, and the twin reads as absent rather than
 * signing whatever it names.
 */
import { baseMime, extForSlotMime, isCaptureId, isOwnTwinPath, twinCapturePath } from './paths';
import { TWIN_LIMITS, TWIN_PHOTO_SLOTS, type TwinManifest, type TwinObject, type TwinPhotoSlot, type TwinSlot } from './types';

/** The MIME a file's first bytes say it is — only the types the twin accepts; null for anything else. */
export function sniffMime(head: Uint8Array): string | null {
  const at = (i: number): number => (i < head.length ? head[i]! : -1);
  const ascii = (i: number, s: string): boolean => [...s].every((c, k) => at(i + k) === c.charCodeAt(0));
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x89 && ascii(1, 'PNG') && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return 'image/png';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'audio/wav';
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return 'audio/webm'; // EBML (WebM/Matroska)
  if (ascii(0, 'OggS')) return 'audio/ogg';
  if (ascii(4, 'ftyp')) return 'audio/mp4'; // ISO-BMFF (Safari's MediaRecorder m4a)
  if (ascii(0, 'ID3') || (at(0) === 0xff && (at(1) & 0xe0) === 0xe0)) return 'audio/mpeg';
  return null;
}

export function isPhotoSlot(slot: TwinSlot): slot is TwinPhotoSlot {
  return (TWIN_PHOTO_SLOTS as readonly string[]).includes(slot);
}

export type ObjectCheck =
  | { ok: true; mime: string; ext: string }
  | { ok: false; status: 400 | 413 | 415; reason: 'too_small' | 'too_large' | 'unsupported_type' | 'content_mismatch' };

/**
 * One uploaded object against its slot's rules. `expectedExt` is the extension the capture ticket fixed when the
 * upload URL was signed, so a slot can't switch type between signing and commit.
 */
export function checkTwinObject(
  slot: TwinSlot,
  obj: { storedMime: unknown; bytes: number; head: Uint8Array; expectedExt: string },
): ObjectCheck {
  const photo = isPhotoSlot(slot);
  const min = photo ? TWIN_LIMITS.photoMinBytes : TWIN_LIMITS.voiceMinBytes;
  const max = photo ? TWIN_LIMITS.photoMaxBytes : TWIN_LIMITS.voiceMaxBytes;
  if (!Number.isFinite(obj.bytes) || obj.bytes < min) return { ok: false, status: 400, reason: 'too_small' };
  if (obj.bytes > max) return { ok: false, status: 413, reason: 'too_large' };
  const ext = extForSlotMime(slot, obj.storedMime);
  if (!ext || ext !== obj.expectedExt) return { ok: false, status: 415, reason: 'unsupported_type' };
  const sniffed = sniffMime(obj.head);
  if (!sniffed || extForSlotMime(slot, sniffed) !== ext) return { ok: false, status: 415, reason: 'content_mismatch' };
  return { ok: true, mime: baseMime(obj.storedMime), ext };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DIGITS_RE = /^\d{4,12}$/;

function isIso(v: unknown): v is string {
  return typeof v === 'string' && ISO_RE.test(v) && Number.isFinite(Date.parse(v));
}

function extOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot + 1) : '';
}

/** The object entry iff its path is exactly the derived path for this user, capture and slot. */
function parseObject(raw: unknown, uid: string, captureId: string, slot: TwinSlot): TwinObject | null {
  const o = raw as Partial<TwinObject> | null;
  if (!o || typeof o !== 'object' || typeof o.path !== 'string' || !isOwnTwinPath(uid, o.path)) return null;
  let expected: string;
  try {
    expected = twinCapturePath(uid, captureId, slot, extOf(o.path));
  } catch {
    return null;
  }
  if (o.path !== expected || typeof o.mime !== 'string' || extForSlotMime(slot, o.mime) !== extOf(o.path)) return null;
  if (typeof o.bytes !== 'number' || !Number.isFinite(o.bytes) || o.bytes <= 0) return null;
  return { path: o.path, mime: o.mime, bytes: o.bytes };
}

/** A manifest read back from storage, rebuilt field by field — or null when anything is off. */
export function parseManifest(raw: unknown, uid: string): TwinManifest | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || m.v !== 1 || m.userId !== uid) return null;
  const captureId = m.captureId;
  if (!isCaptureId(captureId)) return null;
  if (!isIso(m.committedAt)) return null;
  const c = m.consent as Record<string, unknown> | null;
  if (!c || typeof c.version !== 'string' || !c.version || !isIso(c.acceptedAt) || !isIso(c.recordedAt)) return null;
  const p = m.photos as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') return null;
  const photos = {} as Record<TwinPhotoSlot, TwinObject>;
  for (const slot of TWIN_PHOTO_SLOTS) {
    const obj = parseObject(p[slot], uid, captureId, slot);
    if (!obj) return null;
    photos[slot] = obj;
  }
  let voice: TwinManifest['voice'] = null;
  if (m.voice !== null) {
    const obj = parseObject(m.voice, uid, captureId, 'voice');
    const secs = (m.voice as { seconds?: unknown } | undefined)?.seconds;
    if (!obj || (secs !== null && (typeof secs !== 'number' || !Number.isFinite(secs) || secs < 0))) return null;
    voice = { ...obj, seconds: secs as number | null };
  }
  if (typeof m.digits !== 'string' || !DIGITS_RE.test(m.digits)) return null;
  if (m.voiceVerified !== false) return null;
  if (m.via !== 'session' && m.via !== 'handoff') return null;
  return {
    v: 1,
    userId: uid,
    captureId,
    committedAt: m.committedAt,
    consent: { version: c.version, acceptedAt: c.acceptedAt, recordedAt: c.recordedAt },
    photos,
    voice,
    digits: m.digits,
    voiceVerified: false,
    providerRefs: {},
    via: m.via,
  };
}

/** The manifest a commit writes — every field explicit, so parseManifest(buildManifest(x)) round-trips exactly. */
export function buildManifest(input: {
  userId: string;
  captureId: string;
  photos: Record<TwinPhotoSlot, TwinObject>;
  voice: TwinObject | null;
  voiceSeconds: number | null;
  digits: string;
  consent: { version: string; acceptedAt: string };
  via: TwinManifest['via'];
  now: Date;
}): TwinManifest {
  const at = input.now.toISOString();
  return {
    v: 1,
    userId: input.userId,
    captureId: input.captureId,
    committedAt: at,
    consent: { version: input.consent.version, acceptedAt: input.consent.acceptedAt, recordedAt: at },
    photos: { front: { ...input.photos.front }, left: { ...input.photos.left }, right: { ...input.photos.right } },
    voice: input.voice ? { ...input.voice, seconds: input.voiceSeconds } : null,
    digits: input.digits,
    voiceVerified: false,
    providerRefs: {},
    via: input.via,
  };
}
