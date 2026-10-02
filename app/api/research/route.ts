/**
 * GET /api/research[?limit=20&refresh=1] → { items: ResearchJobPublic[], serverNow, available }
 *
 * The signed-in user's newest research jobs, WITHOUT their reports or sources (a list of 20 must stay small — one report is up
 * to 400 KB; GET /api/research/[id] returns it). This is what the shell's ResearchWatcher polls while any job is pending, and
 * what rebuilds the thread cards after a reload or a locked phone: the state lives on the server, not in the browser.
 *
 * `refresh=1` is the READ-THROUGH: each RUNNING job is polled at the provider (claimed — at most one provider read per job per
 * 8 s, however many tabs ask — with a 6 s wait) so a finished report shows up within seconds instead of at the next cron tick.
 * The cron sweeper (/api/cron/research-sweep) is the guarantee when nobody is looking.
 *
 *   401 no session · 200 { items: [] , available: false } when the table is not migrated (the UI shows "opening soon")
 */
import { NextRequest } from 'next/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { reportError } from '@/lib/observability/report-error';
import { tableReady } from '@/lib/research/capabilities';
import { callerId, json } from '@/lib/research/http';
import { toPublicJob } from '@/lib/research/public';
import { RESEARCH_READ_USER } from '@/lib/research/rateLimits';
import { getResearchRuntime } from '@/lib/research/runtime';
import type { ResearchJobRow } from '@/lib/research/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const userId = await callerId(req);
  if (!userId || mustSignInToGenerate(userId)) return json(signInToGenerateBody(), 401);
  const limited = await checkRateLimitByKey(userId, RESEARCH_READ_USER);
  if (limited) return limited;

  const rt = getResearchRuntime();
  if (!rt || !(await tableReady(rt.db as never, 'research_jobs'))) return json({ items: [], serverNow: new Date().toISOString(), available: false });

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(30, Number(url.searchParams.get('limit')) || 20));
  try {
    let rows = await rt.store.listForUser(userId, limit);
    if (url.searchParams.get('refresh') === '1') {
      const running = rows.filter((r) => r.status === 'running');
      if (running.length > 0) {
        const settled = await Promise.all(running.map((r) => rt.service.refresh(r).catch(() => r)));
        const byId = new Map<string, ResearchJobRow>(settled.map((r) => [r.id, r]));
        // A refreshed row is a FULL row (it carries the report once completed) — the list view drops it again in toPublicJob.
        rows = rows.map((r) => byId.get(r.id) ?? r);
      }
    }
    return json({ items: rows.map((r) => toPublicJob(r)), serverNow: new Date().toISOString(), available: true });
  } catch (e) {
    reportError(e, { route: '/api/research', stage: 'list' });
    return json({ items: [], serverNow: new Date().toISOString(), available: true, error: 'unavailable' }, 503);
  }
}
