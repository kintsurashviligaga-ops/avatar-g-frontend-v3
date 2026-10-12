/**
 * POST /api/video/director/runs — the user's approval: the edited draft is checked against every storyboard rule, frozen
 * (V2) and stored as a run with every shot pending. Nothing is charged or rendered yet; the browser then drives the run
 * with POST …/runs/[id]/advance, and each shot is charged just before its own submit.
 *
 * Body: { storyboard, storyboardApproval?, locale? } with `approvedByUser: true` — the user pressed Approve. Anything the
 * rules refuse is a 400 that lists every problem; nothing is "fixed" on the way (V6).
 *
 * Round 3 (P1): a run started from the studio's board carries the board's approval (lib/video/storyboard/revision →
 * RenderApprovalWire: revision, fingerprint, the approved board). The storyboard is checked against it BEFORE it is frozen
 * or stored (lib/video/director/fromStudio → checkStoryboardApproval): a board edited after the tap, a stale approval, a
 * shot that is not the approved scene's text or length → 400 `revision_mismatch`, nothing stored, nothing charged. A run
 * with no approval (a hand-written document, the planner's draft the user approved whole) is accepted as before: there the
 * document itself is what the user approved and what is frozen.
 *
 * Off unless VIDEO_DIRECTOR_RUNS allows this user (lib/video/director/runServer).
 */
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkStoryboardApproval } from '@/lib/video/director/fromStudio';
import { startRun } from '@/lib/video/director/run';
import { directorErrorResponse, directorRoutesClosed, refuseDirectorCaller } from '@/lib/video/director/runHttp';
import { liveDirectorRunDeps } from '@/lib/video/director/runServer';
import { freeze } from '@/lib/video/director/storyboard';
import type { Storyboard } from '@/lib/video/director/types';
import { describeApprovalRefusal, type RenderApprovalWire } from '@/lib/video/storyboard/revision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** One run renders at most this many shots (the planner's own ceiling): 12 × 8 s at most. */
const MAX_SHOTS = 12;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const closed = directorRoutesClosed();
  if (closed) return closed;
  const { user } = await authedClientFromRequest(req);
  const refused = await refuseDirectorCaller(req, user, RATE_LIMITS.WRITE);
  if (refused || !user) return refused ?? NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { storyboard?: unknown; storyboardApproval?: unknown; locale?: unknown } | null;
  const draft = body?.storyboard as Storyboard | undefined;
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.shots)) {
    return NextResponse.json({ error: 'invalid_input', problems: ['storyboard is required'] }, { status: 400 });
  }
  if (draft.shots.length > MAX_SHOTS) {
    return NextResponse.json({ error: 'invalid_input', problems: [`a run renders at most ${MAX_SHOTS} shots`] }, { status: 400 });
  }
  const locale = body?.locale === 'en' || body?.locale === 'ru' ? body.locale : 'ka';

  // The board's approval, when the run comes from the studio: the storyboard must be that revision, or nothing happens.
  if (body?.storyboardApproval !== undefined && body.storyboardApproval !== null) {
    const approval = body.storyboardApproval;
    if (typeof approval !== 'object') {
      return NextResponse.json({ error: 'invalid_input', problems: ['storyboardApproval must be the board approval object'] }, { status: 400 });
    }
    const verdict = checkStoryboardApproval(draft, approval as RenderApprovalWire);
    if (!verdict.ok) {
      return NextResponse.json(
        {
          error: 'revision_mismatch',
          reason: verdict.reason,
          revision: verdict.revision,
          fingerprint: verdict.fingerprint,
          message: describeApprovalRefusal(verdict, locale),
          detail: verdict.detail,
          problems: [verdict.detail],
        },
        { status: 400 },
      );
    }
  }

  try {
    // freeze() validates and refuses an unapproved draft; what it returns is a deep-frozen, independent copy.
    const storyboard = freeze(draft);
    const view = await startRun(liveDirectorRunDeps(), { id: randomUUID(), userId: user.id, storyboard });
    return NextResponse.json({ run: view }, { status: 201 });
  } catch (err) {
    return directorErrorResponse(err, 'start');
  }
}
