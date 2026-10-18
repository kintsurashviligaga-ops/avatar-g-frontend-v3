import { NextRequest } from 'next/server';
import { cancelImage } from '@/lib/image/studio/engine';
import { requireAuthenticatedUser, json, errorResponse } from '@/lib/image/studio/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requireAuthenticatedUser(req);
    if ('response' in context) return context.response;
    return json(await cancelImage(context.deps, context.userId, params.id));
  } catch (e) { return errorResponse(e); }
}
