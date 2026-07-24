-- 08_double_grant_and_affiliate_indexes.sql
-- ================================================================================================
-- P0 PURE-UPSIDE DDL — lock down the two confirmed double-insert races (audit: pillar-3 / payments).
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → New query, as the project owner. This is DDL against
-- the PRODUCTION money layer, so it is deliberately staged: run each READ-ONLY PROBE first and only
-- create the index when its probe returns ZERO rows. Both index creations are IDEMPOTENT
-- (IF NOT EXISTS) and safe to re-run. NO application deploy is required — additive DB constraints only.
--
-- WHY: refund_credits (tier grants) and insertCommissionEvent (affiliate) both dedupe with a
-- NON-locking `IF EXISTS(...) RETURN` check backed by a NON-unique index. Stripe fans one
-- checkout.session.completed to BOTH registered webhook endpoints in parallel; under READ COMMITTED
-- both EXISTS checks see no committed row and both INSERT → double credit / double commission for one
-- charge. A partial UNIQUE index makes the 2nd concurrent INSERT fail → the app catches it and the
-- webhook throws → Stripe retries → the retry's EXISTS check finds the committed row → recorded
-- exactly once, even across both endpoints + retries. (The GEL wallet path is already safe:
-- wallet_topups.ref is a TEXT PRIMARY KEY with ON CONFLICT DO NOTHING.)


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 1  ·  READ-ONLY PROBE — must return ZERO rows before STEP 2.
-- If it returns rows, a prior double-grant already left duplicates: keep the EARLIEST row per
-- (user_id, ref), delete the later duplicate positive rows, post a compensating admin_adjustment for
-- the over-credit, THEN re-run this probe. (A fresh DB with no prior double-grant returns 0.)
-- ──────────────────────────────────────────────────────────────────────────────────────────────
SELECT user_id,
       metadata->>'ref'      AS ref,
       COUNT(*)              AS dup_rows,
       SUM(delta)            AS total_delta_over_credited
FROM   public.credit_ledger
WHERE  delta > 0 AND metadata->>'ref' IS NOT NULL
GROUP  BY user_id, metadata->>'ref'
HAVING COUNT(*) > 1
ORDER  BY dup_rows DESC;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 2  ·  Create the credit_ledger partial-unique index (ONLY after STEP 1 returns 0 rows).
-- Verbatim from migrations/008_credit_grant_idempotency.sql. Idempotent.
-- For a very large / write-hot table, swap the line for its CONCURRENTLY form (which must run
-- OUTSIDE any transaction block, and leaves an INVALID index to DROP + retry if it fails):
--     CREATE UNIQUE INDEX CONCURRENTLY credit_ledger_user_ref_positive_uniq
--       ON public.credit_ledger (user_id, (metadata->>'ref'))
--       WHERE delta > 0 AND metadata->>'ref' IS NOT NULL;
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_user_ref_positive_uniq
  ON public.credit_ledger (user_id, (metadata->>'ref'))
  WHERE delta > 0 AND metadata->>'ref' IS NOT NULL;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 3  ·  READ-ONLY PROBE — must return ZERO rows before STEP 4.
-- ASSUMPTION: one commission row per stripe event (insertCommissionEvent inserts a single row keyed
-- on stripe_event_id). If your model legitimately allows MULTIPLE commission rows per event, DO NOT
-- run STEP 4 as written — the unique key must include the second discriminator instead.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
SELECT stripe_event_id,
       COUNT(*) AS dup_rows
FROM   public.affiliate_commission_events
WHERE  stripe_event_id IS NOT NULL
GROUP  BY stripe_event_id
HAVING COUNT(*) > 1
ORDER  BY dup_rows DESC;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 4  ·  Create the affiliate-commission unique index (ONLY after STEP 3 returns 0 rows).
-- Idempotent. Uses a partial UNIQUE index (not a named constraint) so it re-runs cleanly.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commission_events_stripe_event_uniq
  ON public.affiliate_commission_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 5  ·  VERIFY — both indexes should now be listed.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
SELECT indexname, tablename
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  indexname IN ('credit_ledger_user_ref_positive_uniq',
                     'affiliate_commission_events_stripe_event_uniq')
ORDER  BY tablename;
