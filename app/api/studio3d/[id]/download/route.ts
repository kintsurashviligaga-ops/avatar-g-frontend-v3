/**
 * GET /api/studio3d/:id/download?format=glb|obj|stl&mm=100 — a finished model in the picked format (free).
 * OBJ comes as a .zip (obj + mtl + textures); STL is Z-up millimetres, `mm` tall (10–500, default 100).
 * Flag STUDIO_3D_V2; 404 while off. Owner only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { studio3dContext } from '@/lib/studio3d/server/routeAuth';
import { downloadJob } from '@/lib/studio3d/server/service';
import { contentDisposition } from '@/lib/studio3d/server/download';
import { studio3dDeps } from '@/lib/studio3d/server/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await studio3dContext(req);
  if (!ctx.ok) return ctx.response;
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  const r = await downloadJob(studio3dDeps(), ctx.userId, id, q.get('format') ?? 'glb', q.get('mm') ?? undefined);
  if (!r.ok) return NextResponse.json({ error: r.code }, { status: r.status });
  return new NextResponse(Buffer.from(r.file.bytes), {
    headers: {
      'content-type': r.file.contentType,
      'content-disposition': contentDisposition(r.file.filename),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
