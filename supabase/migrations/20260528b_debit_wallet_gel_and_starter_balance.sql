-- Avatar G — debit_wallet_gel + signup starter balance
-- =====================================================================
-- Adds:
--   1. debit_wallet_gel(uuid, numeric, text) — mirror of credit_wallet_gel
--      that ATOMICALLY appends a negative credit_ledger row (the existing
--      trigger_update_credits_balance applies the delta to
--      profiles.credits_balance). Idempotent on p_ref.
--   2. on_auth_user_created trigger on auth.users — seeds every new
--      account with a 1.00 ₾ complementary starter balance via the same
--      ledger path used by everything else (zero direct writes to
--      credits_balance).
--
-- All changes are additive (CREATE OR REPLACE / IF NOT EXISTS). Safe to
-- re-run.
--
-- Apply with `supabase db push` or via the Supabase dashboard SQL editor.

-- ── 1. debit_wallet_gel ───────────────────────────────────────────────────
-- Accepts fractional ₾ (NUMERIC) for the audit ledger; stores the exact
-- amount in metadata, applies the FLOOR'd integer delta to the balance via
-- the existing trigger. Refuses to write a debit that would take the
-- balance below 0 — raises 'insufficient_credits' so callers can surface
-- the wallet refill modal.

CREATE OR REPLACE FUNCTION public.debit_wallet_gel(
  p_user_id UUID,
  p_amount  NUMERIC,
  p_ref     TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance INTEGER;
  v_delta_int INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Idempotency on (user, ref, sign). A debit and a credit on the same ref
  -- are distinct rows so we filter delta < 0 here.
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND metadata->>'ref' = p_ref AND delta < 0
  ) THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Lock balance to serialize concurrent debits.
  SELECT credits_balance INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  v_delta_int := CEIL(p_amount)::INTEGER;  -- charge round-up to integer credits

  IF COALESCE(v_balance, 0) < v_delta_int THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001',
      DETAIL = format('have %s need %s', COALESCE(v_balance, 0), v_delta_int);
  END IF;

  -- The trigger applies -v_delta_int to profiles.credits_balance.
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (
    p_user_id,
    -v_delta_int,
    'commit',
    jsonb_build_object('source', 'audit_engine', 'ref', p_ref, 'amount_gel', p_amount)
  );

  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

COMMENT ON FUNCTION public.debit_wallet_gel IS
  'Idempotent (ref-keyed) GEL wallet debit. Stores exact fractional ₾ amount '
  'in metadata.amount_gel; applies CEIL(amount) as the integer credit delta '
  'via the credit_ledger trigger.';

-- ── 2. Signup starter balance — 1.00 ₾ ────────────────────────────────────
-- Fires once per new auth.users row. Idempotent on
-- ref = 'starter:'||user_id, so a re-run of this migration or a manual
-- retry never double-credits anyone.

CREATE OR REPLACE FUNCTION public.handle_auth_user_starter_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Ensure a profiles row exists (other migrations may already create one;
  -- INSERT … ON CONFLICT DO NOTHING is safe whether they fired first or not).
  INSERT INTO public.profiles (id, credits_balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (id) DO NOTHING;

  -- Idempotent starter credit. credit_ledger trigger applies +1 to balance.
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = NEW.id AND metadata->>'ref' = ('starter:' || NEW.id::text)
  ) THEN
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
    VALUES (
      NEW.id,
      1,
      'admin_adjustment',
      jsonb_build_object(
        'source', 'signup_starter',
        'ref', 'starter:' || NEW.id::text,
        'amount_gel', 1.00
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_starter_balance ON auth.users;
CREATE TRIGGER on_auth_user_starter_balance
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_starter_balance();

COMMENT ON FUNCTION public.handle_auth_user_starter_balance IS
  'On every new auth.users row, seed a 1.00 ₾ complementary starter balance '
  'via credit_ledger. Idempotent on ref=starter:<user_id>.';
