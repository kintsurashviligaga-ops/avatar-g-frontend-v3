import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import { deductCreditsOnce, netDebitedForRef, refundCredits } from '@/lib/orchestrator/ledger';
import { createSignedAssetUrl, describeSupabaseObjectUrl, ownStorageHosts } from '@/lib/orchestrator/storage-adapter';
import { ownsUploadObject, uploadBucket } from '@/lib/security/callerMedia';
import { googleTransports, googleTransportKind } from '@/lib/ai/google/transport';
import { createUpstashRedis } from '@/lib/platform/upstash';
import { upstashRestEnv } from '@/lib/platform/upstashEnv';
import { ACQUIRE_LUA } from '@/lib/studio/semaphore';
import { fetchPublicBytes } from '@/lib/web/publicFetch';
import { reportError } from '@/lib/observability/report-error';
import { loadImageReference, type ImageAssetIO } from './assets';
import { ImageError } from './errors';
import { qualityCheck, MAX_IMAGE_BYTES } from './quality';
import { invokeGoogleImage } from './provider';
import type { ImageDeps } from './engine';

const BUCKET = 'renders';
const TTL = 900;
const SLOT_MS = 15 * 60_000;
const assetPath = (id: string, userId: string, file: string) => 'image-studio/' + userId + '/' + id + '/' + file;
const unavailable = () => new ImageError('storage_error', 'Private image storage is unavailable.', 503);

async function privateBucket(bucket: string) {
  const sb = createServiceRoleClient();
  const { data, error } = await sb.storage.getBucket(bucket);
  if (error || !data || data.public !== false) throw unavailable();
  return sb;
}
async function putPrivate(path: string, bytes: Buffer, mime: string) {
  const sb = await privateBucket(BUCKET);
  // Existing bucket only. Never create/update a bucket or grant public access.
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true, cacheControl: '0' });
  if (error) throw unavailable();
}
async function signPrivate(bucket: string, path: string) {
  await privateBucket(bucket);
  const url = await createSignedAssetUrl(bucket, path, TTL);
  if (!url) throw unavailable();
  return url;
}
async function ownResult(id: string, userId: string) {
  const { data, error } = await createServiceRoleClient().from('generation_jobs')
    .select('user_id,status,service_type,signed_url,result').eq('id', id).eq('user_id', userId).eq('status', 'completed').maybeSingle();
  if (error || !data || data.user_id !== userId || !['image', 'interior'].includes(data.service_type)) return null;
  const ref = describeSupabaseObjectUrl(data.signed_url || data.result?.url || '');
  if (!ref || !ownStorageHosts().has(ref.host) || !['renders', uploadBucket()].includes(ref.bucket)) return null;
  // A caller-writable Library row is not authority over a different private object.
  const owned = ref.bucket === BUCKET ? ref.path === assetPath(id, userId, 'result.png')
    : ref.bucket === uploadBucket() && ownsUploadObject(ref.path, userId);
  if (!owned) return null;
  return signPrivate(ref.bucket, ref.path);
}
const assetIO: ImageAssetIO = {
  async ownedUpload(path, userId) {
    if (!ownsUploadObject(path, userId)) return null;
    return signPrivate(uploadBucket(), path);
  },
  ownedResult: ownResult,
  async download(url, maxBytes) {
    const r = await fetchPublicBytes(url, { maxBytes, accept: /^image\/(png|jpeg|webp)$/,
      timeoutMs: 25_000, maxHops: 0, allowUrl: candidate => {
        const ref = describeSupabaseObjectUrl(candidate);
        return !!ref && ref.access === 'sign' && ownStorageHosts().has(ref.host);
      } });
    if (!r.ok) throw new ImageError('invalid_reference', 'The private reference could not be read within the image limits.');
    return { bytes: r.bytes, mime: r.contentType };
  },
};
function slotRedis() {
  const env = upstashRestEnv();
  if (!env) throw new ImageError('not_configured', 'The image concurrency guard is unavailable.', 503);
  return createUpstashRedis(env.url, env.token);
}
const userKey = (userId: string) => 'image-studio:v1:inflight:' + userId;
const globalKey = 'image-studio:v1:inflight';
export function liveImageDeps(): ImageDeps {
  const transport = googleTransportKind();
  return {
    store: supabaseLeaseStore(() => createServiceRoleClient(), reportError),
    transport,
    key: () => process.env.AGENT_G_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    now: Date.now,
    newId: randomUUID,
    prepare: (ref, userId) => loadImageReference(assetIO, ref, userId),
    checkParent: async (id, userId) => !!await ownResult(id, userId),
    assertConfigured() {
      googleTransports.selectFixed(transport);
      slotRedis();
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ImageError('not_configured', 'Image persistence is unavailable.', 503);
    },
    async admit(id, userId) {
      const redis = slotRedis();
      // Reuse the application's atomic semaphore script; errors fail CLOSED for this paid lane.
      const acquire = async (key: string, limit: number) => Number(await redis.eval(ACQUIRE_LUA, [key], [Date.now(), SLOT_MS, limit, id])) === 1;
      try {
        if (!await acquire(userKey(userId), 2)) return false;
        if (await acquire(globalKey, 4)) return true;
        await redis.zrem(userKey(userId), id);
        return false;
      } catch { throw new ImageError('not_configured', 'The image concurrency guard is unavailable.', 503); }
    },
    async releaseAdmission(id, userId) {
      const redis = slotRedis();
      await Promise.all([redis.zrem(userKey(userId), id), redis.zrem(globalKey, id)]);
    },
    async reserve(userId, credits, ref) {
      const r = await deductCreditsOnce(userId, credits, ref);
      return { charged: r.ok, reason: r.ok ? 'ok' : r.reason ?? 'error' };
    },
    async refund(userId, ref, credits) {
      const net = await netDebitedForRef(userId, ref);
      if (net === null) return 'error';
      const amount = Math.min(net, credits);
      if (amount <= 0) return 'nothing';
      const r = await refundCredits(userId, amount, ref + ':refund');
      return r.ok ? 'refunded' : 'error';
    },
    async persistPayload(id, userId, payload) {
      const path = assetPath(id, userId, 'provider-request.json');
      await putPrivate(path, Buffer.from(JSON.stringify(payload)), 'application/json');
      return path;
    },
    generate: (plan, payload, signal) => invokeGoogleImage(googleTransports.selectFixed(transport), plan, payload, signal),
    async save(id, userId, image) {
      const path = assetPath(id, userId, 'result.png');
      await putPrivate(path, image.data, 'image/png');
      const url = await signPrivate(BUCKET, path);
      return { path, url, width: image.width, height: image.height, bytes: image.bytes, mime: image.mime, digest: image.digest };
    },
    async recover(id, userId, request) {
      const path = assetPath(id, userId, 'result.png');
      const url = await signPrivate(BUCKET, path);
      const r = await fetchPublicBytes(url, { maxBytes: MAX_IMAGE_BYTES, accept: /^image\/png$/, timeoutMs: 25_000, maxHops: 0 });
      if (!r.ok) return null;
      const checked = await qualityCheck(r.bytes, r.contentType, request);
      return { path, url, width: checked.width, height: checked.height, bytes: checked.bytes, mime: checked.mime, digest: checked.digest };
    },
    async resign(image, userId) {
      if (!image.path.startsWith('image-studio/' + userId + '/') || image.path.includes('..')) throw unavailable();
      return { ...image, url: await signPrivate(BUCKET, image.path) };
    },
    every(ms, tick) {
      let busy = false;
      const timer = setInterval(() => {
        if (busy) return;
        busy = true;
        void tick().catch(() => undefined).finally(() => { busy = false; });
      }, ms);
      return () => clearInterval(timer);
    },
    async audit(event) {
      // Exact payload lives privately; operational logs carry IDs/status/cost only.
      const { userId, ...props } = event;
      try {
        const { error } = await createServiceRoleClient().from('analytics_events').insert({
          user_id: userId, event_name: 'audit.image_studio', props,
        });
        if (error) reportError(new Error('Image audit write failed'), { fn: 'image.audit', jobId: event.jobId });
      } catch { reportError(new Error('Image audit unavailable'), { fn: 'image.audit', jobId: event.jobId }); }
    },
  };
}
