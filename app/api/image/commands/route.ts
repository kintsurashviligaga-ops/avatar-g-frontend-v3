import { NextRequest } from 'next/server';
import { requireAuthenticatedUser, imageBody, json, errorResponse } from '@/lib/image/studio/http';
import { imageCommand } from '@/lib/image/studio/commands';
import { imageQuoteTool, type ImageQuote } from '@/lib/image/studio/agentTool';
import { bindTools } from '@/lib/agent/tools/registry';
import { ImageError } from '@/lib/image/studio/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuthenticatedUser(req, true);
    if ('response' in ctx) return ctx.response;
    const draft = imageCommand(await imageBody(req));
    let quote: ImageQuote | undefined;
    const [tool] = bindTools([imageQuoteTool], { userId: ctx.userId, media: true, imageDraft: draft,
      imageDeps: ctx.deps, onImageQuote: (result: ImageQuote) => { quote = result; } });
    const observation = await tool!.run({});
    if (!quote) throw new ImageError('validation_failed', (observation as { message?: string }).message ?? 'The image quote could not be prepared.');
    return json(quote);
  } catch (e) { return errorResponse(e); }
}
