-- ============================================================================
-- 04_verify.sql  —  READ-ONLY.  Run after a COMMITTED 03.
-- ============================================================================
-- Confirms the reconciliation landed and nothing is corrupt. All SELECTs.
-- Set RUN_TAG to the same value 03 used.
-- ============================================================================
\set RUN_TAG '2026xxxx_ledger_unify'

-- 1) Reconciliation rows written this run (count + total granted) --------------
SELECT
  COUNT(*)                    AS recon_rows,
  COALESCE(SUM(delta), 0)     AS total_credits_granted,
  ROUND(COALESCE(SUM(delta), 0) * 0.10, 2) AS total_gel_granted
FROM public.credit_ledger
WHERE metadata->>'ref' LIKE 'recon:' || :'RUN_TAG' || ':%';

-- 2) Post-recon divergence under policy A: every user's canonical balance should
--    now be >= their legacy balance (we only ever topped UP). Expect 0 rows.
SELECT COUNT(*) AS users_still_short
FROM public.profiles p
JOIN public.credits c ON c.user_id = p.id
WHERE p.credits_balance < c.balance;

-- 3) No negative balances anywhere (must be 0). --------------------------------
SELECT 'legacy'    AS ledger, COUNT(*) AS negative_rows FROM public.credits  WHERE balance < 0
UNION ALL
SELECT 'canonical' AS ledger, COUNT(*) AS negative_rows FROM public.profiles WHERE credits_balance < 0;

-- 4) Ledger integrity spot-check: for 20 users, does the sum of canonical
--    credit_ledger deltas equal their profiles.credits_balance? (Confirms the
--    trigger applied every delta and nothing wrote the balance out-of-band.)
--    NOTE: valid only if credit_ledger is the SOLE writer of credits_balance;
--    if any legacy/manual path also set it, expect drift — investigate, don't panic.
SELECT p.id AS user_id, p.credits_balance,
       COALESCE(SUM(l.delta), 0) AS ledger_sum,
       p.credits_balance - COALESCE(SUM(l.delta), 0) AS drift
FROM public.profiles p
LEFT JOIN public.credit_ledger l ON l.user_id = p.id
GROUP BY p.id, p.credits_balance
HAVING p.credits_balance <> COALESCE(SUM(l.delta), 0)
ORDER BY ABS(p.credits_balance - COALESCE(SUM(l.delta), 0)) DESC
LIMIT 20;

-- 5) Idempotency proof: no ref written more than once this run (expect 0 rows).
SELECT metadata->>'ref' AS ref, COUNT(*) AS times
FROM public.credit_ledger
WHERE metadata->>'ref' LIKE 'recon:' || :'RUN_TAG' || ':%'
GROUP BY 1 HAVING COUNT(*) > 1;

-- ── ROLLBACK a mistaken run: for each ref written, insert the compensating
-- negative delta (mirrors 03; guarded by ref+':undo'). Left commented. ────────
-- INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
-- SELECT user_id, -delta, 'admin_adjustment',
--        jsonb_build_object('source','ledger-unification-undo','ref', (metadata->>'ref') || ':undo')
-- FROM public.credit_ledger src
-- WHERE metadata->>'ref' LIKE 'recon:' || :'RUN_TAG' || ':%'
--   AND NOT EXISTS (SELECT 1 FROM public.credit_ledger u
--                   WHERE u.metadata->>'ref' = (src.metadata->>'ref') || ':undo');
