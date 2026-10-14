/**
 * Preview data isolation (global E2E 2026-10-14, S5 — P0 for enabling the Studios).
 *
 * Vercel Preview deployments read the SAME Supabase env as Production, so a paid job started on a Preview debits real
 * Production wallets and files real Production rows. Until a Preview has PROVEN its own database, every credit debit,
 * grant, refund and free-slot write made from a Preview is refused (lib/orchestrator/ledger, lib/billing/*,
 * lib/commerce), which makes every paid route refuse BEFORE any provider call.
 *
 * ⚠️ A FLAG IS NOT PROOF (final repair run). The first version accepted `PREVIEW_ISOLATED_DB=1` on its own whenever
 * PRODUCTION_SUPABASE_REF was unset, so one forged or copy-pasted env row re-opened Production money from a Preview.
 * A Preview now counts as isolated only when EVERY one of these holds:
 *   1. PREVIEW_ISOLATED_DB is truthy — the explicit, Preview-scoped declaration;
 *   2. PREVIEW_SUPABASE_REF is a well-formed project ref (20 lowercase alphanumerics) — what the Preview claims to use;
 *   3. PRODUCTION_SUPABASE_REF is a well-formed project ref — what it must NOT use;
 *   4. the two differ, and the Preview ref is not a known Production ref (KNOWN_PRODUCTION_REFS, compiled in, so a
 *      forged PRODUCTION_SUPABASE_REF naming some other project cannot launder the real one);
 *   5. every Supabase URL the server can connect with (SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL — at least one present)
 *      parses to a ref and that ref IS the declared Preview ref — a custom domain, a typo or two URLs that disagree are
 *      ambiguous and fail closed;
 *   6. no database connection string (DATABASE_URL, POSTGRES_URL*, SUPABASE_DB_URL, DIRECT_URL) names a Production ref.
 *
 * Applies to VERCEL_ENV=preview and to any VERCEL_ENV value other than production/development (an unknown target is
 * treated as a Preview, not waved through). Production, `vercel dev`, CI and tests (VERCEL_ENV unset) are unaffected.
 */
import { isTruthyFlag } from './flag';

export const PREVIEW_NOT_ISOLATED = 'preview_not_isolated' as const;

/** Production project refs this codebase knows. A Preview may never claim one, whatever PRODUCTION_SUPABASE_REF says. */
export const KNOWN_PRODUCTION_REFS: readonly string[] = ['zwksnayknzggdcenqqxy'];

const REF_SHAPE = /^[a-z0-9]{20}$/;
const DB_URL_KEYS = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'SUPABASE_DB_URL', 'DIRECT_URL'] as const;

/** A well-formed Supabase project ref, lower-cased, else null. */
export function validProjectRef(value: string | undefined | null): string | null {
  const v = (value ?? '').trim().toLowerCase();
  return REF_SHAPE.test(v) ? v : null;
}

/** `abcd` from https://abcd.supabase.co, else null. */
export function supabaseProjectRef(url: string | undefined | null): string | null {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co(?:[/:?#]|$)/i.exec((url ?? '').trim());
  return m?.[1] ? m[1].toLowerCase() : null;
}

export type IsolationVerdict =
  | { isolated: true; previewRef: string }
  | { isolated: false; reason:
    | 'no_declaration' | 'preview_ref_missing_or_malformed' | 'production_ref_missing_or_malformed'
    | 'refs_equal' | 'preview_ref_is_known_production' | 'no_supabase_url' | 'supabase_url_unparseable'
    | 'supabase_url_mismatch' | 'db_url_names_production' };

/** The full verdict with its reason, for logs and the evidence report. Pure: reads only `env`. */
export function previewIsolationVerdict(env: NodeJS.ProcessEnv = process.env): IsolationVerdict {
  if (!isTruthyFlag(env.PREVIEW_ISOLATED_DB)) return { isolated: false, reason: 'no_declaration' };
  const previewRef = validProjectRef(env.PREVIEW_SUPABASE_REF);
  if (!previewRef) return { isolated: false, reason: 'preview_ref_missing_or_malformed' };
  const prodRef = validProjectRef(env.PRODUCTION_SUPABASE_REF);
  if (!prodRef) return { isolated: false, reason: 'production_ref_missing_or_malformed' };
  if (previewRef === prodRef) return { isolated: false, reason: 'refs_equal' };
  const production = new Set([prodRef, ...KNOWN_PRODUCTION_REFS]);
  if (production.has(previewRef)) return { isolated: false, reason: 'preview_ref_is_known_production' };

  const urls = [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL].map((u) => (u ?? '').trim()).filter(Boolean);
  if (urls.length === 0) return { isolated: false, reason: 'no_supabase_url' };
  for (const u of urls) {
    const ref = supabaseProjectRef(u);
    if (!ref) return { isolated: false, reason: 'supabase_url_unparseable' };
    if (ref !== previewRef) return { isolated: false, reason: 'supabase_url_mismatch' };
  }
  for (const k of DB_URL_KEYS) {
    const v = (env[k] ?? '').toLowerCase();
    if (v && [...production].some((r) => v.includes(r))) return { isolated: false, reason: 'db_url_names_production' };
  }
  return { isolated: true, previewRef };
}

export function previewDataIsolated(env: NodeJS.ProcessEnv = process.env): boolean {
  return previewIsolationVerdict(env).isolated;
}

/** Is this a deployment that must prove isolation? Preview, or any Vercel target that is not production/development. */
export function isPreviewLikeTarget(env: NodeJS.ProcessEnv = process.env): boolean {
  const target = (env.VERCEL_ENV ?? '').trim().toLowerCase();
  if (!target) return false;
  return target !== 'production' && target !== 'development';
}

/** True on a Vercel Preview that has not proven its own database: money and paid rows must not move from here. */
export function paidWritesBlockedOnPreview(env: NodeJS.ProcessEnv = process.env): boolean {
  return isPreviewLikeTarget(env) && !previewDataIsolated(env);
}
