/**
 * lib/video/director/runServer.ts — the live bindings of the director run (./run.ts): runs stored in Supabase
 * (`director_runs`, migration 20261008b), shots charged through the credit ledger, and GoogleVeoProvider on the live Veo
 * engine (./server.ts). Server-only; the pure stepper and its tests never load this file.
 *
 * ⚠️ OFF UNLESS VIDEO_DIRECTOR_RUNS SAYS OTHERWISE. `admin` opens the routes to admins only (a Preview check by the
 * owner), `1` / `true` / `on` to every signed-in user; anything else answers 404, so the studio keeps its current flow.
 *
 * ⚠️ BILLING FAILS CLOSED IN PRODUCTION, like every paid render (lib/orchestrator/produceBilling): a ledger that cannot
 * charge is `billing_unavailable`, never a free shot. Only `next dev` and the test runner render uncharged.
 */
import 'server-only';
import type { User } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/admin/guard';
import { unbilledRenderAllowed } from '@/lib/orchestrator/produceBilling';
import { deductCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { reportError } from '@/lib/observability/report-error';
import { createServiceRoleClient, isSupabaseConfiguredServer } from '@/lib/supabase/server';
import { GoogleVeoProvider } from './googleVeoProvider';
import type { DirectorRunDeps, DirectorRunRecord, DirectorRunStore, ShotBilling } from './run';
import { liveVeoEngine } from './server';
import { restoreFrozen } from './storyboard';

const TABLE = 'director_runs';

export type DirectorRunsAccess = 'off' | 'admin' | 'all';

/** Who may use the director-run routes, from VIDEO_DIRECTOR_RUNS. */
export function directorRunsAccess(env: NodeJS.ProcessEnv = process.env): DirectorRunsAccess {
  const raw = (env.VIDEO_DIRECTOR_RUNS ?? '').trim().toLowerCase();
  if (raw === 'admin') return 'admin';
  if (raw === '1' || raw === 'true' || raw === 'on') return 'all';
  return 'off';
}

/** True when this signed-in user may use the routes. Signed-out callers are refused before this (401). */
export function directorRunsOpenTo(user: User, env: NodeJS.ProcessEnv = process.env): boolean {
  const access = directorRunsAccess(env);
  return access === 'all' || (access === 'admin' && isAdminUser(user));
}

/**
 * The run as stored. The row repeats `state` and `version` beside the JSON so the compare-and-set can be one UPDATE …
 * WHERE version = expected, and an operator can read a run's state without parsing it.
 */
interface DirectorRunRow {
  id: string;
  user_id: string;
  state: string;
  version: number;
  record: DirectorRunRecord;
}

function toRow(run: DirectorRunRecord): DirectorRunRow {
  return { id: run.id, user_id: run.userId, state: run.state, version: run.version, record: run };
}

export function supabaseRunStore(): DirectorRunStore {
  const db = () => createServiceRoleClient();
  return {
    async insert(run) {
      const { error } = await db().from(TABLE).insert(toRow(run));
      if (error) throw new Error(`director run insert failed: ${error.message}`);
    },
    async load(id, userId) {
      const { data, error } = await db().from(TABLE).select('record').eq('id', id).eq('user_id', userId).maybeSingle();
      if (error) throw new Error(`director run load failed: ${error.message}`);
      const record = (data as { record?: DirectorRunRecord } | null)?.record;
      if (!record) return null;
      // JSON drops the deep freeze; the storyboard is re-checked and frozen again with its original frozenAt.
      return { ...record, storyboard: restoreFrozen(record.storyboard) };
    },
    async replace(next, expectedVersion) {
      const row = toRow(next);
      const { data, error } = await db()
        .from(TABLE)
        .update({ state: row.state, version: row.version, record: row.record, updated_at: next.updatedAt })
        .eq('id', next.id)
        .eq('user_id', next.userId)
        .eq('version', expectedVersion)
        .select('id');
      if (error) throw new Error(`director run update failed: ${error.message}`);
      return Array.isArray(data) && data.length === 1;
    },
  };
}

/** Each shot's share, charged under its own ref just before its submit; refunded from what the ledger shows was taken. */
export const ledgerShotBilling: ShotBilling = {
  async charge(userId, credits, ref) {
    const r = await deductCredits(userId, credits, ref);
    if (r.ok) return { ok: true, charged: credits };
    if (r.reason === 'insufficient') return { ok: false, code: 'insufficient_credits' };
    if (r.reason === 'skipped' && unbilledRenderAllowed()) return { ok: true, charged: 0 };
    if (r.reason === 'skipped') {
      reportError(new Error('billing unavailable: the credit ledger could not charge a director shot — refused'), { fn: 'ledgerShotBilling', userId, credits, ref });
    }
    return { ok: false, code: 'billing_unavailable' };
  },
  async refund(userId, ref, credits) {
    const r = await refundDebitByRef(userId, ref, credits);
    // `skipped` = nothing left under this ref (already refunded, or never debited): nothing is owed.
    return r.ok || r.reason === 'skipped';
  },
};

export function liveDirectorRunDeps(): DirectorRunDeps {
  return { provider: new GoogleVeoProvider({ engine: liveVeoEngine }), store: supabaseRunStore(), billing: ledgerShotBilling };
}

/** The runs table needs the service role; without it the routes answer 503 instead of failing per request. */
export function directorRunsConfigured(): boolean {
  return isSupabaseConfiguredServer() && Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
}
