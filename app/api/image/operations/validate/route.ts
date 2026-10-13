import { NextRequest } from 'next/server';
import { parseImageRequest } from '@/lib/image/studio/contracts';
import { validateCapability } from '@/lib/image/studio/capabilities';
import { requireAuthenticatedUser, imageBody, json, errorResponse } from '@/lib/image/studio/http';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try {
    const context = await requireAuthenticatedUser(req);
    if ('response' in context) return context.response;
    const request = parseImageRequest(await imageBody(req));
    validateCapability(request, context.deps.transport);
    return json({ ok: true, request, referenceOwnershipChecked: false, requiresQuote: true });
  } catch (e) { return errorResponse(e); }
}
