-- Avatar G — FIX: credit_wallet_gel used an invalid credit_ledger reason
-- =====================================================================
-- BUG (found 2026-07-05 via a live grant attempt): credit_wallet_gel appended a credit_ledger row
-- with reason = 'wallet_topup', but credit_ledger has a CHECK constraint (credit_ledger_reason_check)
-- allowing only {reserve, commit, refund, admin_adjustment, purchase} (see 20260521_credits_rpc_ledger).
-- So EVERY GEL wallet top-up routed through this function — real Stripe top-ups AND the new BOG webhook
-- (which credits via creditWalletGel) — raised:
--     ERROR 23514: new row for relation "credit_ledger" violates check constraint "credit_ledger_reason_check"
-- and credited nothing.
--
-- FIX: use 'purchase' (a valid, semantically-correct reason — a wallet top-up IS a credit purchase).
-- This is the ONLY change vs 20260523_wallet_and_onboarding.sql; idempotency + trigger behavior are
-- identical. Safer than widening the constraint (no risk of dropping other in-use reason values).
--
-- Apply with the Supabase SQL Editor (CREATE OR REPLACE — additive, no data touched).

CREATE OR REPLACE FUNCTION public.credit_wallet_gel(
  p_user_id UUID,
  p_amount  NUMERIC,
  p_ref     TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Idempotency gate: a re-delivered event with the same ref no-ops.
  INSERT INTO public.wallet_topups (ref, user_id, amount_gel)
  VALUES (p_ref, p_user_id, p_amount)
  ON CONFLICT (ref) DO NOTHING;

  IF NOT FOUND THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- First time for this ref → append the credit (trigger updates credits_balance).
  -- 'purchase' is in credit_ledger_reason_check; 'wallet_topup' was NOT (the bug).
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (p_user_id, FLOOR(p_amount)::INTEGER, 'purchase',
          jsonb_build_object('source', 'wallet_topup', 'ref', p_ref, 'amount_gel', p_amount));

  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

COMMENT ON FUNCTION public.credit_wallet_gel IS
  'Idempotent (ref-keyed) GEL wallet credit via credit_ledger. reason=purchase (constraint-valid); '
  'source=wallet_topup in metadata. Fixed 2026-07-05 — prior wallet_topup reason violated the CHECK.';
