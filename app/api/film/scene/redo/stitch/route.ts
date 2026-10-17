/**
 * POST /api/film/scene/redo/stitch { filmTokenId, ordinal } — cut a redone scene (POST /api/film/scene/redo, once it reads
 * 'ready') into the caller's film: the film's last stitch with that scene's clip replaced, or put into the gap a failed scene
 * left, with the same music, narration and choices. The scene's price already covered it: this stitch charges nothing and
 * spends none of the film's own stitch waivers. The film's Library row then holds the new cut.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { stitchSceneRedo } from '@/lib/chat/filmSceneRedoFlow';
import { liveRedoDeps } from '@/lib/chat/filmSceneRedoLive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The stitch runs in this function (the same ffmpeg stitch as /api/video/assemble, whose limit this matches).
export const maxDuration = 600;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (mustSignInToGenerate(user?.id) || !user?.id) return NextResponse.json(signInToGenerateBody(), { status: 401 });
  const limited = await checkRateLimitByKey(user.id, RATE_LIMITS.EXPENSIVE);
  if (limited) return limited;
  let body: { filmTokenId?: unknown; ordinal?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const out = await stitchSceneRedo(user.id, { tokenId: body?.filmTokenId, ordinal: body?.ordinal }, liveRedoDeps(new URL(req.url).origin));
  return NextResponse.json(out.body, { status: out.status });
}
