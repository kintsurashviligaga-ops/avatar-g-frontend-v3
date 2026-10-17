/**
 * lib/chat/filmFollowLive.ts — the real effects behind ./filmFollowWorker: generation_jobs through the service role, the
 * film's status and tab marks in Redis (./filmStatusStore), the owner's poll (the same pollOrchestrationTask the tab's
 * poll reaches), the stitch through POST /api/video/assemble called in-process as the owner (lib/video/assembleActor),
 * the ledger refund of the film's charge, and the owner's notification.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { refundDebitByRef } from '@/lib/orchestrator/ledger';
import { notifyUser } from '@/lib/notifications/dispatch';
import { reportError } from '@/lib/observability/report-error';
import { opsMarker } from '@/lib/observability/reliability';
import { actAs } from '@/lib/video/assembleActor';
import { filmChargeRef } from './filmBilling';
import { filmWatchedAt, readFilmStatusStrict, recordFilmFailed } from './filmStatusStore';
import { filmFollowStore, followKey } from './filmFollowFile';
import type { FilmStudioMatrix } from './filmStudioClient';
import type { FilmFollowDeps, StitchOutcome } from './filmFollowWorker';
import type { FilmFollowRecord } from './filmFollow';

export function newFollowWorkerId(): string {
  return `film-${randomUUID()}`;
}

function every(ms: number, tick: () => Promise<void>): () => void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void tick().catch((e) => reportError(e, { fn: 'filmFollow.heartbeat' })).finally(() => { busy = false; });
  }, ms);
  return () => clearInterval(timer);
}

const FAILED_TEXT: Record<'ka' | 'en' | 'ru', { paid: string; plain: string }> = {
  ka: { paid: '🎬 ფილმი ვერ დასრულდა. მისი კრედიტები დაგიბრუნდათ.', plain: '🎬 ფილმი ვერ დასრულდა.' },
  en: { paid: '🎬 Your film could not be finished. Its credits were returned.', plain: '🎬 Your film could not be finished.' },
  ru: { paid: '🎬 Фильм не удалось завершить. Кредиты возвращены.', plain: '🎬 Фильм не удалось завершить.' },
};

const isMatrix = (v: unknown): v is FilmStudioMatrix =>
  !!v && typeof v === 'object' && Array.isArray((v as { clips?: unknown }).clips);

/** The live deps. `origin` is the site the sweep was called on (the stitch's RunPod callback is built from it). */
export function liveFilmFollowDeps(origin: string): FilmFollowDeps {
  return {
    store: filmFollowStore(),
    key: followKey,
    now: () => Date.now(),
    watchedAt: (t) => filmWatchedAt(t),
    status: (t) => readFilmStatusStrict(t),
    async delivered(userId, tokenId) {
      try {
        const sb = createServiceRoleClient();
        if (!sb) return null;
        const { data, error } = await sb.from('generation_jobs').select('id').eq('id', tokenId).eq('user_id', userId).eq('status', 'completed').maybeSingle();
        if (error) return null;
        return Boolean(data);
      } catch {
        return null;
      }
    },
    async poll(rec: FilmFollowRecord) {
      try {
        const { pollOrchestrationTask } = await import('./providerRouter');
        const res = await pollOrchestrationTask(rec.p, rec.s, rec.u);
        const film = (res.metadata as { film?: unknown } | undefined)?.film;
        return isMatrix(film) ? film : null;
      } catch (e) {
        reportError(e, { fn: 'filmFollow.poll' });
        return 'error';
      }
    },
    async stitch(rec, body, { budgetMs, signal }): Promise<StitchOutcome> {
      try {
        const { POST } = await import('@/app/api/video/assemble/route');
        const req = actAs(new NextRequest(new URL('/api/video/assemble', origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        }), { uid: rec.u, budgetMs });
        const res = await POST(req);
        const json = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
        return {
          status: res.status,
          url: typeof json?.url === 'string' && json.url ? json.url : null,
          error: typeof json?.error === 'string' ? json.error : null,
        };
      } catch (e) {
        reportError(e, { fn: 'filmFollow.stitch' });
        return { status: 0, url: null, error: null };
      }
    },
    async refund(userId, tokenId) {
      const r = await refundDebitByRef(userId, filmChargeRef(tokenId));
      if (r.ok) return 'paid';
      return r.reason === 'skipped' ? 'nothing' : 'error';
    },
    markFailed: (t, error) => recordFilmFailed(t, error.slice(0, 300)),
    async notifyFailed(rec, refunded) {
      const locale = rec.plan.locale === 'en' || rec.plan.locale === 'ru' ? rec.plan.locale : 'ka';
      const text = FAILED_TEXT[locale];
      await notifyUser({
        userId: rec.u,
        kind: 'film',
        title: refunded ? text.paid : text.plain,
        body: '',
        url: '/dashboard',
        dedupeKey: `film-follow:${rec.t}:failed`,
        locale,
      });
    },
    every,
    log: (event, data) => opsMarker(event.endsWith('_failed') ? 'error' : 'info', event, data),
  };
}
