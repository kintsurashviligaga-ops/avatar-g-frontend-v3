/**
 * lib/music/studio/live.ts — the live effects behind ./engine: generation_jobs as the lease queue (= Library + job
 * tray), the credit ledger, the platform budget guard (fail closed), Google Lyria, ffmpeg QC and private Storage.
 *
 * Storage: the private `renders` bucket, `music-studio/<userId>/<jobId>.<ext>`. Nothing is public; every read is a
 * short signed URL minted for the row's owner (status re-signs on each read, so an expired link renews itself).
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import { netDebitedForRef, refundCredits } from '@/lib/orchestrator/ledger';
import { reserveProduce } from '@/lib/orchestrator/produceBilling';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { createSignedAssetUrl, parseSupabaseObjectUrl, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { lyriaRequest, musicWithinBudget, recordMusicUsage } from '@/lib/ai/lyriaMusic';
import { audit as mediaAudit, every, quoteKey } from '@/lib/agent/media/montageLive';
import { musicCapabilities } from './capabilities';
import { MUSIC_KIND, type SavedTrack } from './contracts';
import { measureAudio, assertDeliverable, formatOfMime, FORMAT_MIME } from './audio';
import { MusicError } from './errors';
import { e2eFakeLyriaEnabled, e2eFakeTrack } from './e2eProvider';
import type { MusicDeps } from './engine';
import type { EditDeps } from './edit';

export const MUSIC_BUCKET = 'renders';
/** A signed link lives an hour; status and Library reads mint a fresh one. */
export const SIGNED_TTL_SEC = 3600;

export function musicStore() {
  return supabaseLeaseStore(() => createServiceRoleClient(), reportError);
}

export async function signTrack(t: SavedTrack): Promise<SavedTrack> {
  const url = await createSignedAssetUrl(t.bucket, t.path, SIGNED_TTL_SEC);
  if (!url) throw new MusicError('storage_failed', 'The track link could not be renewed.', 503);
  return { ...t, url };
}

/** Store bytes privately under the user and sign them. */
export async function storeTrack(userId: string, name: string, bytes: Buffer, mime: string, qc: SavedTrack['qc']): Promise<SavedTrack> {
  const fmt = formatOfMime(mime) ?? 'mp3';
  const path = `music-studio/${userId}/${name}.${fmt}`;
  const url = await uploadBufferAndSign(MUSIC_BUCKET, path, bytes, FORMAT_MIME[fmt], SIGNED_TTL_SEC);
  if (!url) throw new MusicError('storage_failed', 'The track could not be stored.', 503);
  return { bucket: MUSIC_BUCKET, path, url, mime: FORMAT_MIME[fmt], bytes: bytes.byteLength, digest: createHash('sha256').update(bytes).digest('hex'), qc };
}

export function liveMusicDeps(): MusicDeps {
  const store = musicStore();
  return {
    store,
    // The isolated browser E2E's stand-in provider (./e2eProvider — fail-closed: never on Vercel, never with a hosted
    // Supabase) reports the engine as configured; nothing else about the capability matrix changes.
    caps: () => { const c = musicCapabilities(); return e2eFakeLyriaEnabled() ? { ...c, configured: true, transport: c.transport ?? 'gemini_api' } : c; },
    key: quoteKey,
    now: () => Date.now(),
    newId: () => randomUUID(),
    async checkParent(id, userId) {
      const row = await store.read(id);
      return !!row && row.userId === userId && row.exec?.kind === MUSIC_KIND;
    },
    withinBudget: (model) => musicWithinBudget(model),
    async reserve(userId, credits, ref) {
      const r = await reserveProduce(userId, credits, ref, { refuseReplay: true });
      // An unbilled render (ledger 'skipped') is never allowed here: no charge, no render.
      return { charged: r.proceed && r.charged, reason: r.charged ? 'ok' : r.reason === 'skipped' ? 'billing_unavailable' : r.reason };
    },
    async refund(userId, ref, credits) {
      const net = await netDebitedForRef(userId, ref);
      if (net === null) return 'error';
      const amount = Math.min(net, Math.round(credits));
      if (!(amount > 0)) return 'nothing';
      const r = await refundCredits(userId, amount, `${ref}:refund`);
      return r.ok ? 'refunded' : 'error';
    },
    async generate(plan, input, signal) {
      if (e2eFakeLyriaEnabled()) return e2eFakeTrack(plan.request.prompt, signal);
      const r = await lyriaRequest(input, plan.request.modelId, signal);
      if (!r.ok) {
        if (r.reason === 'not_configured') throw new MusicError('not_configured', 'The Google music engine is not configured.', 503);
        if (r.reason === 'timeout') throw new MusicError(signal.aborted ? 'cancelled' : 'provider_timeout', 'The music engine did not answer in time.', 504);
        throw new MusicError('provider_failed', 'The music engine did not return a track.', 502);
      }
      void recordMusicUsage(plan.request.modelId);
      return { bytes: Buffer.from(r.track.base64, 'base64'), mime: r.track.mime, providerRequestId: null, caption: r.caption };
    },
    async save(id, userId, plan, output, signal) {
      const fmt = formatOfMime(output.mime) ?? 'mp3';
      const qc = await measureAudio(output.bytes, fmt, signal);
      // The model's length is its own; allow it some way either side of the offered length, never a 5 s blip.
      assertDeliverable(qc, { minSec: Math.min(10, plan.billedSec / 2), maxSec: plan.billedSec * 2 + 30 });
      return storeTrack(userId, id, output.bytes, FORMAT_MIME[fmt], qc);
    },
    resign: signTrack,
    every,
    async audit(ev) {
      await mediaAudit({
        userId: ev.userId, op: 'studio_run', toolId: 'music.generate', jobId: ev.jobId,
        phase: ev.phase === 'quote' ? 'quote' : ev.phase === 'cancel' ? 'cancel' : ev.phase === 'settlement' ? 'refund' : 'run',
        outcome: ev.phase === 'failed' ? 'failed' : ev.phase === 'cancel' ? 'cancelled' : 'ok',
        detail: `${ev.phase}:${ev.code}`,
        ...(ev.credits !== undefined ? { credits: ev.credits } : {}),
      });
    },
    maxLivePerUser: 2,
  };
}

// ── edits ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Where a music Library row's file lives: a Music Studio row names it; an older row is read off its signed URL. */
export function trackLocation(row: { result?: unknown; signed_url?: unknown }): { bucket: string; path: string } | null {
  const r = row.result && typeof row.result === 'object' ? (row.result as Record<string, unknown>) : null;
  if (r && typeof r.bucket === 'string' && typeof r.path === 'string') return { bucket: r.bucket, path: r.path };
  if (typeof row.signed_url === 'string') return parseSupabaseObjectUrl(row.signed_url);
  return null;
}

export function liveEditDeps(): EditDeps {
  return {
    async load(jobId, userId) {
      try {
        const sb = createServiceRoleClient();
        const { data, error } = await sb.from('generation_jobs').select('id,user_id,service_type,status,result,signed_url')
          .eq('id', jobId).eq('user_id', userId).eq('service_type', 'music').eq('status', 'completed').maybeSingle();
        if (error || !data) return null;
        const loc = trackLocation(data as Record<string, unknown>);
        if (!loc) return null;
        const { data: blob, error: dlErr } = await sb.storage.from(loc.bucket).download(loc.path);
        if (dlErr || !blob) return null;
        const bytes = Buffer.from(await blob.arrayBuffer());
        if (bytes.byteLength > 60 * 1024 * 1024) return null;
        const ext = (/\.([a-z0-9]{2,4})$/i.exec(loc.path)?.[1] ?? 'mp3').toLowerCase();
        const format = ext === 'wav' ? 'wav' : ext === 'm4a' || ext === 'mp4' || ext === 'aac' ? 'm4a' : 'mp3';
        return { jobId, bytes, format };
      } catch (e) {
        reportError(e, { fn: 'musicStudio.edit.load', jobId });
        return null;
      }
    },
    newId: () => randomUUID(),
    store: (userId, id, bytes, format, qc) => storeTrack(userId, id, bytes, FORMAT_MIME[format], qc),
    async record({ id, userId, saved, request, label }) {
      try {
        const { error } = await createServiceRoleClient().from('generation_jobs').insert({
          id, user_id: userId, service_type: 'music', status: 'completed', current_stage: 'completed', pct: 100,
          params: { prompt: label, subtype: 'music-studio-edit', via: 'music-studio', parentJobIds: request.sources, edit: request },
          result: { kind: 'music', subtype: 'music-studio-edit', url: saved.url, bucket: saved.bucket, path: saved.path, mime: saved.mime,
            bytes: saved.bytes, digest: saved.digest, durationSec: saved.qc.durationSec, qc: saved.qc, parentJobIds: request.sources, label, credits: 0 },
          signed_url: saved.url,
        });
        if (error) { reportError(new Error(error.message), { fn: 'musicStudio.edit.record', id }); return false; }
        return true;
      } catch (e) {
        reportError(e, { fn: 'musicStudio.edit.record', id });
        return false;
      }
    },
  };
}
