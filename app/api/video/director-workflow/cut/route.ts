/**
 * POST /api/video/director-workflow/cut — the final cut (Phase 8.3, PR D): the delivered scene clips joined in
 * storyboard order into one film, at the film's resolution, saved to the Library under ONE id per project (a re-cut
 * after "re-do scene 3" replaces it).
 *
 * The cut is FREE. The optional whole-film MUSIC BED (GG 2026-11-14 decision 5) is a Lyria instrumental mixed UNDER the
 * scenes' own dialogue (the dialogue stays at full level: stitch MIX normalize=0, bed at 0.3). It costs the price book's
 * music row for the bed's length, debited when it is made and REFUNDED if the bed or the cut misses.
 *
 * Body: { project, clips: [{ sceneId, url }], music?: { prompt } | null, expectedCredits?, quote?: true }
 *   • quote: true → { musicCredits, bedSeconds } and nothing else (free, so the button shows the right price).
 *   • clips must be OUR OWN storage links (the status route's signed URLs): nothing else is fetched.
 *
 * Order: flag (404) → service switch → rate → parse + rules (free) → every scene has a clip → music price check →
 * [debit → Lyria bed] → cut → Library → [refund on any miss after the debit].
 */
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { composeLyriaBed, lyriaBedPlan, lyriaBedReady } from '@/lib/audio/lyriaBed';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { genjutsuChargeReady, genjutsuChargeRef } from '@/lib/genjutsu/chargeToken';
import { fail } from '@/lib/genjutsu/serverCommon';
import { reportError } from '@/lib/observability/report-error';
import { claimIdempotencyKey, releaseIdempotencyKey } from '@/lib/orchestrator/idempotency';
import { recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { isOwnSupabaseUrl } from '@/lib/security/allowlistedAudioFetch';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { readJson } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { DW_MUSIC_PROMPT_MAX, dwFilmLibraryId, filmSeconds, musicBedCredits, orderedCutClips, type DwCutClip } from '@/lib/video/directorsWorkflow';
import { makeFinalCut } from '@/lib/video/directorsWorkflow/cut.server';
import { checkProject, directorsWorkflowOpenTo } from '@/lib/video/directorsWorkflow/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ROUTE = '/api/video/director-workflow/cut';
const CUT_RATE = { maxRequests: 4, windowMs: 60_000, keyPrefix: 'rl:dw-cut' };
const BUDGET_MS = 270_000;

function parseClips(v: unknown): DwCutClip[] | null {
  if (!Array.isArray(v) || v.length > 20) return null;
  const out: DwCutClip[] = [];
  for (const c of v) {
    if (!c || typeof c !== 'object') return null;
    const { sceneId, url } = c as Record<string, unknown>;
    if (typeof sceneId !== 'string' || typeof url !== 'string' || url.length > 2_000) return null;
    if (!/^https:\/\//i.test(url) || !isOwnSupabaseUrl(url)) return null;
    out.push({ sceneId, url });
  }
  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!directorsWorkflowOpenTo(user)) return fail(404, 'not_found');
  const userId = user!.id;
  const serviceOff = await serviceOffResponse('video');
  if (serviceOff) return serviceOff;
  const limited = await checkRateLimitByKey(userId, CUT_RATE);
  if (limited) return limited;

  const body = (await readJson(req, 512_000)) as Record<string, unknown> | null;
  const checked = checkProject(body?.project);
  if (!checked) return fail(400, 'invalid_project');
  if (checked.problems.length > 0) return fail(422, 'board_has_problems', { problems: checked.problems });
  const { project } = checked;

  const rawMusic = body?.music as Record<string, unknown> | null | undefined;
  const musicAsk = rawMusic && typeof rawMusic.prompt === 'string' && rawMusic.prompt.trim() ? rawMusic.prompt.trim().slice(0, DW_MUSIC_PROMPT_MAX) : null;
  if (rawMusic && !musicAsk) return fail(400, 'invalid_music');
  const total = filmSeconds(project);
  const bedPlan = musicAsk ? lyriaBedPlan(total, true) : null;
  const musicCredits = bedPlan ? musicBedCredits(bedPlan.sec) : 0;
  if (body?.quote === true) {
    return NextResponse.json({ success: true, musicCredits, bedSeconds: bedPlan?.sec ?? 0, musicAvailable: lyriaBedReady() }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const clips = parseClips(body?.clips);
  if (!clips) return fail(400, 'invalid_clips');
  const ordered = orderedCutClips(project, clips);
  if (!ordered.ok) return fail(422, 'scenes_not_delivered', { missing: ordered.missing });
  if (musicAsk && (body?.expectedCredits !== musicCredits)) return fail(409, 'price_changed', { musicCredits });
  if (musicAsk && !lyriaBedReady()) return fail(503, 'music_unavailable', { refunded: false });

  // One cut per project at a time.
  const key = `dw-cut:${project.id}`;
  if (!(await claimIdempotencyKey(userId, key, BUDGET_MS / 1000 + 30))) return fail(409, 'duplicate_request');
  try {
    let charge: { ref: string; credits: number } | null = null;
    const refund = async (why: string): Promise<boolean> => {
      if (!charge) return false;
      const back = await refundDebitByRef(userId, charge.ref, charge.credits).catch(() => null);
      if (!back?.ok) reportError(new Error('director music refund did not land'), { route: ROUTE, ref: charge.ref, why });
      return !!back?.ok;
    };

    let music: { url: string; durationSec: number | null } | null = null;
    if (musicAsk && bedPlan) {
      if (!genjutsuChargeReady()) return fail(503, 'billing_unavailable');
      if (!(await hasSufficientBalance(userId, musicCredits))) return fail(402, 'insufficient_credits', { needed: musicCredits });
      const ref = genjutsuChargeRef(userId, randomUUID());
      const debit = await deductCredits(userId, musicCredits, ref);
      if (!debit.ok) return debit.reason === 'insufficient' ? fail(402, 'insufficient_credits', { needed: musicCredits }) : fail(503, 'billing_unavailable');
      charge = { ref, credits: musicCredits };
      const english = await promptToEnglish(musicAsk, 'music').catch(() => musicAsk);
      const bedUrl = await composeLyriaBed({ prompt: `Instrumental film score: ${english}. No vocals, no singing.`, plan: bedPlan, instrumental: true, folder: 'films' });
      if (!bedUrl) return fail(503, 'music_unavailable', { refunded: await refund('lyria miss') });
      music = { url: bedUrl, durationSec: bedPlan.sec };
    }

    const cut = await makeFinalCut({ project, urls: ordered.urls, music, budgetMs: BUDGET_MS });
    if (!cut.ok) return fail(503, 'cut_failed', { reason: cut.reason, refunded: await refund(`cut ${cut.reason}`) });

    const libraryId = dwFilmLibraryId(project);
    const filed = await recordCompletedFilm({
      id: libraryId, userId, url: cut.url, prompt: (project.logline || project.title).slice(0, 500),
      orientation: project.aspect === '9:16' ? 'vertical' : 'landscape',
      // The PATH is durable: the Library re-signs from bucket + path once the 7-day link expires.
      result: {
        url: cut.url, bucket: 'renders', path: cut.path, bytes: cut.bytes, seconds: cut.seconds, directorProject: project.id,
        version: project.version, scenes: project.scenes.length, resolution: project.resolution, music: !!music,
      },
      subtype: 'director',
    });
    if (!filed) reportError(new Error('director film not filed in the Library'), { route: ROUTE, libraryId });
    return NextResponse.json({
      success: true, url: cut.url, seconds: cut.seconds, libraryId, savedToLibrary: filed, musicCredits: charge?.credits ?? 0, mode: cut.mode,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } finally {
    await releaseIdempotencyKey(userId, key).catch(() => undefined);
  }
}
