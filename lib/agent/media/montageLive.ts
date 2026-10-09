/**
 * lib/agent/media/montageLive.ts — the live effects behind ./montageExec: the caller's files (lib/security/callerMedia),
 * ffmpeg probing and beat analysis (lib/services/montage/beatAnalysis), the existing montage lane under the platform
 * budget guard, generation_jobs (= the Library and the job tray), the credit ledger, and the audit trail.
 *
 * AUDIT: one `analytics_events` row per step, event `audit.agent_g.media`, written with the service role. Users have
 * no policy on that table (they can neither read nor change it), and /api/analytics/track refuses the `audit.` prefix,
 * so a client cannot forge one. Best-effort like every other persistence here, but a lost row is reported.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { analyzeTrack, probeMedia } from '@/lib/services/montage/beatAnalysis';
import { runMontage } from '@/lib/services/montage/montagePipeline';
import { montageUnits } from '@/lib/services/montage/montagePlan';
import { BudgetExceededError, guardedCall } from '@/lib/services/billing/guardedCall';
import { completeJob, createJob, failJob, jobSnapshot, recordJobReservation } from '@/lib/orchestrator/jobs';
import { refundProduce, reserveProduce } from '@/lib/orchestrator/produceBilling';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import type { AuditEvent, MontageExecDeps } from './montageExec';

/** The event name of an Agent G media audit row. */
export const AUDIT_EVENT = 'audit.agent_g.media';
/** How long a signed source link lives: the quote's 30 minutes plus a render's 10, with room to spare. */
const SOURCE_TTL_SEC = 3600;

async function audit(ev: AuditEvent): Promise<void> {
  try {
    const { userId, ...props } = ev;
    const { error } = await createServiceRoleClient().from('analytics_events').insert({ user_id: userId, event_name: AUDIT_EVENT, props });
    if (error) throw new Error(error.message);
  } catch (e) {
    reportError(e, { fn: 'agentMedia.audit', jobId: ev.jobId, phase: ev.phase, outcome: ev.outcome });
  }
}

export function liveMontageDeps(): MontageExecDeps {
  return {
    async resolveFile(ref, userId) {
      const r = await resolveCallerMedia(ref, userId, SOURCE_TTL_SEC);
      // Our storage only: an outside link is not "the caller's own file", whatever it points at.
      if (r.ok) return r.own ? { ok: true, url: r.url } : { ok: false, reason: 'not_yours' };
      return { ok: false, reason: r.reason === 'not_owner' ? 'not_yours' : 'unreadable' };
    },
    probe: (url) => probeMedia(url),
    analyzeTrack: (url) => analyzeTrack(url),
    async render(req, opts) {
      try {
        // No model is called (both tiers are 'ffmpeg-local'); the guard books the compute with the provider spend.
        return await guardedCall({ service: 'montage', model: 'ffmpeg-local', units: montageUnits() }, () =>
          runMontage(req, { jobId: opts.jobId, shouldContinue: opts.shouldContinue }));
      } catch (e) {
        if (e instanceof BudgetExceededError) return { ok: false, step: 'resolve', error: 'the platform budget for this period is exhausted' };
        throw e;
      }
    },
    jobs: {
      create: ({ id, userId, params }) => createJob({ id, userId, serviceType: 'film', params, status: 'processing' }).catch(() => false),
      snapshot: (id) => jobSnapshot(id),
      fail: (id, error) => failJob(id, error).catch(() => undefined),
      complete: (id, out) => completeJob(id, out).catch(() => undefined),
    },
    billing: {
      reserve: (userId, credits, ref) => reserveProduce(userId, credits, ref),
      recordReservation: (jobId, r) => recordJobReservation(jobId, r),
      refund: (userId, credits, ref, charged) => refundProduce(userId, credits, ref, charged),
    },
    audit,
    // Same construction as lib/orchestrator/jobChargeToken: a dedicated secret, else the service-role key; none = no quotes.
    key: () => process.env.AGENT_G_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    now: () => Date.now(),
    newId: () => randomUUID(),
  };
}
