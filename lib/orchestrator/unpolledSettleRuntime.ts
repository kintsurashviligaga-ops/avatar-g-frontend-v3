/**
 * The real wiring for the unpolled-job settle sweep (lib/orchestrator/unpolledSettle) — which table it reads, which
 * provider answers for which kind, where a delivered result is re-hosted, and which ledger call refunds. The decisions
 * live in the pure module; this file only performs them.
 *
 * The verdict comes from the same poller the client's own poll route uses, and a delivery writes the same
 * generation_jobs row (same id) that route would have written — so a late client poll and this sweep converge on one
 * row and, through `${ref}:refund`, on one refund. Only 3D is left: lip-sync, the HeyGen presenter and Motion Control
 * were removed in v5.1 M-14 (GG 2026-11-12).
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { storageObjectExists, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { completeJob, failJob } from '@/lib/orchestrator/jobs';
import { refundDebitByRef } from '@/lib/orchestrator/ledger';
import type { SettleDeps, SettleRecord, SettleRow, SettleVerdict } from './unpolledSettle';

const WEEK_SEC = 604_800;
const MODEL3D_BUCKET = 'renders';
const model3dPath = (predictionId: string) => `models3d/${predictionId}.glb`;

/**
 * 3D is retired (v5.1 M-14) and its Replicate client removed, so the verdict comes from OUR storage only, the same rule
 * the status route uses: a hosted copy means it WAS delivered; a copy confirmed absent means nothing ever was (refund);
 * storage that cannot say means ask again later — never refund on a guess.
 */
async function pollSettle(rec: SettleRecord): Promise<SettleVerdict> {
  switch (rec.kind) {
    case 'model3d': {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(rec.job)) return { state: 'processing' };
      const stored = await storageObjectExists(MODEL3D_BUCKET, model3dPath(rec.job));
      if (stored === true) return { state: 'succeeded', url: '' };
      if (stored === false) return { state: 'failed', reason: '3D generation was retired before this model was delivered' };
      return { state: 'processing' };
    }
  }
}

async function deliverSettle(row: SettleRow, rec: SettleRecord): Promise<boolean> {
  switch (rec.kind) {
    case 'model3d': {
      const path = model3dPath(rec.job);
      if ((await storageObjectExists(MODEL3D_BUCKET, path)) !== true) return false;
      const signed = await createSignedAssetUrl(MODEL3D_BUCKET, path, WEEK_SEC);
      if (!signed) return false;
      await completeJob(row.id, { signedUrl: signed, result: { subtype: 'model3d', glbUrl: signed, predictionId: rec.job } });
      return true;
    }
  }
}

/** The live dependencies, or null when the service-role client cannot be built (the sweep then does nothing). */
export function createSettleDeps(): SettleDeps | null {
  let sb: ReturnType<typeof createServiceRoleClient>;
  try {
    sb = createServiceRoleClient();
  } catch {
    return null;
  }
  if (!sb) return null;
  return {
    async listStale(beforeIso, limit) {
      const { data, error } = await sb
        .from('generation_jobs')
        .select('id, user_id, status, created_at, params')
        .in('status', ['pending', 'processing'])
        .lt('created_at', beforeIso)
        .not('params->_settle', 'is', null)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as SettleRow[];
    },
    poll: pollSettle,
    deliver: deliverSettle,
    async refund(userId, rec) {
      // What the LEDGER shows under the ref, capped at what was reserved, as `${ref}:refund` — the ref the poll routes
      // use too, so whichever runs first is the only credit-back.
      const r = await refundDebitByRef(userId, rec.ref, rec.credits);
      if (r.ok) return 'refunded';
      return r.reason === 'skipped' ? 'nothing' : 'error';
    },
    fail: async (id, reason) => { await failJob(id, reason); },
    now: () => Date.now(),
  };
}
