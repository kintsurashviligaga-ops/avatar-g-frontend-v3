import { NextRequest } from 'next/server';
import { quoteImage } from '@/lib/image/studio/engine';
import { requireAuthenticatedUser, imageBody, json, errorResponse } from '@/lib/image/studio/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  try {
    const context = await requireAuthenticatedUser(req, true);
    if ('response' in context) return context.response;
    return json(await quoteImage(context.deps, context.userId, await imageBody(req)));
  } catch (e) { return errorResponse(e); }
}
