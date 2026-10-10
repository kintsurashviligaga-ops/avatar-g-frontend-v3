-- =====================================================================================================================
-- 20261002d — close the same-ref RACE in deduct_credits / refund_credits. APPLIED to Production 2026-10-10 11:05Z on the
-- owner's word (decision card, 11:03Z). Verified after: index valid; the three bodies hash to the same md5s as this file
-- applied over scripts/lease-isolation/schema.sql (deduct b3359006…, refund d6808dfd…, once f64d747a…); anon /
-- authenticated cannot execute them; ledger unchanged (222 rows, balance sum 1,003,393, 0 negative); Advisor unchanged.
--
-- No price or behaviour change for any single request. Prerequisites re-verified READ-ONLY on Production 2026-10-10:
-- 0 (user, ref) groups with more than one debit (and 0 with more than one credit); all 125 debits carry a ref and are
-- reason 'commit'; deduct_credits is the only writer of negative rows (admin debits go through it too); 0 negative
-- balances; the live function bodies hash to the md5s pinned in scripts/lease-isolation/ledger-race.sh.
--
-- THE RACE. Both RPCs dedupe with `IF EXISTS (… same ref …) THEN RETURN balance` BEFORE taking the row lock:
--   · deduct_credits — two concurrent calls with the same ref both pass the EXISTS check, then serialise on
--     `SELECT … FOR UPDATE` and BOTH insert a debit. Nothing stops it: only POSITIVE refs have a unique index
--     (credit_ledger_user_ref_positive_uniq). Result: one request, charged twice. The routes' Redis in-flight mutex
--     narrows this, but it fails open without Redis, and a retry that races its own first attempt gets through.
--     Reproduced on a throwaway Postgres 16 with the live bodies: scripts/lease-isolation/ledger-race.sh, section 2.
--   · refund_credits — the positive-ref unique index already blocks the second insert, but as an ERROR (23505), so
--     the losing caller is told the refund failed (reportError noise, `refunded: false` to the user) although the
--     credit-back landed exactly once.
--
-- THE FIX.
--   (0) preflight: refuse, with a clear message and before touching anything, if duplicate debit groups exist;
--   (1) deduct_credits re-checks the ref AFTER taking the row lock. Every debit of a user serialises on that lock and
--       each statement reads a fresh snapshot, so the second caller now sees the first one's committed debit and
--       answers like the EXISTS path (the balance), instead of charging again — or, when the balance no longer
--       covers a second charge, instead of telling a request that WAS charged that it has insufficient credits;
--   (2) a unique partial index for debits, mirroring the one for credits, as the backstop the database enforces;
--   (3) both functions catch unique_violation and answer like their EXISTS path, so a lost race is a no-op success;
--   (4) a NEW deduct_credits_once that returns {balance, charged}, so a route can tell its own charge from a replay
--       and refuse the replay before it renders (gap C5). Routes fall back to a ledger read + deduct_credits until
--       this is applied (lib/orchestrator/ledger.ts deductCreditsOnce).
-- Same signatures (CREATE OR REPLACE keeps the grants; they are re-asserted anyway). Idempotent: safe to re-run.
-- Proven in isolation (53 checks): scripts/lease-isolation/ledger-race.sh. After applying: run the self-verification
-- at the bottom (it runs as part of this file) and `node scripts/check-db-exposure.mjs`.
--
-- ROLLBACK: scripts/lease-isolation/20261002d.rollback.sql (drops the index and deduct_credits_once, restores the two
-- live bodies verbatim).
-- =====================================================================================================================

-- ── (0) Preflight ───────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_groups integer;
BEGIN
  IF to_regclass('public.credit_ledger_user_ref_negative_uniq') IS NULL THEN
    SELECT count(*) INTO v_groups FROM (
      SELECT 1 FROM public.credit_ledger
      WHERE delta < 0 AND metadata->>'ref' IS NOT NULL
      GROUP BY user_id, metadata->>'ref' HAVING count(*) > 1
    ) d;
    IF v_groups > 0 THEN
      RAISE EXCEPTION '20261002d preflight: % (user, ref) group(s) already hold more than one debit; resolve them first', v_groups
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
END
$$;

-- ── (2) The backstop index ──────────────────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_user_ref_negative_uniq
  ON public.credit_ledger USING btree (user_id, ((metadata ->> 'ref'::text)))
  WHERE ((delta < 0) AND ((metadata ->> 'ref'::text) IS NOT NULL));

-- ── (1) + (3) deduct_credits ────────────────────────────────────────────────────────────────────────────────────────
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

  -- Idempotency (ref lives in metadata; reason is a constrained enum). Fast path, before the lock.
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

  -- Idempotency again, UNDER the lock: a same-ref call that held the lock before us has committed its debit by now.
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND metadata->>'ref' = p_ref AND delta < 0
  ) THEN
    RETURN COALESCE(v_balance, 0);
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

-- ── (3) refund_credits ──────────────────────────────────────────────────────────────────────────────────────────────
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

-- ── (4) deduct_credits_once: the same charge, and it SAYS whether this call took it ─────────────────────────────────
-- deduct_credits answers a replayed ref with SUCCESS and no debit, by design (a retry must not pay twice). A route that
-- renders on that success renders a second time for free. This variant returns {balance, charged}: `charged` is true
-- only for the call that inserted the debit, so a replay (sequential or concurrent) is refused before any render, with
-- no read-then-charge window. Decided under the row lock, like (1). New function; deduct_credits is unchanged.
CREATE OR REPLACE FUNCTION public.deduct_credits_once(p_user_id uuid, p_amount integer, p_ref text)
 RETURNS jsonb
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
  IF p_ref IS NULL OR btrim(p_ref) = '' THEN
    RAISE EXCEPTION 'invalid_ref' USING ERRCODE = '22023';
  END IF;

  SELECT credits_balance INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001', DETAIL = 'no profile record';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND metadata->>'ref' = p_ref AND delta < 0
  ) THEN
    RETURN jsonb_build_object('balance', COALESCE(v_balance, 0), 'charged', false);
  END IF;

  IF COALESCE(v_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001',
      DETAIL = format('have %s need %s', COALESCE(v_balance, 0), p_amount);
  END IF;

  BEGIN
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
    VALUES (p_user_id, -p_amount, 'commit', jsonb_build_object('source', 'orchestrator', 'ref', p_ref));
  EXCEPTION WHEN unique_violation THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object('balance', COALESCE(v_balance, 0), 'charged', false);
  END;

  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN jsonb_build_object('balance', COALESCE(v_balance, 0), 'charged', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) TO service_role;
REVOKE ALL ON FUNCTION public.deduct_credits_once(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_once(uuid, integer, text) TO service_role;

-- ── Self-verification ───────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.credit_ledger_user_ref_negative_uniq') AND indisvalid AND indisunique
  ) THEN
    RAISE EXCEPTION '20261002d: credit_ledger_user_ref_negative_uniq is missing or invalid';
  END IF;
  IF pg_get_functiondef('public.deduct_credits(uuid,integer,text)'::regprocedure) NOT LIKE '%UNDER the lock%'
     OR pg_get_functiondef('public.deduct_credits(uuid,integer,text)'::regprocedure) NOT LIKE '%unique_violation%'
     OR pg_get_functiondef('public.refund_credits(uuid,integer,text)'::regprocedure) NOT LIKE '%unique_violation%' THEN
    RAISE EXCEPTION '20261002d: function bodies not replaced';
  END IF;
  IF to_regprocedure('public.deduct_credits_once(uuid,integer,text)') IS NULL THEN
    RAISE EXCEPTION '20261002d: deduct_credits_once missing';
  END IF;
  IF has_function_privilege('anon', 'public.deduct_credits(uuid,integer,text)', 'execute')
     OR has_function_privilege('authenticated', 'public.deduct_credits(uuid,integer,text)', 'execute')
     OR has_function_privilege('anon', 'public.refund_credits(uuid,integer,text)', 'execute')
     OR has_function_privilege('authenticated', 'public.refund_credits(uuid,integer,text)', 'execute')
     OR has_function_privilege('anon', 'public.deduct_credits_once(uuid,integer,text)', 'execute')
     OR has_function_privilege('authenticated', 'public.deduct_credits_once(uuid,integer,text)', 'execute') THEN
    RAISE EXCEPTION '20261002d: anon/authenticated can execute a ledger function';
  END IF;
END
$$;
