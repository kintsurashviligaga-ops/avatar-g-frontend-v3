/**
 * lib/studio3d/engine.ts — how the app starts and watches the TRELLIS.2 worker. Server-only at runtime (it is handed a
 * token), but pure enough to test: `fetch` and the token are injected.
 *
 * The worker is OUR OWN Cloud Run JOB (services/studio3d-worker, PR B; not deployed until GG approves decision D3).
 * No third-party inference: the open-weights TRELLIS.2 model (MIT) runs inside our GCP project. The job gets ONE env
 * var, STUDIO3D_SPEC = base64(JSON spec). The spec holds signed Supabase UPLOAD urls for each output, so the worker needs
 * no database or storage credentials and can only write the exact files this job owns.
 *
 * Cloud Run Admin API v2:
 *   POST https://run.googleapis.com/v2/projects/{p}/locations/{r}/jobs/{job}:run  (body: overrides) → Operation{metadata: Execution}
 *   GET  https://run.googleapis.com/v2/{execution name}                           → Execution{runningCount, succeededCount, failedCount, …}
 */
import type { Studio3dMode, Studio3dFaces } from './spec';
import { DETAIL_GRID, FACE_TARGET } from './spec';

export interface WorkerSpec {
  v: 1;
  jobId: string;
  mode: Studio3dMode;
  /** Picture TRELLIS.2 reads (photo, approved reference, or repainted front view). Signed READ url. */
  imageUrl: string;
  /** Existing model for retexture. Signed READ url. */
  meshUrl?: string;
  grid: number;
  faces: number;
  /** Signed UPLOAD urls, one per file the worker may write. */
  uploads: { glb: string; turntable: string; preview: string; manifest: string };
}

export interface EngineConfig {
  project: string;
  region: string;
  job: string;
  /** Cloud Run task timeout; a stuck GPU never bills longer than this. */
  timeoutSec: number;
}

export function engineConfig(env: Record<string, string | undefined> = process.env): EngineConfig | null {
  const project = env.STUDIO_3D_GCP_PROJECT?.trim();
  const job = env.STUDIO_3D_JOB?.trim();
  if (!project || !job) return null;
  const region = env.STUDIO_3D_REGION?.trim() || 'europe-west4';
  const t = Number(env.STUDIO_3D_TIMEOUT_SEC);
  return { project, region, job, timeoutSec: Number.isFinite(t) && t >= 120 && t <= 1800 ? Math.round(t) : 600 };
}

export function buildSpec(args: {
  jobId: string;
  mode: Studio3dMode;
  imageUrl: string;
  meshUrl?: string;
  high: boolean;
  faces: Studio3dFaces;
  uploads: WorkerSpec['uploads'];
}): WorkerSpec {
  return {
    v: 1,
    jobId: args.jobId,
    mode: args.mode,
    imageUrl: args.imageUrl,
    ...(args.meshUrl ? { meshUrl: args.meshUrl } : {}),
    grid: args.mode === 'retexture' ? DETAIL_GRID.standard : DETAIL_GRID[args.high ? 'high' : 'standard'],
    faces: FACE_TARGET[args.faces],
    uploads: args.uploads,
  };
}

export const encodeSpec = (s: WorkerSpec) => Buffer.from(JSON.stringify(s), 'utf8').toString('base64');
export const decodeSpec = (b64: string) => JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as WorkerSpec;

export type WorkerState = 'pending' | 'running' | 'succeeded' | 'failed';

export interface Studio3dEngine {
  start(spec: WorkerSpec): Promise<{ execution: string }>;
  status(execution: string): Promise<{ state: WorkerState; detail?: string }>;
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class EngineError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'EngineError';
  }
}

export function cloudRunEngine(cfg: EngineConfig, deps: { fetch: FetchLike; token: () => Promise<string> }): Studio3dEngine {
  const base = 'https://run.googleapis.com/v2';
  const headers = async () => ({ authorization: `Bearer ${await deps.token()}`, 'content-type': 'application/json' });

  return {
    async start(spec) {
      const url = `${base}/projects/${cfg.project}/locations/${cfg.region}/jobs/${cfg.job}:run`;
      const body = {
        overrides: {
          containerOverrides: [{ env: [{ name: 'STUDIO3D_SPEC', value: encodeSpec(spec) }] }],
          taskCount: 1,
          timeout: `${cfg.timeoutSec}s`,
        },
      };
      const res = await deps.fetch(url, { method: 'POST', headers: await headers(), body: JSON.stringify(body) });
      if (!res.ok) throw new EngineError(`worker start failed (${res.status})`, res.status);
      const op = (await res.json()) as { metadata?: { name?: string } };
      const execution = op.metadata?.name;
      if (!execution || !execution.startsWith(`projects/${cfg.project}/locations/${cfg.region}/jobs/${cfg.job}/executions/`)) {
        throw new EngineError('worker start returned no execution');
      }
      return { execution };
    },

    async status(execution) {
      if (!/^projects\/[\w-]+\/locations\/[\w-]+\/jobs\/[\w-]+\/executions\/[\w-]+$/.test(execution)) throw new EngineError('bad execution name');
      const res = await deps.fetch(`${base}/${execution}`, { method: 'GET', headers: await headers() });
      if (!res.ok) throw new EngineError(`worker status failed (${res.status})`, res.status);
      return executionState((await res.json()) as CloudRunExecution);
    },
  };
}

export interface CloudRunExecution {
  runningCount?: number;
  succeededCount?: number;
  failedCount?: number;
  cancelledCount?: number;
  completionTime?: string;
  conditions?: { type?: string; state?: string; message?: string }[];
}

export function executionState(e: CloudRunExecution): { state: WorkerState; detail?: string } {
  if ((e.succeededCount ?? 0) > 0) return { state: 'succeeded' };
  if ((e.failedCount ?? 0) > 0 || (e.cancelledCount ?? 0) > 0) {
    const c = e.conditions?.find((x) => x.state === 'CONDITION_FAILED');
    return { state: 'failed', detail: c?.message?.slice(0, 300) };
  }
  if ((e.runningCount ?? 0) > 0) return { state: 'running' };
  return { state: e.completionTime ? 'failed' : 'pending' };
}

/** The file the worker writes last. Progress lines come before it in the same JSON (`step`). */
export interface WorkerManifest {
  v: 1;
  jobId: string;
  step: 'shape' | 'texture' | 'export' | 'done' | 'failed';
  error?: string;
  faces?: number;
  gpuSeconds?: number;
}

export function parseManifest(raw: unknown, jobId: string): WorkerManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== 1 || m.jobId !== jobId) return null;
  if (!['shape', 'texture', 'export', 'done', 'failed'].includes(String(m.step))) return null;
  return {
    v: 1,
    jobId,
    step: m.step as WorkerManifest['step'],
    ...(typeof m.error === 'string' ? { error: m.error.slice(0, 300) } : {}),
    ...(typeof m.faces === 'number' && m.faces > 0 ? { faces: Math.round(m.faces) } : {}),
    ...(typeof m.gpuSeconds === 'number' && m.gpuSeconds > 0 ? { gpuSeconds: m.gpuSeconds } : {}),
  };
}
