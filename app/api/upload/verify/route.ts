import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { UPLOAD_MAX_BYTES } from '@/lib/uploads/policy';
import { sniffMatches, type SniffKind } from '@/lib/uploads/sniff';
import { ownsUploadObject, uploadBucket } from '@/lib/security/callerMedia';

/**
 * POST /api/upload/verify — is the object the browser just PUT through a signed upload URL really what the user
 * attached? Body `{ path, kind: 'video' | 'audio' | 'image' }`. Signed in, own folder only.
 *
 * ⚠️ NO ROUTE SEES THE BYTES OF A SIGNED UPLOAD. /api/upload/sign hands the browser a direct PUT to storage, so the
 * declared type (and the file's name) was all anything downstream ever knew about an attachment. This reads the first
 * bytes of the stored object (lib/uploads/sniff) and its real size, and refuses — removing the object, so a refused file
 * leaves no orphan — anything that cannot be the attached kind or is over the 50 MB cap. The chat marks a file Ready
 * only after this answers ok; a failure names the file.
 *
 * Answers: 200 { ok, path, kind, format, size } · 400 bad body · 401 · 403 not your object · 404 not stored ·
 * 413 too large (removed) · 422 { error: 'content_mismatch', format } (removed) · 502 storage unreachable.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const KINDS: readonly SniffKind[] = ['video', 'audio', 'image'];
/** Enough for every signature lib/uploads/sniff knows (an MPEG-TS check needs 189 bytes). */
const HEAD_BYTES = 4096;

/** The first `max` bytes of a response body, without downloading the rest when the server ignored the Range. */
async function headBytes(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer()).slice(0, max);
  const parts: Uint8Array[] = [];
  let got = 0;
  try {
    while (got < max) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      parts.push(value);
      got += value.length;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(got, max));
  let at = 0;
  for (const p of parts) {
    const take = Math.min(p.length, out.length - at);
    out.set(p.subarray(0, take), at);
    at += take;
    if (at >= out.length) break;
  }
  return out;
}

/** The object's full size from a 206's Content-Range (`bytes 0-4095/123456`), else from a 200's Content-Length. */
function totalSize(res: Response): number | null {
  const range = res.headers.get('content-range');
  const m = range ? /\/(\d+)\s*$/.exec(range) : null;
  if (m) return Number(m[1]);
  if (res.status === 200) {
    const len = Number(res.headers.get('content-length'));
    return Number.isFinite(len) && len > 0 ? len : null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;

  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { path?: unknown; kind?: unknown };
  const path = typeof body.path === 'string' ? body.path.trim() : '';
  const kind = KINDS.find((k) => k === body.kind);
  if (!path || !kind) return NextResponse.json({ error: 'path and kind required' }, { status: 400 });
  if (!ownsUploadObject(path, user.id)) return NextResponse.json({ error: 'not your file' }, { status: 403 });

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'storage not configured' }, { status: 502 });
  }
  const bucket = uploadBucket();
  const store = admin.storage.from(bucket);
  const { data: signed, error: signErr } = await store.createSignedUrl(path, 60);
  if (signErr || !signed?.signedUrl) {
    // An object that does not exist cannot be signed: the upload never landed.
    return NextResponse.json({ error: 'not stored' }, { status: 404 });
  }

  let res: Response;
  try {
    res = await fetch(signed.signedUrl, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    return NextResponse.json({ error: 'storage unreachable' }, { status: 502 });
  }
  if (res.status === 404 || res.status === 400) return NextResponse.json({ error: 'not stored' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: 'storage unreachable' }, { status: 502 });

  const size = totalSize(res);
  const head = await headBytes(res, HEAD_BYTES);
  const refuse = async (status: number, payload: Record<string, unknown>) => {
    await store.remove([path]).catch(() => {});
    return NextResponse.json(payload, { status });
  };
  if (size !== null && size > UPLOAD_MAX_BYTES) return refuse(413, { error: 'file too large (50MB max)' });
  if (head.length === 0) return refuse(422, { error: 'content_mismatch', format: null });
  const match = sniffMatches(head, kind);
  if (!match.ok) return refuse(422, { error: 'content_mismatch', format: match.format });
  return NextResponse.json({ ok: true, path, kind, format: match.format, size });
}
