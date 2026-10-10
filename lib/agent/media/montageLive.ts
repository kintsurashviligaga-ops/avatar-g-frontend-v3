/**
 * lib/agent/media/montageLive.ts — the live effects behind ./montageExec and ./montageWorker: the caller's files
 * (lib/security/callerMedia), ffmpeg probing and beat analysis (lib/services/montage/beatAnalysis), the existing montage
 * lane under the platform budget guard, generation_jobs as a lease queue (= the Library and the job tray), the credit
 * ledger, and the audit trail.
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
import { supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import { netDebitedForRef, refundCredits } from '@/lib/orchestrator/ledger';
import { reserveProduce } from '@/lib/orchestrator/produceBilling';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import type { AuditEvent, MontageExecDeps } from './montageExec';

/** The event name of an Agent G media audit row. */
export const AUDIT_EVENT = 'audit.agent_g.media';
/** How long a signed source link lives: the quote's 30 minutes plus a render's 10, with room to spare. A job started
 *  or retried later than that still reads its files: the montage lane re-signs our own storage links (the clips and
 *  the track) before every render. */
const SOURCE_TTL_SEC = 3600;

/** The capability each audited operation is (lib/agent/capabilities), so every row names its tool. */
const TOOL_OF_OP: Readonly<Record<AuditEvent['op'], string>> = {
  montage: 'agent.montage',
  audio_extract: 'agent.audio-extract',
  media_edit: 'media.edit',
  media_analyze: 'media.analyze',
  agent_run: 'agent.run',
  studio_run: 'studio.generate',
};

/** One audit row (shared with ./audioLive and lib/agent/run). Never throws; a lost row is reported. */
export async function audit(ev: AuditEvent): Promise<void> {
  try {
    const { userId, ...rest } = ev;
    const props = { ...rest, toolId: rest.toolId ?? TOOL_OF_OP[rest.op] };
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
          runMontage(req, { jobId: opts.jobId, signal: opts.signal, onStage: (step, pct) => opts.onStage(step, pct) }));
      } catch (e) {
        if (e instanceof BudgetExceededError) return { ok: false, step: 'resolve', error: 'the platform budget for this period is exhausted' };
        throw e;
      }
    },
    store: supabaseLeaseStore(() => createServiceRoleClient(), reportError),
    billing: {
      reserve: (userId, credits, ref) => reserveProduce(userId, credits, ref),
      // Only what the ledger shows was taken under `ref` and not yet given back, at most the row's claim: a debt on a
      // row can never pay out more than was charged. The refund ref `${ref}:refund` is unique, so it lands once.
      async refund(userId, ref, credits) {
        const net = await netDebitedForRef(userId, ref);
        if (net === null) return 'error';
        const amount = Math.min(net, Math.round(credits));
        if (!(amount > 0)) return 'nothing';
        const r = await refundCredits(userId, amount, `${ref}:refund`);
        return r.ok ? 'refunded' : 'error';
      },
    },
    audit,
    key: quoteKey,
    now: () => Date.now(),
    newId: () => randomUUID(),
    every,
  };
}

/** Same construction as lib/orchestrator/jobChargeToken: a dedicated secret, else the service-role key; none = no quotes. */
export function quoteKey(): string {
  return process.env.AGENT_G_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/** The worker's heartbeat timer: `tick` every `ms`, never two at once, until the returned stop is called. */
export function every(ms: number, tick: () => Promise<void>): () => void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void tick().catch((e) => reportError(e, { fn: 'agentMedia.heartbeat' })).finally(() => { busy = false; });
  }, ms);
  return () => clearInterval(timer);
}

/** A name for one worker run, written as the lease owner. */
export function newWorkerId(): string {
  return `w-${randomUUID()}`;
}
