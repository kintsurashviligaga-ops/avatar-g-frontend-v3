-- ============================================================================
-- 02_report_divergence.sql  —  READ-ONLY.  Run after 01, before 03.
-- ============================================================================
-- Purpose: quantify the gap between the LEGACY balance (public.credits.balance)
-- and the CANONICAL balance (public.profiles.credits_balance) so you can pick a
-- reconciliation policy (README §3) from real numbers. Pure SELECTs — no writes.
--
-- Assumes 01 confirmed both columns exist. 1 credit = 0.10 GEL (lib/credits/pricing.ts),
-- so "credits at stake" × 0.10 = GEL at stake.
-- ============================================================================

-- A) Headline aggregates — the one screen that decides the policy --------------
WITH j AS (
  SELECT
    COALESCE(c.user_id, p.id)                         AS user_id,
    COALESCE(c.balance, 0)                             AS legacy_balance,
    COALESCE(p.credits_balance, 0)                     AS canonical_balance,
    COALESCE(c.balance, 0) - COALESCE(p.credits_balance, 0) AS legacy_minus_canonical
  FROM public.credits c
  FULL OUTER JOIN public.profiles p ON p.id = c.user_id
)
SELECT
  COUNT(*)                                                     AS users_total,
  COUNT(*) FILTER (WHERE legacy_minus_canonical <> 0)          AS users_diverging,
  COUNT(*) FILTER (WHERE legacy_minus_canonical > 0)           AS users_legacy_higher,
  COUNT(*) FILTER (WHERE legacy_minus_canonical < 0)           AS users_canonical_higher,
  COALESCE(SUM(GREATEST(legacy_minus_canonical, 0)), 0)        AS credits_to_topup_if_policy_A,  -- policy A cost (credits)
  ROUND(COALESCE(SUM(GREATEST(legacy_minus_canonical, 0)), 0) * 0.10, 2) AS gel_to_topup_if_policy_A,
  COALESCE(SUM(legacy_balance), 0)                             AS sum_legacy_balance,
  COALESCE(SUM(canonical_balance), 0)                          AS sum_canonical_balance,
  MAX(ABS(legacy_minus_canonical))                             AS max_abs_divergence  -- size the MAX_TOPUP guard
FROM j;

-- B) Users present in ONE ledger only (edge cases the reconcile must handle) ---
SELECT
  COUNT(*) FILTER (WHERE p.id IS NULL)  AS in_legacy_but_no_profile,   -- no canonical wallet
  COUNT(*) FILTER (WHERE c.user_id IS NULL) AS in_profile_but_no_legacy_row
FROM public.credits c
FULL OUTER JOIN public.profiles p ON p.id = c.user_id;

-- C) Negative balances anywhere (corruption / bug signal — must be 0) ----------
SELECT 'legacy'    AS ledger, COUNT(*) AS negative_rows FROM public.credits  WHERE balance < 0
UNION ALL
SELECT 'canonical' AS ledger, COUNT(*) AS negative_rows FROM public.profiles WHERE credits_balance < 0;

-- D) Top 50 divergences — eyeball the outliers before trusting the aggregate ---
--    A handful of huge legacy balances (e.g. free-tier that never spent) can
--    dominate SUM; confirm they're legitimate before policy A tops them up.
SELECT
  COALESCE(c.user_id, p.id) AS user_id,
  COALESCE(c.balance, 0)          AS legacy_balance,
  COALESCE(p.credits_balance, 0)  AS canonical_balance,
  COALESCE(c.balance, 0) - COALESCE(p.credits_balance, 0) AS legacy_minus_canonical,
  c.monthly_allowance, c.reset_at
FROM public.credits c
FULL OUTER JOIN public.profiles p ON p.id = c.user_id
WHERE COALESCE(c.balance, 0) - COALESCE(p.credits_balance, 0) <> 0
ORDER BY ABS(COALESCE(c.balance, 0) - COALESCE(p.credits_balance, 0)) DESC
LIMIT 50;

-- E) How much of the legacy balance is UNSPENT free-tier allowance vs purchased?
--    Policy B/A hinges on this: free-tier remainder is cheap to abandon or grant;
--    purchased credits are real money and must be preserved. Heuristic: a legacy
--    balance == monthly_allowance and never-decremented looks like untouched free tier.
SELECT
  COUNT(*) FILTER (WHERE balance = monthly_allowance)                    AS looks_untouched_free_tier,
  COUNT(*) FILTER (WHERE balance < monthly_allowance)                    AS spent_into_allowance,
  COUNT(*) FILTER (WHERE balance > monthly_allowance)                    AS above_allowance_has_purchased,
  COALESCE(SUM(GREATEST(balance - monthly_allowance, 0)), 0)             AS credits_above_allowance  -- ~ purchased floor
FROM public.credits;

-- ============================================================================
-- READ THE RESULTS, THEN CHOOSE A POLICY (README §3). Record: chosen policy,
-- the MAX_TOPUP_PER_USER cap (>= max legitimate divergence from D), and whether
-- any "in_legacy_but_no_profile" users need a profile row created first.
-- ============================================================================
