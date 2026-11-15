/**
 * lib/music/producer/live.ts — the real side effects behind runProducer (Vertex Lyria only, existing ledger RPCs). Server only.
 *
 * Billing uses the same ledger calls the image routes use (hasSufficientBalance, deductCreditsOnce under one ref per track,
 * refundCredits on a save miss); nothing here changes the ledger, BOG or the wallet. The platform budget guard is asked
 * before every Lyria call and the spend is booked only when a track came back (lib/ai/lyriaMusic). Tracks and their
 * recipes live privately under renders/music-producer/<uid>/; only the caller's own folder is ever read.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { deductCreditsOnce, hasSufficientBalance, refundCredits } from '@/lib/orchestrator/ledger';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { lyriaRequest, musicWithinBudget, recordMusicUsage } from '@/lib/ai/lyriaMusic';
import { probeTrackDurationSec } from '@/lib/audio/trackDuration';
import { ProducerError } from './errors';
import { joinArgs } from './extend';
import type { ProducerMeta } from './library';
import type { ProducerRunDeps } from './run';

const exec = promisify(execFile);
export const RESULTS_BUCKET = 'renders';
const WEEK_SEC = 7 * 24 * 3600;
const MAX_TRACK_BYTES = 40 * 1024 * 1024;

export const producerPath = (userId: string, id: string, ext: 'mp3' | 'json') => `music-producer/${userId}/${id}.${ext}`;

/** True only for a path inside the caller's own Music Producer folder. Exported for tests. */
export function ownsProducerPath(path: string, userId: string): boolean {
  return path.startsWith(`music-producer/${userId}/`) && !path.includes('..') && /^[A-Za-z0-9._/-]+$/.test(path);
}

export async function ffmpegJoin(parent: Buffer, next: Buffer, plan: Parameters<typeof joinArgs>[3]): Promise<Buffer> {
  const bin = (ffmpegStatic as unknown as string) || '';
  if (!bin) throw new ProducerError('join_failed', 'ffmpeg is missing.', 503);
  const dir = await mkdtemp(join(tmpdir(), 'mp-join-'));
  try {
    const a = join(dir, 'a.mp3'); const b = join(dir, 'b.mp3'); const out = join(dir, 'out.mp3');
    await writeFile(a, parent); await writeFile(b, next);
    await exec(bin, joinArgs(a, b, out, plan), { maxBuffer: 1 << 22, timeout: 60_000 });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function liveProducerDeps(): ProducerRunDeps {
  const sb = () => createServiceRoleClient();
  return {
    async loadRecipe(userId, id) {
      const { data, error } = await sb().storage.from(RESULTS_BUCKET).download(producerPath(userId, id, 'json'));
      if (error || !data) return null;
      try {
        const meta = JSON.parse(await data.text()) as ProducerMeta;
        return meta?.kind === 'music-producer' && meta.id === id && ownsProducerPath(meta.audioPath, userId) ? meta : null;
      } catch { return null; }
    },
    async loadAudio(userId, path) {
      if (!ownsProducerPath(path, userId)) throw new ProducerError('not_found', 'That track was not found.', 404);
      const { data, error } = await sb().storage.from(RESULTS_BUCKET).download(path);
      if (error || !data || data.size > MAX_TRACK_BYTES) throw new ProducerError('not_found', 'That track was not found.', 404);
      return Buffer.from(await data.arrayBuffer());
    },
    async generate(input, model, signal) {
      if (!(await musicWithinBudget(model))) throw new ProducerError('budget_refused', 'The music budget is used up for now.', 503);
      const r = await lyriaRequest(input, model, signal);
      if (!r.ok) return null;
      void recordMusicUsage(model);
      return { base64: r.track.base64, mime: r.track.mime, caption: r.caption };
    },
    join: ffmpegJoin,
    measure: (bytes) => probeTrackDurationSec(bytes, 'mp3'),
    hold: (userId, credits) => hasSufficientBalance(userId, credits),
    async charge(userId, credits, ref) { return (await deductCreditsOnce(userId, credits, ref)).ok; },
    async refund(userId, credits, ref) { await refundCredits(userId, credits, ref); },
    async save(userId, id, bytes, mime) {
      const path = producerPath(userId, id, 'mp3');
      const { error } = await sb().storage.from(RESULTS_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw new ProducerError('not_configured', 'Music storage is unavailable.', 503);
      const url = await createSignedAssetUrl(RESULTS_BUCKET, path, WEEK_SEC);
      if (!url) throw new ProducerError('not_configured', 'Music storage is unavailable.', 503);
      return { path, url };
    },
    async record(userId, id, url, meta) {
      // The recipe sits next to the track (no DB column change while Supabase migrations are frozen).
      const { error } = await sb().storage.from(RESULTS_BUCKET).upload(producerPath(userId, id, 'json'), Buffer.from(JSON.stringify(meta)), { contentType: 'application/json', upsert: true });
      if (error) throw new ProducerError('not_configured', 'Music storage is unavailable.', 503);
      await recordCompletedAsset({ id, userId, serviceType: 'music', url, prompt: meta.spec.brief || null, subtype: `producer-${meta.action}`, storageVerified: true });
    },
    newId: randomUUID,
    now: () => new Date(),
  };
}
