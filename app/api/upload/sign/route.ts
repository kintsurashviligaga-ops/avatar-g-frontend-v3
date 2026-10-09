import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { UPLOAD_MAX_BYTES, allowedUploadMime, uploadExtFor } from '@/lib/uploads/policy';

/**
 * POST /api/upload/sign — issue a signed UPLOAD URL so the browser can PUT a large
 * file (audio / video / big image) DIRECTLY to Supabase, BYPASSING Vercel's ~4.5MB
 * function-body limit. (The data-URL-in-JSON path caps out around 3MB — a real song
 * returns "FUNCTION_PAYLOAD_TOO_LARGE".) Returns the upload token + a readable signed
 * URL for the same path (valid once the upload lands), which downstream providers
 * (Replicate MusicGen melody, etc.) can fetch.
 *
 * Tiny request/response — no file bytes pass through this function.
 *
 * AUTH REQUIRED. See the note in POST: this used to be open, and it mints a service-role write token.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const BUCKET = process.env.UPLOAD_BUCKET || 'uploads';

export async function POST(req: NextRequest) {
  // ⚠️ THIS ROUTE HAD NO AUTH AND NO RATE LIMIT, and what it hands out is a SERVICE-ROLE signed
  // upload URL.
  //
  // Anyone on the internet could POST here and get a token that writes arbitrary bytes into the
  // `uploads` bucket — unlimited, unattributed, at the operator's storage cost. It is also the door
  // every editor and studio goes through, so the hole sat on the hottest path in the product rather
  // than in a forgotten corner. The sibling /api/upload has required auth all along; this one, added
  // later to bypass the 4.5MB body limit, never got the same gate.
  //
  // Two of them now. Auth first, so every object written is attributable to a real account. Then a
  // rate limit, because a signed-in user can still loop: WRITE (20/min) is ample for a twelve-clip
  // montage and useless for filling a bucket.
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rl) return rl;

  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  // ⚠️ ANY CONTENT TYPE USED TO GET A TOKEN, AT ANY SIZE. Held to the shared upload policy now: images, video and
  // audio only (415), and a declared size over the 50 MB cap is refused here (413) rather than after a long upload.
  // The bucket enforces the same list and cap on the PUT itself (migration 20261008c), since no route sees those bytes.
  const body = (await req.json().catch(() => ({}))) as { contentType?: unknown; size?: unknown; name?: unknown };
  const contentType = allowedUploadMime(
    typeof body.contentType === 'string' ? body.contentType : '',
    typeof body.name === 'string' ? body.name : null,
  );
  if (!contentType) {
    return NextResponse.json({ error: 'unsupported file type (images, video and audio only)' }, { status: 415 });
  }
  if (body.size !== undefined && body.size !== null) {
    const size = Number(body.size);
    if (!Number.isFinite(size) || size < 0 || size > UPLOAD_MAX_BYTES) {
      return NextResponse.json({ error: 'file too large (50MB max)' }, { status: 413 });
    }
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'storage not configured' }, { status: 502 });
  }

  // OWNER-SCOPED PATH, matching /api/upload. An object now says who wrote it, so abuse is traceable
  // and a per-user cleanup is possible; the random suffix keeps concurrent uploads from colliding.
  const path = `omni-uploads/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${uploadExtFor(contentType)}`;
  const { data: up, error: upErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (upErr || !up) {
    return NextResponse.json({ error: upErr?.message || 'could not create upload url' }, { status: 502 });
  }
  // The readable URL is signed by the consumer AFTER the upload lands (an object must
  // exist before it can be signed), so we return just the upload handle + its path.
  return NextResponse.json({
    bucket: BUCKET,
    path,
    token: up.token,
    signedUrl: up.signedUrl,
    // The type to PUT the bytes with — the bucket only accepts allowlisted types, so the browser must not
    // fall back to an empty `file.type` / octet-stream on the upload itself.
    contentType,
  });
}
