-- ============================================================================
-- 20260802d_fix_starter_trigger_name.sql
--
-- ⚠️ NEW USERS ARE GETTING ZERO CREDITS, AND THREE MIGRATIONS "FIXED" A FUNCTION NOTHING CALLS.
--
-- Measured on the live database after 20260802c: created a fresh auth user, waited, then read back —
--   credit_ledger rows      : 0
--   profiles.credits_balance: 0
--   free_films_remaining    : 1   (so 20260802c's ALTER … DEFAULT did land)
-- A new account therefore starts with nothing, and the cheapest action costs 2 credits, so the first
-- thing anyone does after registering is hit a 402.
--
-- THE CAUSE IS A NAME COLLISION BETWEEN THE TRIGGER AND ITS FUNCTION:
--     TRIGGER  on_auth_user_starter_balance      ON auth.users
--     EXECUTES public.handle_auth_user_starter_balance()      <-- note the handle_ prefix
--   (both defined in 20260528b_debit_wallet_gel_and_starter_balance.sql:126-130)
--
--   But 20260802, 20260802b and 20260802c each ran
--     CREATE OR REPLACE FUNCTION public.on_auth_user_starter_balance()
--   i.e. they used the TRIGGER's name as the FUNCTION name. Postgres happily created a second,
--   perfectly valid, completely unreferenced function — no error, no warning — while the function the
--   trigger actually calls was never touched. Every "the signup grant is now N credits" change since
--   has been landing in a dead object. That is why the number in the database never matched the number
--   in the migration, three times running.
--
-- ⚠️ CREATE OR REPLACE IS NOT A SPELL-CHECKER. It cannot tell you that nothing calls what you just
--   wrote. When a migration replaces a trigger function, it must also assert the TRIGGER — which is
--   what this file does, and what the previous three should have done.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

BEGIN;

-- ─── 1. The function the trigger ACTUALLY calls ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_auth_user_starter_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- The profiles row must exist before the credit_ledger trigger tries to move its balance.
  INSERT INTO public.profiles (id, credits_balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (id) DO NOTHING;

  -- Idempotent on the marker, so a re-fired trigger cannot stack grants on one account.
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
     WHERE user_id = NEW.id AND metadata->>'kind' = 'signup_bonus'
  ) THEN
    -- ⚠️ LEDGER INSERT ONLY. The AFTER INSERT trigger on credit_ledger maintains
    -- profiles.credits_balance. An explicit UPDATE here pays the user TWICE — that bug already shipped
    -- once (20260802b_fix_double_credit.sql).
    -- ⚠️ `reason` IS CONSTRAINED. Probed against the live table: 'purchase', 'commit', 'refund' and
    -- 'admin_adjustment' are accepted; 'signup_starter' is REJECTED (23514). Specifics go in metadata.
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
    VALUES (NEW.id, 50, 'purchase',
            jsonb_build_object('kind', 'signup_bonus', 'credits', 50,
                               'ref', 'starter:' || NEW.id::text,
                               'note', 'free trial: 50 credits, max 1 video (free_films_remaining)'));
  END IF;

  RETURN NEW;
END;
$fn$;

-- ─── 2. Assert the trigger, so the function above is provably wired ─────────
DROP TRIGGER IF EXISTS on_auth_user_starter_balance ON auth.users;
CREATE TRIGGER on_auth_user_starter_balance
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_starter_balance();

-- ─── 3. Retire the decoy so nobody edits it again ───────────────────────────
-- Three migrations edited this believing it was live. Dropping it means the next person who tries gets
-- an error instead of silent success.
DROP FUNCTION IF EXISTS public.on_auth_user_starter_balance();

-- ─── 4. Backfill the accounts that got nothing ──────────────────────────────
-- Anyone with no signup_bonus row was created while the grant was landing in the dead function.
-- Ledger insert only; the credit_ledger trigger moves each balance.
INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
SELECT p.id, 50, 'purchase',
       jsonb_build_object('kind', 'signup_bonus', 'credits', 50,
                          'ref', 'starter:' || p.id::text,
                          'note', 'backfill 20260802d — grant was landing in an unreferenced function')
  FROM public.profiles p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.credit_ledger l
    WHERE l.user_id = p.id AND l.metadata->>'kind' = 'signup_bonus'
 );

COMMIT;

-- ============================================================================
-- VERIFY
DO $$
DECLARE v_fn text; v_trg text; v_missing int;
BEGIN
  SELECT p.proname INTO v_fn
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgname = 'on_auth_user_starter_balance' AND NOT t.tgisinternal;
  IF v_fn IS DISTINCT FROM 'handle_auth_user_starter_balance' THEN
    RAISE EXCEPTION 'VERIFY FAILED — trigger executes %, expected handle_auth_user_starter_balance', COALESCE(v_fn, '(no trigger)');
  END IF;

  SELECT prosrc INTO v_trg FROM pg_proc WHERE proname = 'handle_auth_user_starter_balance';
  IF v_trg NOT LIKE '%50%' THEN
    RAISE EXCEPTION 'VERIFY FAILED — the WIRED function does not grant 50';
  END IF;
  IF v_trg LIKE '%UPDATE public.profiles%SET credits_balance%' THEN
    RAISE EXCEPTION 'VERIFY FAILED — explicit balance UPDATE present; the ledger trigger already does that and this would pay twice';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'on_auth_user_starter_balance') THEN
    RAISE EXCEPTION 'VERIFY FAILED — the unreferenced decoy function still exists';
  END IF;

  SELECT count(*) INTO v_missing FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.credit_ledger l
                      WHERE l.user_id = p.id AND l.metadata->>'kind' = 'signup_bonus');
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED — % profile(s) still have no signup grant', v_missing;
  END IF;

  RAISE NOTICE 'VERIFY OK — trigger -> handle_auth_user_starter_balance, grants 50, decoy dropped, every profile backfilled.';
END $$;
-- ============================================================================
