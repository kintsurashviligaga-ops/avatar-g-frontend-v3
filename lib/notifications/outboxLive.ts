/**
 * lib/notifications/outboxLive.ts — the real effects behind ./outbox: generation_jobs as the store, the bell, this
 * person's browser push and their linked WhatsApp as outlets (the same senders ./dispatch.ts uses), their saved
 * preferences, and the old path's dedupe key.
 *
 * DELIVERY_OUTBOX decides whether anything here runs. `1` / `true` / `on` turns it on, `off` / `0` / `false` off, and
 * unset means off, except on a Vercel Preview, where it means on: the owner can watch a run's notice arrive there without
 * an env change, and a merge of the code alone turns nothing on in Production. While it is off, the cron answers
 * `skipped`, nothing is kicked, and every job notifies exactly as before.
 *
 * Telegram, SMS and calls have no sender yet (Telegram binding is not live, SMS needs a Georgian aggregator, no phone
 * call path exists: lib/calls/availability.ts). A person who wished for one gets `skipped: not_configured` on that
 * outlet, in the record, and nothing is pretended.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { runAfterResponse } from '@/lib/platform/afterResponse';
import { hashIdempotencyKey, markIdempotentDuplicate } from '@/lib/platform/idempotency';
import { createNotification } from './store';
import { bellTypeOf } from './dispatch';
import { sendPushAlert } from './channels/push';
import { sendWhatsAppAlert } from './channels/whatsapp';
import { readPrefs } from './prefsStore';
import { FRESH_MS, GIVE_UP_MS, deliver, type OutboxDeps, type OutboxRow, type OutboxStore } from './outbox';

export function deliveryOutboxOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.DELIVERY_OUTBOX ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'on') return true;
  if (raw === '' && env.VERCEL_ENV === 'preview') return true;
  return false;
}

type Sb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const TABLE = 'generation_jobs';
const COLS = 'id,user_id,status,service_type,params,error,updated_at';
const FINAL = ['completed', 'failed'];

export function outboxRowOf(d: Record<string, unknown>): OutboxRow | null {
  if (typeof d.id !== 'string' || typeof d.user_id !== 'string' || typeof d.status !== 'string') return null;
  const params = d.params && typeof d.params === 'object' && !Array.isArray(d.params) ? (d.params as Record<string, unknown>) : {};
  return {
    id: d.id,
    userId: d.user_id,
    status: d.status,
    serviceType: typeof d.service_type === 'string' ? d.service_type : 'film',
    params,
    error: typeof d.error === 'string' ? d.error : null,
    updatedAt: typeof d.updated_at === 'string' ? Date.parse(d.updated_at) || 0 : 0,
  };
}

/**
 * generation_jobs as an OutboxStore. The compare-and-set is one filtered PATCH (PostgREST puts the JSON-path filters in
 * the UPDATE's WHERE), and `select('id')` says whether a row matched. Errors read as "did not happen", never thrown.
 */
export function supabaseOutboxStore(client: () => Sb | null, report: (e: unknown, ctx: Record<string, unknown>) => void): OutboxStore {
  const sb = (): Sb | null => {
    try { return client(); } catch { return null; }
  };
  const rows = (data: unknown): OutboxRow[] =>
    ((data ?? []) as Record<string, unknown>[]).map(outboxRowOf).filter((r): r is OutboxRow => r !== null);
  return {
    async read(id) {
      const c = sb();
      if (!c || !id) return null;
      try {
        const { data, error } = await c.from(TABLE).select(COLS).eq('id', id).maybeSingle();
        if (error || !data) return null;
        return outboxRowOf(data as Record<string, unknown>);
      } catch {
        return null;
      }
    },
    async cas(id, expect, params) {
      const c = sb();
      if (!c) return false;
      try {
        let q = c.from(TABLE).update({ params }).eq('id', id).in('status', FINAL);
        q = expect.tellV === null ? q.is('params->_tell', null) : q.eq('params->_tell->>v', String(expect.tellV));
        q = expect.execV === null ? q.is('params->_exec', null) : q.eq('params->_exec->>v', String(expect.execV));
        const { data, error } = await q.select('id');
        if (error) { report(new Error(error.message), { fn: 'outbox.cas', id }); return false; }
        return Array.isArray(data) && data.length > 0;
      } catch (e) {
        report(e, { fn: 'outbox.cas', id });
        return false;
      }
    },
    async listDue(now, limit) {
      const c = sb();
      if (!c) return [];
      try {
        // Ended in the last FRESH_MS and never taken (a run's steps are told by their run) …
        const fresh = await c.from(TABLE).select(COLS).in('status', FINAL)
          .gte('updated_at', new Date(now - FRESH_MS).toISOString())
          .is('params->_tell', null).is('params->_parent', null)
          .order('updated_at', { ascending: false }).limit(limit);
        // … and taken but still open (a retry waiting, a claim that lapsed).
        const open = await c.from(TABLE).select(COLS).in('status', FINAL)
          .gte('updated_at', new Date(now - 2 * GIVE_UP_MS).toISOString())
          .not('params->_tell', 'is', null).is('params->_tell->done', null)
          .order('updated_at', { ascending: true }).limit(limit);
        for (const r of [fresh, open]) if (r.error) report(new Error(r.error.message), { fn: 'outbox.listDue' });
        const seen = new Set<string>();
        return [...rows(fresh.data), ...rows(open.data)].filter((r) => !seen.has(r.id) && !!seen.add(r.id));
      } catch (e) {
        report(e, { fn: 'outbox.listDue' });
        return [];
      }
    },
  };
}

export function liveOutboxDeps(): OutboxDeps {
  return {
    store: supabaseOutboxStore(() => createServiceRoleClient(), reportError),
    prefs: async (userId) => (await readPrefs(userId)).prefs,
    send: {
      bell: async (ev) => {
        const type = bellTypeOf(ev.kind);
        if (!type) return { sent: false, reason: 'not_configured' };
        const ok = await createNotification(createServiceRoleClient(), ev.userId, type, ev.body ? `${ev.title} ${ev.body}` : ev.title);
        return ok ? { sent: true } : { sent: false, reason: 'failed' };
      },
      push: (ev) => sendPushAlert(ev),
      whatsapp: (ev) => sendWhatsAppAlert(ev),
    },
    // The key dispatch.ts marks for `dedupeKey: job:<id>` (lib/orchestrator/jobs.ts): whichever path comes first tells.
    firstNotice: (userId, jobId) => markIdempotentDuplicate(hashIdempotencyKey(`notify:${userId}:job:${jobId}`), 7 * 24 * 3600),
    now: () => Date.now(),
    newId: () => randomUUID(),
  };
}

/**
 * Tell the owner of a job that just ended, after this response (or now, off Vercel). The per-minute sweep is the net
 * under it: a kick that never runs only delays the notice. A no-op while DELIVERY_OUTBOX is off.
 */
export function kickDelivery(id: string): void {
  if (!id || !deliveryOutboxOn()) return;
  const work = () => deliver(liveOutboxDeps(), id);
  if (!runAfterResponse(work, 'delivery-outbox')) void work().catch(() => undefined);
}
