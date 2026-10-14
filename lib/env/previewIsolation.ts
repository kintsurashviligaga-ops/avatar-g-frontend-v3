/**
 * Preview data isolation (global E2E 2026-10-14, S5 — P0 for enabling the Studios).
 *
 * Vercel Preview deployments read the SAME Supabase env as Production, so a paid job started on a Preview debits real
 * Production wallets and files real Production rows. Until a Preview has its own database, every credit debit made
 * from a Preview is refused (lib/orchestrator/ledger), which makes every paid route refuse BEFORE any provider call.
 *
 * A Preview counts as isolated only when BOTH hold:
 *   · PREVIEW_ISOLATED_DB is truthy — an explicit, Preview-scoped declaration by whoever pointed it at another project;
 *   · its Supabase project ref differs from PRODUCTION_SUPABASE_REF when that is set (a declaration that still points
 *     at Production is ignored).
 * Production, development and tests are never affected.
 */
import { isTruthyFlag } from './flag';

export const PREVIEW_NOT_ISOLATED = 'preview_not_isolated' as const;

/** `abcd` from https://abcd.supabase.co, else null. */
export function supabaseProjectRef(url: string | undefined | null): string | null {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co\b/i.exec((url ?? '').trim());
  return m?.[1] ? m[1].toLowerCase() : null;
}

export function previewDataIsolated(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isTruthyFlag(env.PREVIEW_ISOLATED_DB)) return false;
  const prod = (env.PRODUCTION_SUPABASE_REF ?? '').trim().toLowerCase();
  if (!prod) return true;
  const ref = supabaseProjectRef(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL);
  return ref !== null && ref !== prod;
}

/** True on a Vercel Preview that has not proven its own database: money and paid rows must not move from here. */
export function paidWritesBlockedOnPreview(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'preview' && !previewDataIsolated(env);
}
