/**
 * POST /api/avatar/studio/plan — the Virtual Studio storyboard and its price, before anything is pressed (free: no
 * provider call, no charge). 404 unless AVATAR_STUDIO_V2 allows this user. Body: the Studio request (lib/avatar/studio
 * request). Answers the scenes (text, direction, estimated seconds, Omni turns), the price per scene and in total, and
 * the plan's warnings (labelled dub, pillared 16:9, …).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { buildStudioPlan } from '@/lib/avatar/studio/plan';
import { parseStudioRequest } from '@/lib/avatar/studio/request';
import { studioBook } from '@/lib/avatar/studio/book';
import { price30s } from '@/lib/avatar/studio/price';
import { studioFail, studioOpenTo } from '@/lib/avatar/studio/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return studioFail('sign_in', 'Sign in to use the studio.', 401);
  if (!(await studioOpenTo(user))) return studioFail('feature_off', 'Not found.', 404);
  const parsed = parseStudioRequest(await req.json().catch(() => null));
  if (!parsed.ok) return studioFail('invalid_request', parsed.errors.join('; '), 400);
  const book = studioBook();
  const built = buildStudioPlan(parsed.value, { book });
  if (!built.ok) return studioFail(built.reason, built.detail, built.reason === 'custom_avatar' ? 422 : 400);
  const { plan } = built;
  return NextResponse.json({
    ok: true,
    book,
    engine: plan.presenter.engine,
    presenterId: plan.presenter.id,
    voiceId: plan.voice?.id ?? null,
    dub: plan.dub,
    format: plan.format,
    compose: plan.compose,
    lang: plan.lang,
    warnings: plan.warnings,
    scenes: plan.scenes.map((s, i) => ({ index: s.index, text: s.text, direction: s.direction, estSec: s.estSec, turns: s.turns.length, credits: plan.quote.scenes[i]!.credits })),
    background: plan.quote.background,
    total: plan.quote.total,
    per30s: { live: price30s('live', book), omni720: price30s('omni', book, '720p'), omni1080: price30s('omni', book, '1080p') },
  });
}
