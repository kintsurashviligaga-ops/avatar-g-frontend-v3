import { NextRequest } from 'next/server';
import { startImage } from '@/lib/image/studio/engine';
import { requireAuthenticatedUser, imageBody, imageDailyBudget, kickImage, json, errorResponse } from '@/lib/image/studio/http';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;
export async function POST(req: NextRequest) {
  try {
    const context = await requireAuthenticatedUser(req, true);
    if ('response' in context) return context.response;
    // Admin service switch (lib/server/serviceSwitches): a switched-off tool is refused here, before any charge.
    const serviceOff = await serviceOffResponse('image');
    if (serviceOff) return serviceOff;
    const body = await imageBody(req);
    imageDailyBudget(context.userId);
    const result = await startImage(context.deps, context.userId, body.plan, body.token, body.confirmed);
    if (result.status === 'queued' || result.status === 'running') kickImage(context.deps, result.jobId);
    return json(result, result.replay ? 200 : 202);
  } catch (e) { return errorResponse(e); }
}
