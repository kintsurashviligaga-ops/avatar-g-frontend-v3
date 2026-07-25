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
