/**
 * lib/chat/filmFollowFile.ts — the chat route's side of a film the server follows (./filmFollow): file the follow row
 * when a film starts, and mark the film watched on every poll of its tab. Kept apart from ./filmFollowLive, which reaches
 * the stitch route, so the chat route does not carry the assembler with it.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueue, supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import { reportError } from '@/lib/observability/report-error';
import { opsMarker } from '@/lib/observability/reliability';
import { deriveFilmTokenId, markFilmWatched } from './filmStatusStore';
import { decodeFilmRef, isFilmRef } from './filmTaskRef';
import { FILM_FOLLOW_KIND, FOLLOW_MAX_ATTEMPTS, followJobId, sanitizeFollowPlan, signFollow } from './filmFollow';

/** The key the follow record is signed with. Empty = nothing is filed or followed (fail closed). */
export function followKey(): string {
  return process.env.FILM_FOLLOW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/** The follower is on unless FILM_FOLLOW=off (the kill switch: films go back to being the tab's alone). */
export function filmFollowEnabled(): boolean {
  return (process.env.FILM_FOLLOW ?? '').trim().toLowerCase() !== 'off';
}

export function filmFollowStore() {
  return supabaseLeaseStore(() => createServiceRoleClient(), (e, ctx) => reportError(e, { ...ctx, lane: 'film-follow' }));
}

/**
 * File the follow row for a film this request just started (POST /api/chat/orchestrate, after the dispatch answered). The
 * film is identified from the poll token the server itself just minted, never from anything the browser sent. Fails open:
 * a film whose row could not be filed is simply its tab's alone, as before. A replayed start finds its row already there.
 */
export async function fileFilmFollow(input: { userId: string; predictionId: unknown; sessionId: string; message: string; plan: unknown }): Promise<void> {
  try {
    if (!filmFollowEnabled() || !input.userId || input.userId === 'anonymous') return;
    const p = input.predictionId;
    if (typeof p !== 'string' || !isFilmRef(p)) return;
    const ref = decodeFilmRef(p);
    if (!ref) return;
    const t = deriveFilmTokenId({ sessionId: ref.sessionId, createdAt: ref.createdAt, seed: ref.seed });
    const signed = signFollow({
      u: input.userId, t, p, s: input.sessionId, c: Number.isFinite(ref.createdAt) && ref.createdAt > 0 ? ref.createdAt : Date.now(),
      m: input.message.slice(0, 4000), plan: sanitizeFollowPlan(input.plan),
    }, followKey());
    if (!signed) return;
    const put = await enqueue(filmFollowStore(), {
      id: followJobId(t), userId: input.userId, serviceType: 'film', kind: FILM_FOLLOW_KIND, maxAttempts: FOLLOW_MAX_ATTEMPTS,
      params: { subtype: 'film-follow', _follow: signed },
    });
    if (put === 'error') opsMarker('warn', 'film_follow_not_filed', { film: t });
  } catch (e) {
    reportError(e, { fn: 'fileFilmFollow' });
  }
}

/** The film's tab polled it (POST /api/chat/orchestrate's poll): the server keeps its hands off. Fails open. */
export async function noteFilmPolled(userId: string | undefined, response: { metadata?: unknown }): Promise<void> {
  try {
    if (!userId || userId === 'anonymous') return;
    const film = (response.metadata as { film?: { statusTokenId?: unknown } } | undefined)?.film;
    const t = film && typeof film === 'object' ? film.statusTokenId : null;
    if (typeof t === 'string' && t) await markFilmWatched(t);
  } catch {
    /* fail-open */
  }
}
