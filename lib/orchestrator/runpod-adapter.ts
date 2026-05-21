/**
 * RunPod FFmpeg GPU assemble adapter.
 *
 * Pure request-building + response-parsing for the external GPU render
 * node, plus a small dispatch helper with exponential-backoff retry. Kept
 * free of Next/Supabase imports so the request shape is unit-testable in
 * isolation; the route supplies fetch + env.
 */

export interface RunPodSegment {
  url: string;
  durationSec: number;
  cameraMotion: string | null;
  render: Record<string, string | number>;
}

export interface RunPodManifest {
  segments: RunPodSegment[];
  voiceoverUrl: string | null;
  musicUrl: string | null;
  globalRender: Record<string, string | number>;
  pipelineId: string;
  /** URL the render node calls with intermediate + final lifecycle events. */
  callbackUrl?: string;
}

export interface RunPodConfig {
  webhookUrl: string;
  token: string;
}

/** Read + validate RunPod config from an env map. Returns null when unset. */
export function readRunPodConfig(env: Record<string, string | undefined> = process.env): RunPodConfig | null {
  const webhookUrl = String(env.RUNPOD_RENDER_WEBHOOK_URL ?? '').trim();
  const token = String(env.RUNPOD_RENDER_WEBHOOK_TOKEN ?? env.RUNPOD_API_TOKEN ?? '').trim();
  if (!webhookUrl || !token) return null;
  return { webhookUrl, token };
}

/** Build the exact HTTPS request (url + init) for the render node. */
export function buildRunPodRequest(cfg: RunPodConfig, manifest: RunPodManifest): { url: string; init: RequestInit } {
  return {
    url: cfg.webhookUrl,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ input: manifest }),
    },
  };
}

/** Parse a render-node response body into a final URL (or throw). */
export function parseRunPodResponse(data: unknown): string {
  const d = data as { output?: { url?: string }; url?: string } | null;
  const url = d?.output?.url ?? d?.url;
  if (!url || typeof url !== 'string') throw new Error('render node returned no url');
  return url;
}

export interface DispatchResult {
  url: string;
}

/**
 * Dispatch with exp-backoff retry (max 3) on 5xx / 429 / network errors.
 * 4xx (other than 429) fail fast. Honors an AbortSignal.
 */
export async function dispatchRunPod(
  cfg: RunPodConfig,
  manifest: RunPodManifest,
  opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<DispatchResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const { url, init } = buildRunPodRequest(cfg, manifest);
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let nonRetryable = false;
    try {
      const r = await doFetch(url, { ...init, signal: opts.signal });
      if (r.ok) {
        return { url: parseRunPodResponse(await r.json()) };
      }
      lastErr = new Error(`render node ${r.status}`);
      // 4xx (other than 429) is a client error — fail fast, no retry.
      if (r.status < 500 && r.status !== 429) nonRetryable = true;
    } catch (e) {
      lastErr = e;
      if ((e as Error)?.name === 'AbortError') throw e;
    }
    if (nonRetryable) break;
    if (attempt < 3) await new Promise(res => setTimeout(res, Math.min(8000, 700 * 2 ** (attempt - 1))));
  }
  throw lastErr instanceof Error ? lastErr : new Error('render node unreachable');
}
