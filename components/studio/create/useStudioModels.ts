'use client';

/**
 * useStudioModels — GET /api/studio/models?service=… once per service (cached, de-duplicated): the Higgsfield models THIS
 * deployment enabled, each with the form description of its schema (lib/providers/paramSpec). The panels need it only once
 * a Higgsfield model is picked, to send exactly the parameters that model takes (lib/studio/hfParams).
 *
 * `null` while unknown; `[]` when the route answers nothing (STUDIO_V2 off answers 404) — the panel then says the model is
 * unavailable instead of offering a button that cannot work.
 */
import { useEffect, useState } from 'react';
import type { StudioModel } from '@/lib/studio/ui/dock';

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: StudioModel[] }>();
const inflight = new Map<string, Promise<StudioModel[]>>();

export async function fetchStudioModels(service: string, f: typeof fetch = fetch): Promise<StudioModel[]> {
  const hit = cache.get(service);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const running = inflight.get(service);
  if (running) return running;
  const p = (async () => {
    try {
      const res = await f(`/api/studio/models?service=${encodeURIComponent(service)}`, { cache: 'no-store', credentials: 'include' });
      const j = res.ok ? ((await res.json().catch(() => null)) as { models?: unknown } | null) : null;
      const value = Array.isArray(j?.models) ? (j!.models as StudioModel[]).filter((m) => m && typeof m.id === 'string' && Array.isArray(m.params)) : [];
      cache.set(service, { at: Date.now(), value });
      return value;
    } catch {
      return hit?.value ?? [];
    } finally {
      inflight.delete(service);
    }
  })();
  inflight.set(service, p);
  return p;
}

/** Tests only. */
export function __resetStudioModelsCache(): void {
  cache.clear();
  inflight.clear();
}

export function useStudioModels(service: string, enabled: boolean): StudioModel[] | null {
  const [models, setModels] = useState<StudioModel[] | null>(() => {
    const hit = cache.get(service);
    return hit && Date.now() - hit.at < TTL_MS ? hit.value : null;
  });
  useEffect(() => {
    if (!enabled || typeof fetch !== 'function') return;
    let alive = true;
    void fetchStudioModels(service).then((v) => { if (alive) setModels(v); });
    return () => { alive = false; };
  }, [service, enabled]);
  return models;
}
