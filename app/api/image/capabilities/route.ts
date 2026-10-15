import { NextRequest } from 'next/server';
import { imageModels } from '@/lib/image/studio/capabilities';
import { requireAuthenticatedUser, json, errorResponse } from '@/lib/image/studio/http';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const context = await requireAuthenticatedUser(req);
    if ('response' in context) return context.response;
    return json({ userId: context.userId, models: imageModels(context.deps.transport), liveOperationVerified: false });
  } catch (e) { return errorResponse(e); }
}
