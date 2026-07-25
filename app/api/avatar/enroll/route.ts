/**
 * POST /api/avatar/enroll — enroll the user's LIVE-AVATAR selfie (the fast 2D path).
 *
 * This is the lightweight enrollment behind "Live Avatar Voice Mode": a single selfie frame becomes the
 * user's core avatar POSTER, shown (audio-reactive) during the Gemini Live session and usable as the photo
 * avatar for the LiveAvatar real-time tier. It deliberately does NOT run the heavy 3D-scan builder
 * (avatar/create → GLB) — for a talking-head Live session a 2D poster is all that's needed.
 *
 * Authed. Body: { dataUrl: "data:image/…;base64,…" }. Uploads via the SERVICE ROLE to the PUBLIC `avatars`
 * bucket (permanent URL), inserts an `avatar_assets` row (status='ready', poster_url), and links it as the
 * profile's core avatar (profiles.core_avatar_id + avatar_status). Returns { url, avatarAssetId }.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024; // a selfie frame — generous, still bounded
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(req: Request) {
  try {
    const { user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // A cost-light DB write, but bound it so a script can't spam avatar rows/storage.
    const limited = await checkRateLimit(req as unknown as import('next/server').NextRequest, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as { dataUrl?: string } | null;
    const m = body?.dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
    const mime = m?.[1];
    const b64 = m?.[2];
    if (!mime || !b64) return NextResponse.json({ error: 'no image' }, { status: 400 });
    if (!MIMES.has(mime)) return NextResponse.json({ error: 'unsupported type' }, { status: 415 });
    const buf = Buffer.from(b64, 'base64');
    if (buf.byteLength < 256) return NextResponse.json({ error: 'empty image' }, { status: 400 });
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: 'too large (max 8MB)' }, { status: 413 });

    const svc = createServiceRoleClient();
    const ts = Date.now();
    const path = `${user.id}/live-avatar-${ts}.${EXT[mime]}`;
    const { error: upErr } = await svc.storage.from('avatars').upload(path, buf, { contentType: mime, upsert: true });
    if (upErr) return NextResponse.json({ error: 'upload failed' }, { status: 500 });
    const publicUrl = `${svc.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${ts}`;

    // Create the avatar asset. selfie_pack/fast are the CHECK-allowed values closest to a 2D selfie poster;
    // status='ready' because the poster is immediately usable (no async 3D render to wait on).
    const { data: asset, error: insErr } = await svc
      .from('avatar_assets')
      .insert({
        user_id: user.id,
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
    if (insErr || !asset) return NextResponse.json({ error: 'save failed' }, { status: 500 });

    // Link it as the profile's CORE avatar so the Live session loads it. Upsert (the profiles row may not
    // exist for every account — see profile/avatar route rationale).
    const { error: linkErr } = await svc
      .from('profiles')
      .upsert({ id: user.id, core_avatar_id: asset.id, avatar_status: 'ready', avatar_updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (linkErr) return NextResponse.json({ error: 'link failed' }, { status: 500 });

    return NextResponse.json({ url: publicUrl, avatarAssetId: asset.id });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
