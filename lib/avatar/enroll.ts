/**
 * enrollSelfieAvatar — the shared core behind Live-Avatar enrollment, callable for a userId resolved EITHER
 * from the caller's session (POST /api/avatar/enroll) OR from a verified cross-device handoff token (POST
 * /api/avatar/handoff/complete). Service-role throughout — the CALLER authorizes the userId.
 *
 * ⚠️ PRIVATE SINCE 2026-10-24 (the owner's P0 correction task, phase 2): the selfie used to be the PUBLIC
 * `avatars/live-avatars/<uid>/poster.jpg` — a face anyone could fetch from the user id alone. It is now saved by
 * lib/avatar/liveAvatar.ts into the private `twins` bucket with a stable avatar id, signed URLs only. No database write:
 * production has no `avatar_assets` table or `profiles.core_avatar_id` (schema-drift snapshot), and the old best-effort
 * insert there always failed.
 *
 * The VOICE SAMPLE is a voiceprint nothing renders, so it goes to the same PRIVATE `twins` bucket at
 * `twins/<uid>/voice.<ext>` — NOT `uploads`, whose bare paths many routes sign for any caller (see
 * lib/avatar/twinStorage.ts). Legacy public samples (`avatars/live-avatars/<uid>/voice.*`) are moved by
 * scripts/avatar/migrate-live-avatar-voice.mjs.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ensureBucket } from '@/lib/orchestrator/storage-adapter';
import { TWIN_PRIVATE_BUCKET, TWIN_VOICE_EXTS, twinVoicePath } from '@/lib/avatar/twinStorage';
import { twinStorageClient, type TwinStorageClient } from '@/lib/twin/store';
import { describeLiveAvatar, saveLiveAvatar, type LiveAvatarSource, type LiveAvatarView } from './liveAvatar';
import { decodeImageDataUrl } from './livePhoto';

export { TWIN_PRIVATE_BUCKET, twinVoicePath };

/** The LEGACY public bucket of the pre-2026-10-24 poster — only read to move it private, and removed by a save. */
export const LIVE_AVATAR_BUCKET = 'avatars';
/** The legacy public poster object (lib/avatar/liveAvatar.ts moves it into private storage). */
export function liveAvatarPath(userId: string): string {
  return `live-avatars/${userId}/poster.jpg`;
}

const VOICE_MIMES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-m4a']);
const MAX_VOICE_BYTES = 16 * 1024 * 1024;

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * The twin bucket exists AND is private — or the voice write is skipped. It is self-provisioned (private) on
 * first use; if it already exists it must REPORT `public: false`, because a hand-made public `twins` bucket
 * would publish every voiceprint. supabase-js storage RETURNS `{ error }` — every answer is read, not caught.
 */
async function twinBucketIsPrivate(svc: ServiceClient): Promise<boolean> {
  const made = await ensureBucket(svc as unknown as Parameters<typeof ensureBucket>[0], TWIN_PRIVATE_BUCKET);
  if (made === 'created') return true; // ensureBucket only ever creates with public:false
  const { data, error } = await svc.storage.getBucket(TWIN_PRIVATE_BUCKET);
  if (error || !data) {
    console.warn('[avatar/enroll] twin bucket unavailable — voice sample not stored:', error?.message ?? 'not found');
    return false;
  }
  if (data.public !== false) {
    console.error(`[avatar/enroll] ⚠️ bucket "${TWIN_PRIVATE_BUCKET}" is PUBLIC — refusing to store a voiceprint in it. Make it private.`);
    return false;
  }
  return true;
}

/**
 * Store the enrollment VOICE SAMPLE in the PRIVATE twin bucket (never public, never a public URL; the generic
 * signers refuse this bucket, so a later reader signs it itself, scoped to the owner). This is deliberately
 * STORAGE-ONLY: enrollment must NOT kick off any background voice-clone TRAINING / render (that surfaced as a
 * "training" job in the corner and is not what the Save button is for). The sample is simply persisted so it
 * can be used later on an explicit action. ONE current sample per user: a re-enroll from another browser
 * (webm → m4a) removes the older sibling, so no stale voiceprint lingers. Best-effort: any miss returns
 * { ok:false } and NEVER throws, so it can never fail the selfie enrollment.
 */
export async function storeLiveAvatarVoice(userId: string, voiceDataUrl: string): Promise<{ ok: boolean; bucket?: string; path?: string }> {
  try {
    // Tolerant of a codec-parameterized media type — MediaRecorder on Chrome/Edge/Android/Firefox emits
    // e.g. `data:audio/webm;codecs=opus;base64,…`, so capture the whole type up to `;base64,` (it may itself
    // contain `;codecs=…`) and gate the allowlist/ext on the BASE type only (`audio/webm`). A `[^;]+` capture
    // here would drop the majority of real recordings (Safari's bare audio/mp4 was the only one that stored).
    const m = typeof voiceDataUrl === 'string' ? voiceDataUrl.match(/^data:([^,]+);base64,(.+)$/) : null;
    const rawType = m?.[1]?.toLowerCase();
    const b64 = m?.[2];
    const mime = rawType?.split(';')[0]?.trim();
    if (!mime || !b64 || !VOICE_MIMES.has(mime)) return { ok: false };
    const buf = Buffer.from(b64, 'base64');
    if (buf.byteLength < 256 || buf.byteLength > MAX_VOICE_BYTES) return { ok: false };
    const ext = /mp4|m4a/i.test(mime) ? 'm4a' : /mpeg|mp3/i.test(mime) ? 'mp3' : /ogg/i.test(mime) ? 'ogg' : /wav/i.test(mime) ? 'wav' : 'webm';
    const svc = createServiceRoleClient();
    if (!(await twinBucketIsPrivate(svc))) return { ok: false };
    const path = twinVoicePath(userId, ext);
    const twins = svc.storage.from(TWIN_PRIVATE_BUCKET);
    const { error } = await twins.upload(path, buf, { contentType: mime, upsert: true });
    if (error) {
      console.warn('[avatar/enroll] voice storage upload skipped:', error.message);
      return { ok: false };
    }
    // Only AFTER the new sample landed: drop the other-extension siblings (removing a missing path is a no-op).
    // A miss is logged, never fatal — the new sample is stored either way.
    const stale = TWIN_VOICE_EXTS.filter((e) => e !== ext).map((e) => twinVoicePath(userId, e));
    try {
      const { error: rmErr } = await twins.remove(stale);
      if (rmErr) console.warn('[avatar/enroll] older voice sample cleanup skipped:', rmErr.message);
    } catch (e) {
      console.warn('[avatar/enroll] older voice sample cleanup skipped:', e instanceof Error ? e.message : e);
    }
    return { ok: true, bucket: TWIN_PRIVATE_BUCKET, path };
  } catch (e) {
    console.warn('[avatar/enroll] voice storage skipped:', e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

export type EnrollResult =
  | { ok: true; url: string; avatarAssetId: string | null; avatar: LiveAvatarView }
  | { ok: false; status: number; error: string };

/**
 * Save the selfie as the user's active Live Avatar — PRIVATE (lib/avatar/liveAvatar.ts): checked by its bytes, upright,
 * metadata stripped, a stable avatar id, a short-lived signed URL back. `avatarAssetId` stays for older callers and is
 * now the avatar id. The old public poster is removed by the save.
 */
export async function enrollSelfieAvatar(userId: string, dataUrl: string, source: LiveAvatarSource = 'camera'): Promise<EnrollResult> {
  const decoded = decodeImageDataUrl(dataUrl);
  if (!decoded) return { ok: false, status: 400, error: 'no_image' };
  let sb: TwinStorageClient;
  try {
    sb = twinStorageClient();
  } catch (e) {
    console.error('[avatar/enroll] service client unavailable:', e instanceof Error ? e.message : e);
    return { ok: false, status: 503, error: 'storage_unavailable' };
  }
  const saved = await saveLiveAvatar(sb, userId, { mime: decoded.mime, bytes: decoded.bytes, source });
  if (!saved.ok) return { ok: false, status: saved.status, error: saved.error };
  try {
    const avatar = await describeLiveAvatar(sb, saved.manifest);
    return { ok: true, url: avatar.photoUrl, avatarAssetId: avatar.id, avatar };
  } catch {
    return { ok: false, status: 503, error: 'storage_unavailable' };
  }
}
