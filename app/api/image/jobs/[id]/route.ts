import { NextRequest } from 'next/server';
import { imageStatus } from '@/lib/image/studio/engine';
import { requireAuthenticatedUser, kickImage, recoverImages, json, errorResponse } from '@/lib/image/studio/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requireAuthenticatedUser(req);
    if ('response' in context) return context.response;
    const status = await imageStatus(context.deps, context.userId, params.id);
    if (status.needsWorker) kickImage(context.deps, params.id);
    recoverImages(context.deps);
    return json(status.view);
  } catch (e) { return errorResponse(e); }
}
