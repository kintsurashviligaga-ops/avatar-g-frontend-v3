-- Migration: 008_credit_grant_idempotency.sql
-- ============================================================================================
-- RACE-SAFE positive-delta credit grants (fixes the USD-tier double-grant).
--
-- THE BUG: a paid tier purchase grants credits via refund_credits(user, amount, ref), whose idempotency is a
-- NON-locking `IF EXISTS(... metadata->>'ref' = p_ref AND delta > 0) THEN RETURN` check with only a NON-unique
-- index. Stripe fans a single checkout.session.completed to BOTH registered webhook endpoints in parallel; under
-- READ COMMITTED both EXISTS checks see no committed row, both INSERT a positive delta, and the balance trigger
-- applies BOTH → double credits for one charge (e.g. 9000 for a $299 Studio purchase). (The GEL wallet path is
-- already safe: wallet_topups.ref is a TEXT PRIMARY KEY with ON CONFLICT DO NOTHING.)
--
-- THE FIX: a partial UNIQUE index on (user_id, metadata->>'ref') for positive-delta rows. The second concurrent
-- INSERT now fails with a unique violation; refund_credits raises, the app-layer grant catches it and returns
-- null, the webhook throws → Stripe retries → the retry finds the committed row via the EXISTS check and returns
-- the balance (no re-insert). Net: credited exactly once, even across both endpoints + Stripe retries.
--
-- Idempotent + safe to re-run. Deduct rows (delta < 0) and ref-less rows are unaffected.
-- NOTE: if a PRIOR double-grant already left duplicate positive rows, CREATE UNIQUE INDEX will error — de-dupe
-- first (keep the earliest per (user_id, ref)) before running. New installs have none.

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_user_ref_positive_uniq
  ON public.credit_ledger (user_id, (metadata->>'ref'))
  WHERE delta > 0 AND metadata->>'ref' IS NOT NULL;
