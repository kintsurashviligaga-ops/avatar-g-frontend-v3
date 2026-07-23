-- ============================================================================
-- 01_introspect.sql  —  READ-ONLY.  Run this FIRST, before anything else.
-- ============================================================================
-- Purpose: resolve the credit_ledger split-brain (see README §1) by reading the
-- ACTUAL live schema. The repo's two migrations disagree about public.credit_ledger;
-- only the live DB knows which shape is real. This SELECTs nothing but catalog
-- metadata — it mutates nothing and is safe to run any time, on prod.
--
-- Copy every result block into a scratch doc; steps 02/03/04 reference it.
-- ============================================================================

-- 1) Columns of the three balance/audit tables --------------------------------
--    Look for: does credit_ledger have `amount,balance_after,idempotency_key`
--    (LEGACY) or `delta,reason,metadata` (CANONICAL) — or BOTH (a hand-merged
--    table)? Does profiles have credits_balance? Does credits have balance?
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('credits', 'credit_ledger', 'profiles', 'subscriptions')
ORDER BY table_name, ordinal_position;

-- 2) Constraints on credit_ledger (NOT NULLs decide whether each RPC's INSERT
--    can even succeed — a NOT NULL `amount`/`balance_after` breaks the canonical
--    insert; a NOT NULL `delta` breaks the legacy insert).
SELECT tc.constraint_type, kcu.column_name, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public' AND tc.table_name = 'credit_ledger'
ORDER BY tc.constraint_type, kcu.column_name;

-- 3) Which credits RPCs actually exist, and with which signatures? -----------
--    Confirms whether BOTH families are live (deduct_credits vs
--    deduct_credits_transaction; refund_credits; ensure_user_billing_rows; etc.)
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'deduct_credits', 'refund_credits',
    'deduct_credits_transaction', 'ensure_user_billing_rows',
    'reset_user_credits_if_due', 'refill_due_credits', 'plan_monthly_allowance'
  )
ORDER BY p.proname, args;

-- 4) Does the canonical balance trigger exist on credit_ledger? ---------------
--    If trigger_update_credits_balance is present, credit_ledger inserts drive
--    profiles.credits_balance (canonical is live). If absent, the canonical
--    RPCs never move a balance.
SELECT t.tgname AS trigger_name,
       c.relname AS table_name,
       p.proname AS function_called,
       t.tgenabled AS enabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND c.relname IN ('credit_ledger', 'credits', 'profiles')
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- 5) Row counts + freshness — is each ledger actually being written? ----------
--    (Cheap sanity: which table is the live one users transact against.)
SELECT 'public.credits'        AS tbl, COUNT(*) AS rows, MAX(updated_at) AS last_write FROM public.credits
UNION ALL
SELECT 'public.credit_ledger'  AS tbl, COUNT(*) AS rows, MAX(created_at) AS last_write FROM public.credit_ledger
UNION ALL
SELECT 'public.profiles'       AS tbl, COUNT(*) AS rows, MAX(updated_at) AS last_write FROM public.profiles;

-- 6) If credit_ledger has a `reason` or `metadata` column, what values exist?
--    Tells you which code paths have actually written to it. Comment out
--    whichever column does NOT exist per result (1).
-- SELECT reason, COUNT(*) FROM public.credit_ledger GROUP BY reason ORDER BY 2 DESC;
-- SELECT metadata->>'source' AS source, COUNT(*) FROM public.credit_ledger GROUP BY 1 ORDER BY 2 DESC;

-- ============================================================================
-- DECISION GATE — do not proceed to 02/03 until you can answer:
--   (a) credit_ledger shape: LEGACY / CANONICAL / BOTH?
--   (b) is profiles.credits_balance present and non-null for real users?
--   (c) which write RPCs exist? is trigger_update_credits_balance live?
-- Record the answers; 02+03 assume CANONICAL is live (profiles.credits_balance
-- fed by credit_ledger delta + trigger). If 01 shows otherwise, STOP and adjust.
-- ============================================================================
