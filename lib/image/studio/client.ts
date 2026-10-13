import { parseImagePlan, type ImagePlan, type ImageRequest, type SavedImage } from './contracts';
export interface ClientQuote { jobId: string; credits: number; expiresAt: number; plan: ImagePlan; token: string; supplementaryInstructions: string[] }
export interface ClientJob {
  jobId: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; stage: string;
  error: string | null; cancellable: boolean; settlementPending: boolean;
  result: (SavedImage & { originalPrompt: string; parentJobId: string | null }) | null;
}
export interface ImageModel { id: string; label?: string; operations: string[]; aspects: ImageRequest['aspectRatio'][]; resolutions: ImageRequest['resolution'][] }
export interface ImageAccess { userId: string; models: ImageModel[] }
export interface ImageAsset { id: string; request: ImageRequest; image: SavedImage }
export interface ImageVersion { id: string; parentJobId: string | null; status: string; operation: string; prompt: string }
export interface ImageVersions { current: ImageVersion; ancestors: ImageVersion[]; children: ImageVersion[]; moreAncestors: boolean; moreChildren: boolean }
export class ImageClientError extends Error { constructor(public code: string) { super(code); } }
export async function imageApi<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    cache: 'no-store', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: signal ?? AbortSignal.timeout(120_000) }); }
  catch { throw new ImageClientError('network_error'); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) throw new ImageClientError(data?.error ?? 'unknown_error');
  return data as T;
}
export interface BatchItem { quote: ClientQuote; issued: boolean; job?: ClientJob }
/** Only job identifiers, quotes and the user's draft in this tab; no image bytes or credentials. Never restored across owners. */
export function readBatch(userId: string): BatchItem[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem('image-studio:v1:' + userId) ?? '[]');
    if (!Array.isArray(value) || value.length > 4) return [];
    const seen = new Set<string>(), restored: BatchItem[] = [];
    for (const item of value) {
      const q = item?.quote;
      if (typeof item?.issued !== 'boolean' || !q ||
        typeof q.jobId !== 'string' || !q.jobId || seen.has(q.jobId) ||
        typeof q.token !== 'string' || !q.token ||
        typeof q.credits !== 'number' || !Number.isFinite(q.credits) || q.credits < 0 ||
        typeof q.expiresAt !== 'number' || !Number.isFinite(q.expiresAt) ||
        !Array.isArray(q.supplementaryInstructions) || !q.supplementaryInstructions.every((s: unknown) => typeof s === 'string')) continue;
      try {
        const plan = parseImagePlan(q.plan);
        restored.push({ issued: item.issued, quote: { jobId: q.jobId, token: q.token,
          credits: q.credits, expiresAt: q.expiresAt, supplementaryInstructions: q.supplementaryInstructions, plan } });
        seen.add(q.jobId);
      } catch { /* A corrupt tab entry must not crash the workspace or restore untrusted result URLs. */ }
    }
    return restored;
  } catch { return []; }
}
export function saveBatch(userId: string, batch: BatchItem[]): boolean {
  try {
    // Signed URLs are short-lived: refresh them through authenticated status, never retain them as ownership evidence.
    sessionStorage.setItem('image-studio:v1:' + userId, JSON.stringify(batch.map(({ quote, issued }) => ({ quote, issued }))));
    return true;
  } catch { return false; }
}
export const finalJob = (job?: ClientJob) => !!job && ['completed', 'failed', 'cancelled'].includes(job.status);
