'use client';

/**
 * useCatalogueStatus — GET /api/studio/catalogue?service=… once per service for every picker on the page, cached for a short
 * TTL and de-duplicated while in flight. `null` until it answers, or if it never does: the picker then offers only its own
 * route's rows, which is what the panel always did (lib/studio/modelPick pickerRows).
 *
 * Asked only when `enabled` — the pickers pass "the sheet is open", so a person who never opens one costs no request.
 */
import { useEffect, useState } from 'react';
import type { Availability, CatalogueService, UnavailableReason } from '@/lib/providers/catalogue';
import type { CatalogueStatus } from '@/lib/studio/modelPick';

const TTL_MS = 30_000;
const REASONS: ReadonlySet<string> = new Set<UnavailableReason>(['unverified', 'not_enabled', 'studio_off', 'not_configured', 'busy']);

const cache = new Map<CatalogueService, { at: number; value: CatalogueStatus | null }>();
const inflight = new Map<CatalogueService, Promise<CatalogueStatus | null>>();

/** Validate the wire answer: anything malformed is dropped row by row, never trusted. */
export function parseCatalogueStatus(raw: unknown): CatalogueStatus | null {
  const models = (raw as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return null;
  const out: Record<string, Availability> = {};
  for (const m of models) {
    const r = m as { id?: unknown; available?: unknown; reason?: unknown } | null;
    if (!r || typeof r.id !== 'string') continue;
    const reason = typeof r.reason === 'string' && REASONS.has(r.reason) ? (r.reason as UnavailableReason) : null;
    out[r.id] = { available: r.available === true, reason: r.available === true ? null : reason ?? 'not_enabled' };
  }
  return out;
}

export async function fetchCatalogueStatus(service: CatalogueService, f: typeof fetch = fetch): Promise<CatalogueStatus | null> {
  const hit = cache.get(service);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const running = inflight.get(service);
  if (running) return running;
  const p = (async () => {
    try {
      const res = await f(`/api/studio/catalogue?service=${service}`, { credentials: 'include' });
      const value = res.ok ? parseCatalogueStatus(await res.json().catch(() => null)) : null;
      if (value) cache.set(service, { at: Date.now(), value });
      return value ?? hit?.value ?? null;
    } catch {
      // Keep whatever we last knew; a failure is not cached (the next open asks again).
      return hit?.value ?? null;
    } finally {
      inflight.delete(service);
    }
  })();
  inflight.set(service, p);
  return p;
}

/** Tests only. */
export function __resetCatalogueStatusCache(): void {
  cache.clear();
  inflight.clear();
}

export function useCatalogueStatus(service: CatalogueService, enabled: boolean): CatalogueStatus | null {
  const [status, setStatus] = useState<CatalogueStatus | null>(() => {
    const hit = cache.get(service);
    return hit && Date.now() - hit.at < TTL_MS ? hit.value : null;
  });
  useEffect(() => {
    if (!enabled || typeof fetch !== 'function') return;
    let alive = true;
    void fetchCatalogueStatus(service).then((v) => { if (alive && v) setStatus(v); });
    return () => { alive = false; };
  }, [service, enabled]);
  return status;
}
