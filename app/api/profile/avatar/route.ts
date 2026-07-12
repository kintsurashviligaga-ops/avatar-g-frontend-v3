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
    const ts = Date.now();
    const path = `${user.id}/avatar-${ts}.${EXT[mime]}`;
    const { error: upErr } = await svc.storage.from('avatars').upload(path, buf, { contentType: mime, upsert: true });
    if (upErr) return NextResponse.json({ error: 'upload failed' }, { status: 500 });

    // Cache-bust the stored URL with ?v=<ts>: the path is already unique per upload, but the version query
    // forces any CDN/browser that keyed on the bare public URL to re-fetch — no stale avatar after a change.
    const publicUrl = svc.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    const url = `${publicUrl}?v=${ts}`;
    // UPSERT, not update: the per-user profiles row is created by a signup trigger, but that trigger does
    // not fire for every account (pre-trigger users, alt signup paths). A plain .update() then matches ZERO
    // rows and SILENTLY no-ops → the photo shows optimistically but is never persisted → wiped on reload.
    // Upsert on the id PK guarantees the row exists and avatar_url is written; and we now surface a DB-write
    // failure instead of returning a false success (the client reverts the optimistic photo on a non-2xx).
    const { error: dbErr } = await svc.from('profiles').upsert({ id: user.id, avatar_url: url }, { onConflict: 'id' });
    if (dbErr) return NextResponse.json({ error: 'save failed' }, { status: 500 });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
