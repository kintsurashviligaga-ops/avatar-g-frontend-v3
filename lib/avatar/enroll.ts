/**
 * enrollSelfieAvatar — the shared core behind Live-Avatar enrollment, callable for a userId resolved
 * EITHER from the caller's session (POST /api/avatar/enroll) OR from a verified cross-device handoff token
 * (POST /api/avatar/handoff/complete, where the mobile device has no session). Uploads the selfie to the
 * public `avatars` bucket, inserts an `avatar_assets` row (2D poster, status='ready'), and links it as the
 * profile's core avatar. Service-role throughout — the CALLER is responsible for authorizing the userId.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 8 * 1024 * 1024;

export type EnrollResult =
  | { ok: true; url: string; avatarAssetId: string }
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

  const svc = createServiceRoleClient();
  const ts = Date.now();
  const path = `${userId}/live-avatar-${ts}.${EXT[mime]}`;
  const { error: upErr } = await svc.storage.from('avatars').upload(path, buf, { contentType: mime, upsert: true });
  if (upErr) return { ok: false, status: 500, error: 'upload failed' };
  const publicUrl = `${svc.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${ts}`;

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
  if (insErr || !asset) return { ok: false, status: 500, error: 'save failed' };

  const { error: linkErr } = await svc
    .from('profiles')
    .upsert({ id: userId, core_avatar_id: asset.id, avatar_status: 'ready', avatar_updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (linkErr) return { ok: false, status: 500, error: 'link failed' };

  return { ok: true, url: publicUrl, avatarAssetId: asset.id };
}
