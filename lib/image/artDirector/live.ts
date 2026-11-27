/**
 * lib/image/artDirector/live.ts — the real side effects behind runArt (Vertex only, existing ledger RPCs). Server only.
 *
 * Billing uses the same ledger calls every image route uses (deductCreditsOnce per delivered image, refundCredits on a
 * save miss); nothing here changes the ledger, BOG or the wallet. Pictures are read only from the caller's own upload
 * folder (ownsUploadObject) or their own Art Director results (renders/art-director/<uid>/…).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { deductCreditsOnce, hasSufficientBalance, refundCredits } from '@/lib/orchestrator/ledger';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { ownsUploadObject, uploadBucket } from '@/lib/security/callerMedia';
import { googleImageModelFetch, googleImageTransportBlocker } from '@/lib/ai/google/transport';
import { RATE_LIMIT_BACKOFF_MS, retryAfterMs } from '@/lib/ai/geminiImage';
import { guardedCall } from '@/lib/services/billing/guardedCall';
import { ArtError } from './errors';
import { ART_MODEL } from './spec';
import type { ArtRunDeps } from './run';
import type { ArtFileDeps } from './download';

export const RESULTS_BUCKET = 'renders';
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const WEEK_SEC = 7 * 24 * 3600;
export const resultPath = (userId: string, id: string, ext: 'png' | 'json') => `art-director/${userId}/${id}.${ext}`;

/** Where an owner-checked path lives, or null (not the caller's). Exported for tests. */
export function ownedLocation(path: string, userId: string): { bucket: string; path: string } | null {
  if (ownsUploadObject(path, userId)) return { bucket: uploadBucket(), path };
  if (path.startsWith(`art-director/${userId}/`) && !path.includes('..') && /^[A-Za-z0-9._/-]+$/.test(path)) return { bucket: RESULTS_BUCKET, path };
  return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function liveArtDeps(): ArtRunDeps {
  const sb = () => createServiceRoleClient();
  return {
    async load(path, userId) {
      const loc = ownedLocation(path, userId);
      if (!loc) throw new ArtError('not_found', 'That picture was not found.', 404);
      const { data, error } = await sb().storage.from(loc.bucket).download(loc.path);
      if (error || !data) throw new ArtError('not_found', 'That picture was not found.', 404);
      if (data.size > MAX_SOURCE_BYTES) throw new ArtError('invalid_reference', 'That picture is larger than 20 MB.');
      return Buffer.from(await data.arrayBuffer());
    },
    async generate(body, signal) {
      if (googleImageTransportBlocker()) throw new ArtError('not_configured', 'Image generation is unavailable.', 503);
      return guardedCall({ service: 'image', model: 'gemini-image', units: 1, promptSummary: 'art-director' }, async () => {
        const send = () => googleImageModelFetch(ART_MODEL, 'generateContent', { method: 'POST', cache: 'no-store', body: JSON.stringify(body), signal });
        let res = await send();
        for (const wait of RATE_LIMIT_BACKOFF_MS) {
          if (res.status !== 429) break;
          await sleep(retryAfterMs(res.headers.get('retry-after')) ?? wait);
          res = await send();
        }
        if (!res.ok) throw new ArtError('provider_unavailable', `Vertex answered ${res.status}.`, 502);
        return res.json();
      });
    },
    hold: (userId, total) => hasSufficientBalance(userId, total),
    async charge(userId, credits, ref) { return (await deductCreditsOnce(userId, credits, ref)).ok; },
    async refund(userId, credits, ref) { await refundCredits(userId, credits, ref); },
    async save(userId, id, png) {
      const path = resultPath(userId, id, 'png');
      const { error } = await sb().storage.from(RESULTS_BUCKET).upload(path, png, { contentType: 'image/png', upsert: false });
      if (error) throw new ArtError('not_configured', 'Image storage is unavailable.', 503);
      const url = await createSignedAssetUrl(RESULTS_BUCKET, path, WEEK_SEC);
      if (!url) throw new ArtError('not_configured', 'Image storage is unavailable.', 503);
      return { path, url };
    },
    async record(userId, id, url, meta) {
      // The recipe sits next to the picture (no DB column change while Supabase migrations are frozen).
      await sb().storage.from(RESULTS_BUCKET).upload(resultPath(userId, id, 'json'), Buffer.from(JSON.stringify(meta)), { contentType: 'application/json', upsert: true });
      await recordCompletedAsset({ id, userId, serviceType: 'image', url, prompt: meta.prompt, subtype: meta.subtype, storageVerified: true });
    },
    newId: randomUUID,
    now: () => new Date(),
  };
}

/** Reads one object of the results bucket (the download and recipe routes check the path with artResultId first). */
export function artFileReader(): ArtFileDeps {
  return {
    async read(path) {
      const { data, error } = await createServiceRoleClient().storage.from(RESULTS_BUCKET).download(path);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
  };
}
