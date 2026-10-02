-- =====================================================================================================================
-- 20261002d — close the same-ref RACE in deduct_credits / refund_credits. PREPARED, NOT APPLIED.
--
-- Safe to apply on its own (no price or behaviour change for any single request); verified prerequisite on the live
-- database 2026-10-02: there are ZERO (user_id, metadata->>'ref') groups with more than one DEBIT row, so the unique
-- index below builds cleanly.
--
-- THE RACE. Both RPCs dedupe with `IF EXISTS (… same ref …) THEN RETURN balance` BEFORE taking the row lock:
--   · deduct_credits — two concurrent calls with the same ref both pass the EXISTS check, then serialise on
--     `SELECT … FOR UPDATE` and BOTH insert a debit. Nothing stops it: only POSITIVE refs have a unique index
--     (credit_ledger_user_ref_positive_uniq). Result: one request, charged twice. The routes' Redis in-flight mutex
--     narrows this, but it fails open without Redis, and a retry that races its own first attempt gets through.
--   · refund_credits — the positive-ref unique index already blocks the second insert, but as an ERROR (23505), so
--     the losing caller is told the refund failed (reportError noise, `refunded: false` to the user) although the
--     credit-back landed exactly once.
--
-- THE FIX. (1) a unique partial index for debits, mirroring the one for credits; (2) both functions catch
-- unique_violation and answer exactly like their EXISTS path (return the balance) — so a lost race is a no-op
-- success, not a second charge and not a false error. Same signatures (CREATE OR REPLACE keeps the 20260929a grants;
-- they are re-asserted anyway). Bodies are the live definitions verbatim plus the handler.
-- After applying: `node scripts/check-db-exposure.mjs`.
-- =====================================================================================================================

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_user_ref_negative_uniq
  ON public.credit_ledger USING btree (user_id, ((metadata ->> 'ref'::text)))
  WHERE ((delta < 0) AND ((metadata ->> 'ref'::text) IS NOT NULL));

CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer, p_ref text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

  BEGIN
    -- Append the ledger row; trigger_update_credits_balance applies the delta.
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
    VALUES (p_user_id, -p_amount, 'commit', jsonb_build_object('source', 'orchestrator', 'ref', p_ref));
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent call with the same ref won the race: that IS this charge. Answer like the EXISTS path.
    NULL;
  END;

  -- Re-read the post-trigger balance for an accurate return value.
  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_credits(p_user_id uuid, p_amount integer, p_ref text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

  BEGIN
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
    VALUES (p_user_id, p_amount, 'refund', jsonb_build_object('source', 'orchestrator-rollback', 'ref', p_ref));
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent refund with the same ref landed first — the credit-back happened exactly once. Not an error.
    NULL;
  END;

  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) TO service_role;
