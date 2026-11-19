/**
 * POST /api/music/producer/place — "Use in Video": put a Music Producer track into a cut Director's Workflow film, at a
 * scene (default: trimmed to that scene) or under the whole film. FREE: our own ffmpeg, no provider call, no charge.
 *
 * Body: { trackId, target: { kind: 'scene', scene } | { kind: 'film' }, span?: 'scene' | 'to_end',
 *         film: { projectId, filmUrl, scenes: [{ id, order, seconds }] } }
 *   • the track must be the caller's own Music Producer track (read back from their recipe, never from the body);
 *   • the film must be OUR OWN storage link (the Director's Workflow cut); nothing else is fetched;
 *   • scene N must exist in the film, or nothing runs (422 no_scene).
 * The new film is saved privately and filed in the Library as a film (subtype director-music); the original film is kept.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { isOwnSupabaseUrl } from '@/lib/security/allowlistedAudioFetch';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { producerAllowed } from '@/lib/music/producer/flag';
import { planCue } from '@/lib/music/producer/placement';
import { parsePlaceBody } from '@/lib/music/producer/placeRequest';
import { liveProducerDeps, RESULTS_BUCKET } from '@/lib/music/producer/live';
import { placeOnFilm } from '@/lib/music/producer/place.server';
import { livePlaceDeps } from '@/lib/music/producer/placeLive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const RATE = { maxRequests: 6, windowMs: 60_000, keyPrefix: 'rl:mp-place' };
const WEEK_SEC = 604_800;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });
export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return fail(401, 'sign_in');
  if (!producerAllowed(await isAdminUserAsync(user))) return fail(404, 'feature_off');
  const off = await serviceOffResponse('music');
  if (off) return off;
  const limited = await checkRateLimitByKey(user.id, RATE);
  if (limited) return limited;

  const body = parsePlaceBody(await req.json().catch(() => null));
  if (!body) return fail(400, 'invalid_request');
  if (!isOwnSupabaseUrl(body.filmUrl)) return fail(400, 'film_not_ours');

  const deps = liveProducerDeps();
  const meta = await deps.loadRecipe(user.id, body.trackId);
  if (!meta) return fail(404, 'not_found');
  const planned = planCue({ scenes: body.scenes, target: body.target, span: body.span, trackSec: meta.durationSec });
  if (!planned.ok) return fail(planned.reason === 'no_scene' ? 422 : 400, planned.reason, { scenes: body.scenes.length });

  const track = await deps.loadAudio(user.id, meta.audioPath).catch(() => null);
  if (!track) return fail(404, 'not_found');
  const placed = await placeOnFilm(livePlaceDeps(), { filmUrl: body.filmUrl, track, cue: planned.cue, budgetMs: 270_000 });
  if (!placed.ok) return fail(503, 'place_failed', { reason: placed.reason });

  const id = `mpfilm_${body.projectId}_${body.trackId.slice(0, 8)}`;
  const path = `music-producer/${user.id}/films/${id}.mp4`;
  const url = await uploadBufferAndSign(RESULTS_BUCKET, path, placed.bytes, 'video/mp4', WEEK_SEC);
  if (!url) return fail(503, 'upload_failed');
  const filed = await recordCompletedFilm({
    id, userId: user.id, url, prompt: meta.spec.brief || null,
    result: { url, bucket: RESULTS_BUCKET, path, directorProject: body.projectId, musicTrack: meta.id, cue: planned.cue },
    subtype: 'director-music',
  }).catch(() => false);
  return NextResponse.json({ ok: true, url, libraryId: id, savedToLibrary: filed, cue: planned.cue, filmHadAudio: placed.filmHadAudio, charged: 0 });
}
