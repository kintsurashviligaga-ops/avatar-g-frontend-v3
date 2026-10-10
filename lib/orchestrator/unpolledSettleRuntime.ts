/**
 * The real wiring for the unpolled-job settle sweep (lib/orchestrator/unpolledSettle) — which table it reads, which
 * provider answers for which kind, where a delivered result is re-hosted, and which ledger call refunds. The decisions
 * live in the pure module; this file only performs them.
 *
 * Per kind, the verdict comes from the same poller the client's own poll route uses, and a delivery writes the same
 * generation_jobs row (same id) that route would have written — so a late client poll and this sweep converge on one
 * row and, through `${ref}:refund`, on one refund.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { lipsyncFetch } from '@/lib/ai/lipsync';
import { klingPoll } from '@/lib/ai/klingClient';
import { pollReconstruction, fetchGlbBuffer } from '@/lib/services/model3d/replicate3dClient';
import { isTerminal } from '@/lib/services/model3d/model3dPlan';
import { uploadBufferAndSign, storageObjectExists, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { completeJob, failJob, recordCompletedAsset, recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { refundDebitByRef } from '@/lib/orchestrator/ledger';
import type { SettleDeps, SettleRecord, SettleRow, SettleVerdict } from './unpolledSettle';

const WEEK_SEC = 604_800;
/** A video bigger than this is not ours to buffer in a cron tick (the poll routes use the same 80MB ceiling). */
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MODEL3D_BUCKET = 'renders';
const model3dPath = (predictionId: string) => `models3d/${predictionId}.glb`;

/** Download a finished provider video and store it as a 7-day signed object. null on any miss (retried next tick). */
async function rehostVideo(url: string, path: string, bucket = 'renders'): Promise<string | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 1024 || buf.byteLength > MAX_VIDEO_BYTES) return null;
    return await uploadBufferAndSign(bucket, path, buf, 'video/mp4', WEEK_SEC);
  } catch {
    return null;
  }
}

async function pollSettle(rec: SettleRecord): Promise<SettleVerdict> {
  switch (rec.kind) {
    case 'lipsync':
    case 'presenter': {
      // Both are lipsyncFetch ids: `heygen:<videoId>` (the presenter, and HeyGen lip-sync), `sync:<id>` or a bare
      // Replicate prediction. Same reading as the GET routes: succeeded without a file is a failure, not "working".
      const r = await lipsyncFetch(rec.job);
      if (r.status === 'succeeded') return r.url ? { state: 'succeeded', url: r.url } : { state: 'failed', reason: 'finished without a usable video file' };
      if (r.status === 'failed' || r.status === 'canceled') return { state: 'failed', reason: r.error || 'render failed' };
      return { state: 'processing' };
    }
    case 'motion': {
      const r = await klingPoll(rec.job); // succeeded-without-url already reads as failed here
      if (r.status === 'succeeded' && r.url) return { state: 'succeeded', url: r.url };
      if (r.status === 'failed') return { state: 'failed', reason: r.error || 'motion generation failed' };
      return { state: 'processing' };
    }
    case 'model3d': {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(rec.job)) return { state: 'processing' };
      const p = await pollReconstruction(`https://api.replicate.com/v1/predictions/${rec.job}`);
      if (p.status === 'failed') return { state: 'failed', reason: p.error || 'replicate reported failure' };
      if (!isTerminal(p.status)) return { state: 'processing' };
      if (p.glbUrl) return { state: 'succeeded', url: p.glbUrl };
      // Terminal with no mesh — the status route's own rule: our hosted copy means it WAS delivered (deliver hands that
      // copy over); `data_removed: false`, or a copy confirmed absent, means no tick ever had a model to deliver.
      const stored = await storageObjectExists(MODEL3D_BUCKET, model3dPath(rec.job));
      if (stored === true) return { state: 'succeeded', url: '' };
      if (p.dataRemoved === false || stored === false) return { state: 'failed', reason: 'finished without a usable model file' };
      return { state: 'processing' }; // storage cannot say — never refund on a guess
    }
  }
}

async function deliverSettle(row: SettleRow, rec: SettleRecord, url: string): Promise<boolean> {
  const userId = row.user_id as string;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  switch (rec.kind) {
    case 'lipsync':
    case 'presenter': {
      const hosted = await rehostVideo(url, `${rec.kind}/${stamp}.mp4`);
      if (!hosted) return false;
      // Same id + same shape as the GET route's success write, so a late client poll upserts the same row.
      return recordCompletedFilm({ id: row.id, userId, url: hosted, orientation: 'vertical', subtype: rec.kind });
    }
    case 'motion': {
      // Same bucket + prefix the motion /status route re-hosts into.
      const hosted = await rehostVideo(url, `motion-control/${userId}/${stamp}.mp4`, 'renders');
      if (!hosted) return false;
      return recordCompletedAsset({ id: row.id, userId, serviceType: 'film', url: hosted, source: 'motion-control', subtype: 'motion' });
    }
    case 'model3d': {
      const path = model3dPath(rec.job);
      // An earlier poll may already have stored it — hand THAT over rather than download again.
      if ((await storageObjectExists(MODEL3D_BUCKET, path)) === true) {
        const signed = await createSignedAssetUrl(MODEL3D_BUCKET, path, WEEK_SEC);
        if (!signed) return false;
        await completeJob(row.id, { signedUrl: signed, result: { subtype: 'model3d', glbUrl: signed, predictionId: rec.job } });
        return true;
      }
      if (!url) return false;
      const buf = await fetchGlbBuffer(url).catch(() => null);
      const hosted = buf ? await uploadBufferAndSign(MODEL3D_BUCKET, path, buf, 'model/gltf-binary', WEEK_SEC) : null;
      if (!hosted) return false;
      await completeJob(row.id, { signedUrl: hosted, result: { subtype: 'model3d', glbUrl: hosted, predictionId: rec.job } });
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
