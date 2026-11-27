/**
 * POST /api/v2/montage/smart/beat — the song's beat grid for the "Auto-cut to the beat" button and the beat ticks on
 * the music row (Phase 8.7). FREE: one ffmpeg decode + the existing onset analysis (lib/services/montage/beatAnalysis).
 *
 *   { url | path } → { ok, durationSec, grid: { bpm, periodSec, phaseSec, confidence } | null }
 *
 * `grid: null` = the song has no clear pulse; the editor says "no clear beat" and never sells even cuts as on-beat.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { analyzeTrack } from '@/lib/services/montage/beatAnalysis';
import { resolveMedia, smartFail, smartOpenTo } from '@/lib/services/montage/smart/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.WRITE, label: 'montage.smart.beat', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return smartFail('sign_in', 'Sign in to use the editor.', 401);
  if (!(await smartOpenTo(user))) return smartFail('feature_off', 'Not found.', 404);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const media = await resolveMedia(body?.url ?? body?.path, user.id);
  if (!media.ok) return smartFail(media.reason === 'not_yours' ? 'media_not_yours' : 'invalid_request', 'That song cannot be read.', media.reason === 'not_yours' ? 403 : 400);
  const a = await analyzeTrack(media.url).catch(() => null);
  if (!a) return smartFail('provider_unavailable', 'The song could not be read.', 502);
  return NextResponse.json({ ok: true, durationSec: a.probe.durationSec, grid: a.grid, charged: 0 });
}
