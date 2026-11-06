/**
 * lib/agent/workspace/live.ts — the workspace store on Supabase Storage: one PRIVATE bucket (WORKSPACE_BUCKET), every
 * object under the owner's user id, read and written with the service role by this file only. The generic signers
 * refuse this bucket (lib/orchestrator/storage-adapter refuseTwin), so a link to a workspace file is minted here, for
 * a path the store built from the caller's own uid, and nowhere else.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ensureBucket } from '@/lib/orchestrator/storage-adapter';
import { WORKSPACE_BUCKET, WS_MAX_FILE_BYTES } from './paths';
import { workspaceStore, type BlobStore, type WorkspaceStore } from './store';

type BucketApi = Parameters<typeof ensureBucket>[0];

export function supabaseBlobs(bucket: string = WORKSPACE_BUCKET): BlobStore {
  const sb = () => {
    const c = createServiceRoleClient();
    if (!c) throw new Error('storage not configured');
    return c;
  };
  let ready: Promise<unknown> | null = null;
  const ensure = (c: ReturnType<typeof sb>) => (ready ??= ensureBucket(c as unknown as BucketApi, bucket, `${WS_MAX_FILE_BYTES / 1024 / 1024}MB`));
  return {
    async get(path) {
      const c = sb();
      const { data, error } = await c.storage.from(bucket).download(path);
      if (error || !data) {
        // A missing object is an answer (null); anything else is storage failing, and the store says so.
        const status = (error as { statusCode?: string | number; status?: number } | null);
        const code = Number(status?.statusCode ?? status?.status ?? 0);
        if (code === 404 || code === 400 || /not.?found|does not exist/i.test(error?.message ?? '')) return null;
        throw new Error(error?.message ?? 'download failed');
      }
      return Buffer.from(await data.arrayBuffer());
    },
    async put(path, bytes, contentType) {
      const c = sb();
      await ensure(c);
      const { error } = await c.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(error.message);
    },
    async remove(paths) {
      if (!paths.length) return;
      await sb().storage.from(bucket).remove(paths);
    },
    async sign(path, ttlSec, downloadName) {
      const { data, error } = await sb().storage.from(bucket).createSignedUrl(path, ttlSec, downloadName ? { download: downloadName } : undefined);
      return error || !data?.signedUrl ? null : data.signedUrl;
    },
  };
}

let shared: WorkspaceStore | null = null;
/** One store per instance, so its per-workspace write queue is shared by every request on it. */
export function liveWorkspaceStore(): WorkspaceStore {
  return (shared ??= workspaceStore(supabaseBlobs()));
}

/** The workspace Agent G uses when none is named. */
export const AGENT_WORKSPACE_TITLE = 'Agent G';

/** Filing a workspace file in the Library: a copy in the Library's own bucket (`renders`), then its generation_jobs row. */
export function liveExportDeps(): import('./actions').ExportDeps {
  return {
    async toLibrary({ userId, path, bytes, contentType, kind }) {
      const [{ uploadBufferAndSign }, { recordCompletedAsset }, { randomUUID }] = await Promise.all([
        import('@/lib/orchestrator/storage-adapter'),
        import('@/lib/orchestrator/jobs'),
        import('node:crypto'),
      ]);
      const id = randomUUID();
      const ext = (path.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
      // The same bucket and link life as Agent G's PDFs; the Library re-signs on every read.
      const url = await uploadBufferAndSign('renders', `${userId}/workspace/${id}.${ext}`, bytes, contentType, 604_800);
      if (!url) return null;
      const ok = await recordCompletedAsset({
        id, userId, serviceType: kind, url, prompt: path, source: 'agent-g-workspace', storageVerified: true,
      });
      return ok ? id : null;
    },
  };
}
