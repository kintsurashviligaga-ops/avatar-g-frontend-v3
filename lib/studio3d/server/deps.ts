/**
 * lib/studio3d/server/deps.ts — the real dependencies behind lib/studio3d/server/service. Server-only. Every paid call
 * goes through the app's existing helpers: the ledger (lib/orchestrator/ledger, Preview-safe), Gemini on Vertex
 * (lib/ai/geminiImage, lib/ai/llmText) and our own Cloud Run job (lib/studio3d/engine with the Vertex WIF token).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deductCreditsOnce, refundCredits } from '@/lib/orchestrator/ledger';
import { createSignedAssetUrl, parseSupabaseObjectUrl, uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { generateGeminiImage } from '@/lib/ai/geminiImage';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { llmText } from '@/lib/ai/llmText';
import { getVertexAccessToken } from '@/lib/veo/vertexAuth';
import { cloudRunEngine, engineConfig } from '../engine';
import type { Studio3dJob } from '../pipeline';
import type { Studio3dRequest } from '../spec';
import { BUCKET, type JobRow, type Studio3dDeps } from './service';

const ACTIVE = ['queued', 'starting', 'shape', 'texture', 'export'];
const RUNNING = ['starting', 'shape', 'texture', 'export'];

type Row = { id: string; user_id: string; request: Studio3dRequest & { referencePath?: string }; state: Studio3dJob; created_at: string };

const toRow = (r: Row): JobRow => {
  const { referencePath, ...request } = r.request;
  return { id: r.id, userId: r.user_id, request, state: r.state, ...(referencePath ? { referencePath } : {}), createdAt: Date.parse(r.created_at) };
};
const fromRow = (j: JobRow) => ({
  id: j.id,
  user_id: j.userId,
  mode: j.request.mode,
  prompt: j.request.prompt,
  request: { ...j.request, ...(j.referencePath ? { referencePath: j.referencePath } : {}) },
  state: j.state,
  step: j.state.step,
  updated_at: new Date().toISOString(),
});

export function studio3dDeps(): Studio3dDeps {
  const sb = createServiceRoleClient();
  const table = () => sb.from('studio3d_jobs');
  const cfg = engineConfig();
  const midnight = () => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  };
  const cap = Number(process.env.STUDIO_3D_DAILY_CAP);

  return {
    store: {
      async get(id) {
        const { data } = await table().select('id,user_id,request,state,created_at').eq('id', id).maybeSingle();
        return data ? toRow(data as Row) : null;
      },
      async insert(row) {
        const { error } = await table().insert({ ...fromRow(row), created_at: new Date(row.createdAt).toISOString() });
        return !error;
      },
      async update(row) {
        const { error } = await table().update(fromRow(row)).eq('id', row.id);
        return !error;
      },
      async counts(userId) {
        const [running, queued, today, mine] = await Promise.all([
          table().select('id', { count: 'exact', head: true }).in('step', RUNNING),
          table().select('id', { count: 'exact', head: true }).eq('step', 'queued'),
          table().select('id', { count: 'exact', head: true }).gte('created_at', midnight()),
          table().select('id', { count: 'exact', head: true }).eq('user_id', userId).in('step', ACTIVE),
        ]);
        return { running: running.count ?? 0, queued: queued.count ?? 0, todayTotal: today.count ?? 0, userActive: mine.count ?? 0 };
      },
      async oldestQueuedId() {
        const { data } = await table().select('id').eq('step', 'queued').order('created_at', { ascending: true }).limit(1).maybeSingle();
        return (data as { id?: string } | null)?.id ?? null;
      },
    },
    ledger: {
      deductOnce: (uid, credits, ref) => deductCreditsOnce(uid, credits, ref),
      refund: (uid, credits, ref) => refundCredits(uid, credits, ref),
    },
    storage: {
      signRead: (path, sec) => createSignedAssetUrl(BUCKET, path, sec),
      signReadAny: (bucket, path, sec) => createSignedAssetUrl(bucket, path, sec),
      async signUpload(path) {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
        return error || !data?.signedUrl ? null : data.signedUrl;
      },
      putBase64: async (path, b64, mime) => (await uploadAndSign(BUCKET, path, b64, mime)) !== null,
      async readJson(path) {
        const { data, error } = await sb.storage.from(BUCKET).download(path);
        if (error || !data) return null;
        try {
          return JSON.parse(await data.text());
        } catch {
          return null;
        }
      },
      pathOfOwnUrl: (url) => parseSupabaseObjectUrl(url),
    },
    gemini: {
      async image(prompt, refs) {
        const r = await generateGeminiImage({ prompt, aspectRatio: '1:1', ...(refs?.length ? { referenceImages: refs, requireReferences: true } : {}) });
        return r ? { base64: r.base64, mimeType: r.mimeType } : null;
      },
      text: (prompt) => llmText({ user: prompt, maxTokens: 5, temperature: 0, timeoutMs: 10_000 }),
    },
    library: {
      // The Library re-signs a verified storage link, so the model stays openable after this link expires.
      record: (row, glbUrl) =>
        recordCompletedAsset({ id: row.id, userId: row.userId, serviceType: 'image', subtype: 'model3d', url: glbUrl, prompt: row.request.prompt || null, source: 'studio3d', storageVerified: true }),
    },
    async readBytes(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    engine: cfg ? cloudRunEngine(cfg, { fetch: (u, i) => fetch(u, i), token: () => getVertexAccessToken(false) }) : null,
    newId: () => randomUUID(),
    now: () => Date.now(),
    ...(Number.isFinite(cap) && cap > 0 ? { dailyCap: Math.round(cap) } : {}),
  };
}
