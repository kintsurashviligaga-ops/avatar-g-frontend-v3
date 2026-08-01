-- ============================================================================
-- 20260802_credit_denomination_and_starter.sql
-- Correct the credit denomination, raise the signup grant, and settle anyone underpaid by the old rate.
--
-- ⚠️ WRITTEN AGAINST THE LIVE SCHEMA, WHICH IS NOT WHAT THE CODE ASSUMES. Introspected first:
--     credit_ledger  = id, user_id, job_id, delta, reason, metadata, created_at   -- NOTE: there is NO `ref`
--     wallet_topups  = ref, user_id, amount_gel, created_at
--     profiles       = ..., credits_balance
--   An earlier draft of this file keyed idempotency on credit_ledger.ref and would have failed on the
--   first statement. Idempotency here uses `reason` + `metadata`, which do exist.
--
-- ⚠️ THE DEFECT. Spends are priced in CREDITS (1 credit = 0.10 GEL, lib/credits/pricing.ts) and every
--   generate route debits profiles.credits_balance in credits. But the cash rails credit that same
--   column with the GEL AMOUNT — so a 100 GEL payment granted 100 credits where the price sheet promises
--   1000. One column, two denominations, depending on which door the money came through.
--   All three rails (Stripe wallet-topup, Bank of Georgia, Apple IAP) call credit_wallet_gel, so the
--   conversion is corrected in exactly one place.
--
-- ⚠️ AND THE SIGNUP GRANT WAS 1 CREDIT while the cheapest action costs 2 — so the first prompt after
--   registering was guaranteed to hit a 402. Owner's decision: 10 credits = five free images, enough to
--   see the product work before being asked for money.
--
-- SAFE TO RUN REPEATEDLY. Every statement is CREATE OR REPLACE or guarded by a marker row.
-- ============================================================================

BEGIN;

-- ─── 1. Cash top-ups must land in CREDITS ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.credit_wallet_gel(
  p_user_id uuid,
  p_amount  numeric,
  p_ref     text,
  p_reason  text DEFAULT 'purchase'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_credits integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;

  -- Idempotent on the payment's own ref: a webhook retry must not credit twice.
  -- wallet_topups.ref is the natural key here; credit_ledger has no ref column.
  IF EXISTS (SELECT 1 FROM public.wallet_topups WHERE ref = p_ref) THEN RETURN; END IF;

  -- ⚠️ THE FIX: 1 credit = 0.10 GEL, so credits = GEL x 10. This was FLOOR(p_amount), i.e. GEL poured
  -- into a column that is spent in credits — a 10x shortfall on every cash purchase.
  v_credits := FLOOR(p_amount * 10);

  INSERT INTO public.wallet_topups (ref, user_id, amount_gel)
  VALUES (p_ref, p_user_id, p_amount);

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (p_user_id, v_credits, COALESCE(p_reason, 'purchase'),
          jsonb_build_object('ref', p_ref, 'amount_gel', p_amount, 'rate', 10));

  UPDATE public.profiles
     SET credits_balance = COALESCE(credits_balance, 0) + v_credits
   WHERE id = p_user_id;
END;
$fn$;

-- ─── 2. A starter grant that can actually buy a first generation ────────────
-- 10 credits = 5 images at CREDIT_COSTS.image_generate = 2.
CREATE OR REPLACE FUNCTION public.on_auth_user_starter_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Guarded so a re-fired trigger cannot stack grants on one account.
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
     WHERE user_id = NEW.id AND reason = 'signup_bonus'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (NEW.id, 10, 'signup_bonus', jsonb_build_object('credits', 10, 'images', 5));

  UPDATE public.profiles
     SET credits_balance = COALESCE(credits_balance, 0) + 10
   WHERE id = NEW.id;

  RETURN NEW;
END;
$fn$;

-- ─── 3. Settle everyone the old rate underpaid ──────────────────────────────
-- Computed from what each user ACTUALLY PAID (wallet_topups.amount_gel), not by replaying the ledger:
-- owed = paid_gel * 10, already_granted = their purchase rows, shortfall = owed - already_granted.
-- Nobody is ever debited — GREATEST(...,0) means an account that somehow received MORE keeps it.
DO $$
DECLARE
  v_marker text := 'denomination_repair_20260802';
  v_rows   integer := 0;
  v_total  integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE reason = v_marker) THEN
    RAISE NOTICE 'denomination repair already applied — skipping';
    RETURN;
  END IF;

  CREATE TEMP TABLE _owed ON COMMIT DROP AS
  WITH paid AS (
    SELECT user_id, SUM(amount_gel) AS gel
      FROM public.wallet_topups
     GROUP BY user_id
  ),
  granted AS (
    SELECT user_id, SUM(delta) AS credits
      FROM public.credit_ledger
     WHERE reason IN ('purchase', 'topup')
       AND delta > 0
     GROUP BY user_id
  )
  SELECT p.user_id,
         GREATEST(FLOOR(p.gel * 10)::integer - COALESCE(g.credits, 0), 0) AS shortfall
    FROM paid p
    LEFT JOIN granted g ON g.user_id = p.user_id;

  -- Credit the difference and record WHY, so the ledger explains itself to whoever reads it next.
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  SELECT user_id, shortfall, v_marker,
         jsonb_build_object('note', 'retroactive correction: cash top-ups were credited at 1 credit per GEL instead of 10')
    FROM _owed
   WHERE shortfall > 0;

  UPDATE public.profiles p
     SET credits_balance = COALESCE(p.credits_balance, 0) + o.shortfall
    FROM _owed o
   WHERE p.id = o.user_id
     AND o.shortfall > 0;

  SELECT COUNT(*), COALESCE(SUM(shortfall), 0) INTO v_rows, v_total FROM _owed WHERE shortfall > 0;

  -- Always leave the marker, even when nothing was owed, so a re-run is a genuine no-op.
  IF v_rows = 0 THEN
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
    SELECT id, 0, v_marker, jsonb_build_object('note', 'no shortfall found')
      FROM public.profiles ORDER BY created_at NULLS LAST LIMIT 1;
  END IF;

  RAISE NOTICE 'denomination repair: % account(s) credited, % credits total', v_rows, v_total;
END $$;

COMMIT;

-- ============================================================================
-- VERIFY AFTER RUNNING:
--   SELECT reason, COUNT(*), SUM(delta) FROM credit_ledger GROUP BY reason ORDER BY 2 DESC;
--   SELECT id, email, credits_balance FROM profiles ORDER BY credits_balance DESC LIMIT 5;
-- A new signup should now receive 10; a 9 GEL top-up should add 90.
-- ============================================================================
