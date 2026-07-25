/**
 * enrollSelfieAvatar — the shared core behind Live-Avatar enrollment, callable for a userId resolved EITHER
 * from the caller's session (POST /api/avatar/enroll) OR from a verified cross-device handoff token (POST
 * /api/avatar/handoff/complete). Service-role throughout — the CALLER authorizes the userId.
 *
 * STORAGE-FIRST (robust to a missing schema): the selfie is written to a DETERMINISTIC object in the public
 * `avatars` bucket — that object IS the source of truth. The `avatar_assets` table + `profiles.core_avatar_id`
 * columns are only a best-effort richness layer: prod does NOT have them (the 20260224 migration isn't
 * applied — the DDL channel is unavailable), so those writes are wrapped and their failure NEVER fails
 * enrollment. avatar/core reads the poster back from the same storage path. This is exactly why the earlier
 * version hung on "save failed": it hard-depended on a table that doesn't exist.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export const LIVE_AVATAR_BUCKET = 'avatars';
/** Deterministic per-user poster object — one file, overwritten on re-enroll (upsert). */
export function liveAvatarPath(userId: string): string {
  return `live-avatars/${userId}/poster.jpg`;
}
/** Deterministic per-user voice-sample object, stored ALONGSIDE the poster in the same live-avatar folder. */
export function liveAvatarVoicePath(userId: string, ext: string): string {
  return `live-avatars/${userId}/voice.${ext}`;
}

const VOICE_MIMES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-m4a']);
const MAX_VOICE_BYTES = 16 * 1024 * 1024;

/**
 * Store the enrollment VOICE SAMPLE next to the poster in the public `avatars` bucket. This is deliberately
 * STORAGE-ONLY: enrollment must NOT kick off any background voice-clone TRAINING / render (that surfaced as a
 * "training" job in the corner and is not what the Save button is for). The sample is simply persisted so it
 * can be used later on an explicit action. Best-effort: any miss returns { ok:false } and NEVER throws, so it
 * can never fail the selfie enrollment.
 */
export async function storeLiveAvatarVoice(userId: string, voiceDataUrl: string): Promise<{ ok: boolean; url?: string }> {
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
    const path = liveAvatarVoicePath(userId, ext);
    const { error } = await svc.storage.from(LIVE_AVATAR_BUCKET).upload(path, buf, { contentType: mime, upsert: true });
    if (error) {
      console.warn('[avatar/enroll] voice storage upload skipped:', error.message);
      return { ok: false };
    }
    return { ok: true, url: svc.storage.from(LIVE_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl };
  } catch (e) {
    console.warn('[avatar/enroll] voice storage skipped:', e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

export type EnrollResult =
  | { ok: true; url: string; avatarAssetId: string | null }
  | { ok: false; status: number; error: string };

export async function enrollSelfieAvatar(userId: string, dataUrl: string): Promise<EnrollResult> {
  const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:([^;]+);base64,(.+)$/) : null;
  const mime = m?.[1];
  const b64 = m?.[2];
  if (!mime || !b64) return { ok: false, status: 400, error: 'no image' };
  if (!MIMES.has(mime)) return { ok: false, status: 415, error: 'unsupported type' };
  const buf = Buffer.from(b64, 'base64');
  if (buf.byteLength < 256) return { ok: false, status: 400, error: 'empty image' };
  if (buf.byteLength > MAX_BYTES) return { ok: false, status: 413, error: 'too large (max 8MB)' };

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch (e) {
    console.error('[avatar/enroll] service client unavailable:', e instanceof Error ? e.message : e);
    return { ok: false, status: 503, error: 'storage unavailable' };
  }

  // 1) SOURCE OF TRUTH — write the selfie to the deterministic public path. contentType drives playback, so
  //    a fixed `.jpg` name is fine even for png/webp. upsert overwrites the previous poster on re-enroll.
  const ts = Date.now();
  const path = liveAvatarPath(userId);
  const { error: upErr } = await svc.storage.from(LIVE_AVATAR_BUCKET).upload(path, buf, { contentType: mime, upsert: true });
  if (upErr) {
    console.error('[avatar/enroll] storage upload FAILED:', upErr.message);
    return { ok: false, status: 502, error: `upload failed: ${upErr.message}` };
  }
  const publicUrl = `${svc.storage.from(LIVE_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl}?v=${ts}`;

  // 2) BEST-EFFORT DB richness — record in avatar_assets + link profiles.core_avatar_id IF that schema
  //    exists. In prod it does not, so these are expected no-ops; the storage object above already carries
  //    the enrollment. A failure here is logged (for observability) but never fails the save.
  let avatarAssetId: string | null = null;
  try {
    const { data: asset, error: insErr } = await svc
      .from('avatar_assets')
      .insert({
        user_id: userId,
        avatar_goal: 'personal',
        avatar_type: 'fast',
        input_method: 'selfie_pack',
        status: 'ready',
        input_urls: [publicUrl],
        poster_url: publicUrl,
        meta: { source: 'live-avatar-enroll' },
      })
      .select('id')
      .single();
    if (insErr) {
      console.warn('[avatar/enroll] avatar_assets insert skipped (schema not provisioned?):', insErr.message);
    } else if (asset) {
      avatarAssetId = asset.id;
      const { error: linkErr } = await svc
        .from('profiles')
        .upsert({ id: userId, core_avatar_id: asset.id, avatar_status: 'ready', avatar_updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (linkErr) console.warn('[avatar/enroll] profiles core_avatar_id link skipped:', linkErr.message);
    }
  } catch (e) {
    console.warn('[avatar/enroll] DB enrich skipped:', e instanceof Error ? e.message : e);
  }

  return { ok: true, url: publicUrl, avatarAssetId };
}
