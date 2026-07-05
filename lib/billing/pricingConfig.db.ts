/**
 * pricingConfig.db — runtime-editable refill tiers + commission rules for the Master Control Panel (v358 #2).
 *
 * FAIL-OPEN by construction: getActiveTiers() falls back to the hardcoded REFILL_TIERS_GEL whenever the
 * pricing_tiers table is absent, errors, or has NO active rows — so checkout is byte-identical pre-migration
 * and an admin can never lock out every tier. The reads are TIMEOUT-BOUNDED (never hang a checkout) and
 * cached ~30s (successful reads only; a transient error keeps serving the last good rows under a short TTL).
 *
 * SAFETY: editing a tier only changes WHICH GEL amounts are purchasable (the checkout VALIDATION). It does
 * NOT change how a paid top-up is credited — the webhook still credits the server-recorded order amount, so
 * in-flight orders are immune. Commission is METRIC-ONLY: stored + displayed, never deducted (product decision).
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { REFILL_TIERS_GEL } from '@/lib/billing/gel';

export interface PricingTier { gelAmount: number; creditsAmount: number; label: string | null; isActive: boolean }
export interface CommissionRule { gateway: 'stripe' | 'bog'; commissionPercent: number; note: string | null }

/** 1 credit = 0.10 GEL (single-source: credits derive from GEL) → default credits for a bare GEL tier. */
export const CREDITS_PER_GEL = 10;
const DEFAULT_TIERS: PricingTier[] = REFILL_TIERS_GEL.map((g) => ({ gelAmount: g, creditsAmount: Math.round(g * CREDITS_PER_GEL), label: null, isActive: true }));

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('pricing_timeout')), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const TTL_MS = 30_000, ERR_TTL_MS = 5_000, QUERY_TIMEOUT_MS = 2_500;
let tierCache: { at: number; rows: PricingTier[]; ok: boolean } | null = null;

/** All configured tier rows (active + inactive), cached; fail-open to [] on absent-table/error/timeout. */
async function loadTiersRaw(): Promise<PricingTier[]> {
  const now = Date.now();
  if (tierCache && now - tierCache.at < (tierCache.ok ? TTL_MS : ERR_TTL_MS)) return tierCache.rows;
  try {
    const svc = createServiceRoleClient();
    const res = (await withTimeout(svc.from('pricing_tiers').select('gel_amount, credits_amount, label, is_active').order('gel_amount', { ascending: true }), QUERY_TIMEOUT_MS)) as {
      data: { gel_amount: number | string; credits_amount: number; label: string | null; is_active: boolean }[] | null;
      error: unknown;
    };
    if (res.error) throw res.error;
    const rows: PricingTier[] = (res.data ?? []).map((r) => ({ gelAmount: Number(r.gel_amount), creditsAmount: Number(r.credits_amount), label: r.label ?? null, isActive: !!r.is_active }))
      .filter((r) => Number.isFinite(r.gelAmount) && r.gelAmount > 0);
    tierCache = { at: now, rows, ok: true };
    return rows;
  } catch {
    const rows = tierCache?.ok ? tierCache.rows : [];
    tierCache = { at: now, rows, ok: false };
    return rows;
  }
}

/** The EFFECTIVE purchasable tiers: active DB rows if any, else the hardcoded defaults (never empty). */
export async function getActiveTiers(): Promise<PricingTier[]> {
  const active = (await loadTiersRaw()).filter((t) => t.isActive);
  return active.length ? active : DEFAULT_TIERS;
}

/** For the admin panel: the raw configured rows + whether the hardcoded defaults are currently in effect. */
export async function getTierConfig(): Promise<{ configured: PricingTier[]; effective: PricingTier[]; usingDefaults: boolean; defaults: PricingTier[] }> {
  const configured = await loadTiersRaw();
  const active = configured.filter((t) => t.isActive);
  return { configured, effective: active.length ? active : DEFAULT_TIERS, usingDefaults: active.length === 0, defaults: DEFAULT_TIERS };
}

/** Is `gel` a currently-purchasable tier amount? Fail-open to the hardcoded set. Used by the checkout routes. */
export async function isPurchasableTierGel(gel: number): Promise<boolean> {
  if (!Number.isFinite(gel) || gel <= 0) return false;
  return (await getActiveTiers()).some((t) => t.gelAmount === gel);
}

export function invalidatePricingCache(): void { tierCache = null; }

/** Upsert a tier (by gel_amount). gel 0<..<=10000, credits >=0. Service-role; invalidates the cache. */
export async function upsertTier(input: { gelAmount: number; creditsAmount?: number; label?: string | null; isActive?: boolean }, actorId: string | null): Promise<{ ok: boolean; error?: string }> {
  const gel = Math.round(Number(input.gelAmount) * 100) / 100;
  if (!Number.isFinite(gel) || gel <= 0 || gel > 10000) return { ok: false, error: 'invalid_amount' };
  const credits = input.creditsAmount === undefined ? Math.round(gel * CREDITS_PER_GEL) : Math.floor(Number(input.creditsAmount));
  if (!Number.isFinite(credits) || credits < 0) return { ok: false, error: 'invalid_credits' };
  try {
    const svc = createServiceRoleClient();
    const { error } = await svc.from('pricing_tiers').upsert(
      { gel_amount: gel, credits_amount: credits, label: input.label ?? null, is_active: input.isActive ?? true, updated_by: actorId, updated_at: new Date().toISOString() },
      { onConflict: 'gel_amount' },
    );
    if (error) return { ok: false, error: error.message };
    invalidatePricingCache();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'write_failed' };
  }
}

/** Read the commission rules (metric-only). Fail-open to []. */
export async function getCommissionRules(): Promise<CommissionRule[]> {
  try {
    const svc = createServiceRoleClient();
    const res = (await withTimeout(svc.from('commission_rules').select('gateway, commission_percent, note'), QUERY_TIMEOUT_MS)) as {
      data: { gateway: string; commission_percent: number | string; note: string | null }[] | null; error: unknown;
    };
    if (res.error) throw res.error;
    return (res.data ?? [])
      .filter((r) => r.gateway === 'stripe' || r.gateway === 'bog')
      .map((r) => ({ gateway: r.gateway as 'stripe' | 'bog', commissionPercent: Number(r.commission_percent) || 0, note: r.note ?? null }));
  } catch {
    return [];
  }
}

/** Upsert a commission rule (metric-only; never deducted). Service-role. */
export async function upsertCommission(input: { gateway: 'stripe' | 'bog'; commissionPercent: number; note?: string | null }, actorId: string | null): Promise<{ ok: boolean; error?: string }> {
  if (input.gateway !== 'stripe' && input.gateway !== 'bog') return { ok: false, error: 'invalid_gateway' };
  const pct = Number(input.commissionPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, error: 'invalid_percent' };
  try {
    const svc = createServiceRoleClient();
    const { error } = await svc.from('commission_rules').upsert(
      { gateway: input.gateway, commission_percent: pct, note: input.note ?? null, updated_by: actorId, updated_at: new Date().toISOString() },
      { onConflict: 'gateway' },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'write_failed' };
  }
}
