import { NextRequest } from 'next/server';
import { requireAuthenticatedUser, json, errorResponse } from '@/lib/image/studio/http';
import { imageVersions } from '@/lib/image/studio/history';
import { imageHistoryIO } from '@/lib/image/studio/historyLive';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuthenticatedUser(req);
    if ('response' in ctx) return ctx.response;
    return json(await imageVersions(imageHistoryIO(ctx.deps), ctx.userId, (await params).id));
  } catch (e) { return errorResponse(e); }
}
