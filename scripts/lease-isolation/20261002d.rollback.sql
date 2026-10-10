-- Rollback of supabase/migrations/20261002d_ledger_ref_race_hardening.sql.
-- Drops the debit backstop index and deduct_credits_once, and restores deduct_credits / refund_credits to the bodies
-- Production ran before 20261002d (read 2026-10-10; their md5s are pinned in scripts/lease-isolation/ledger-race.sh,
-- whose section 6 checks them). Restoring them brings the same-ref race back; run this only to undo a bad apply.
-- Idempotent. Any route on deductCreditsOnce falls back to a ledger read + deduct_credits once the function is gone.

DROP INDEX IF EXISTS public.credit_ledger_user_ref_negative_uniq;
DROP FUNCTION IF EXISTS public.deduct_credits_once(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer, p_ref text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Idempotency (ref lives in metadata; reason is a constrained enum).
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND metadata->>'ref' = p_ref AND delta < 0
  ) THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Lock the balance row to serialize concurrent deducts.
  SELECT credits_balance INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001', DETAIL = 'no profile record';
  END IF;

  IF COALESCE(v_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001',
      DETAIL = format('have %s need %s', COALESCE(v_balance, 0), p_amount);
  END IF;

  -- Append the ledger row; trigger_update_credits_balance applies the delta.
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (p_user_id, -p_amount, 'commit', jsonb_build_object('source', 'orchestrator', 'ref', p_ref));

  -- Re-read the post-trigger balance for an accurate return value.
  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_credits(p_user_id uuid, p_amount integer, p_ref text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: never refund the same ref twice.
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND metadata->>'ref' = p_ref AND delta > 0
  ) THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Only credit a real profile; the trigger applies the +delta.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (p_user_id, p_amount, 'refund', jsonb_build_object('source', 'orchestrator-rollback', 'ref', p_ref));

  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) TO service_role;
