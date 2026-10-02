/**
 * lib/genjutsu/serverCommon.ts — what the VFX routes share: the per-user rate, the global daily cap, owner-checked
 * signing of the caller's uploads, and the one JSON error shape. Server-only.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import type { RateLimitConfig } from '@/lib/api/rate-limit';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { getRedisClient } from '@/lib/platform/redis';
import { ownsUploadPath, type Issue } from './contract';

/** Per ACCOUNT, not per IP: IP rotation must not defeat a cap on a cost-bearing mint. Six starts a minute. */
export const GENJUTSU_RATE: RateLimitConfig = { maxRequests: 6, windowMs: 60_000, keyPrefix: 'rl:genjutsu' };

/** A paid scene that is still not delivered this long after it was created is refunded and closed (status route). */
export const GENJUTSU_HARD_CAP_MS = 12 * 60_000;

export const uploadBucket = (): string => process.env.UPLOAD_BUCKET || 'uploads';

/**
 * GENJUTSU_DAILY_CAP — the most VFX starts the whole platform accepts per UTC day (default 300; 0 closes the module).
 * One bounded guard on top of the per-user rate and the Google budget envelope (guardedCall); it exists so a script
 * with many accounts cannot turn the module into an unbounded spend.
 */
export function dailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.GENJUTSU_DAILY_CAP ?? '').trim();
  if (raw === '') return 300;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(100_000, Math.floor(n)) : 300;
}

const dayKey = (now: number): string => `genjutsu:daily:${new Date(now).toISOString().slice(0, 10)}`;

/**
 * Takes one slot of today's cap. `false` = the cap is spent. Fails OPEN without Redis (like every limiter here — the
 * Google budget guard is the hard backstop). A slot taken for a start that then fails BEFORE a job exists is given
 * back with releaseDailySlot, so refused starts never eat the day's budget.
 */
export async function claimDailySlot(now: number = Date.now(), cap: number = dailyCap()): Promise<boolean> {
  if (cap <= 0) return false;
  const r = getRedisClient();
  if (!r) return true;
  const key = dayKey(now);
  try {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 36 * 3600);
    return n <= cap;
  } catch {
    return true;
  }
}

export async function releaseDailySlot(now: number = Date.now()): Promise<void> {
  const r = getRedisClient();
  if (!r) return;
  try { await r.decr(dayKey(now)); } catch { /* the day key expires on its own */ }
}

/**
 * Signs the caller's OWN uploads for a provider to fetch. A path must sit under `omni-uploads/<uid>/` (lib/studio/media's
 * rule: unguessable is not authorised) — anything else is refused and never signed, so no one can name another
 * account's object. A path that cannot be signed (deleted, storage down) is `unavailable`.
 */
export async function signOwnedPaths(
  userId: string,
  paths: readonly string[],
  ttlSec: number,
): Promise<{ ok: true; urls: string[] } | { ok: false; code: 'not_owner' | 'reference_unavailable'; index: number }> {
  for (let i = 0; i < paths.length; i++) {
    if (!ownsUploadPath(paths[i]!, userId)) return { ok: false, code: 'not_owner', index: i };
  }
  const urls: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const url = await createSignedAssetUrl(uploadBucket(), paths[i]!, ttlSec).catch(() => null);
    if (!url) return { ok: false, code: 'reference_unavailable', index: i };
    urls.push(url);
  }
  return { ok: true, urls };
}

/** One error shape for every route: `{ success:false, error, ...extra }`. `error` is a code the studio's mapper knows. */
export function fail(status: number, error: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

export const issuesOf = (issues: Issue[]) => issues.map((i) => ({ path: i.path, code: i.code }));
