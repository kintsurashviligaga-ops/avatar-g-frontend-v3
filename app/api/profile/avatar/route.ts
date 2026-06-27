/**
 * POST /api/profile/avatar — upload a profile photo.
 * Authed (cookie or Bearer). Body: { dataUrl: "data:image/...;base64,…" }. Validates the
 * mime + 5MB cap, uploads via the SERVICE ROLE to the public `avatars` bucket
 * (avatars/{userId}/avatar-<ts>.<ext>), writes profiles.avatar_url, returns { url }.
 * Service-role upload means no per-user storage RLS is needed; the route is the gate.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function POST(req: Request) {
  try {
    const { user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { dataUrl?: string } | null;
    const m = body?.dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
    const mime = m?.[1];
    const b64 = m?.[2];
    if (!mime || !b64) return NextResponse.json({ error: 'no image' }, { status: 400 });
    if (!MIMES.has(mime)) return NextResponse.json({ error: 'unsupported type' }, { status: 415 });
    const buf = Buffer.from(b64, 'base64');
    if (buf.byteLength < 64) return NextResponse.json({ error: 'empty image' }, { status: 400 });
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: 'too large (max 5MB)' }, { status: 413 });

    const svc = createServiceRoleClient();
    const path = `${user.id}/avatar-${Date.now()}.${EXT[mime]}`;
    const { error: upErr } = await svc.storage.from('avatars').upload(path, buf, { contentType: mime, upsert: true });
    if (upErr) return NextResponse.json({ error: 'upload failed' }, { status: 500 });

    const url = svc.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    await svc.from('profiles').update({ avatar_url: url }).eq('id', user.id);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
