-- Migration: 20260521_credits_rpc_ledger
-- Durable ledger RPCs for the orchestrator Saga (lib/orchestrator/ledger.ts).
--
-- The app calls deduct_credits(p_user_id, p_amount, p_ref) and
-- refund_credits(p_user_id, p_amount, p_ref). These are NEW 3-arg overloads
-- that coexist with the existing 5-arg public.deduct_credits(...) — PostgREST
-- resolves by the named-argument set, so there is no ambiguity.
--
-- Contract expected by the ledger:
--   • deduct: RAISE 'insufficient_credits' when balance < amount (the ledger
--     classifies the message → fail-fast); otherwise decrement + return the
--     new INTEGER balance.
--   • refund: increment + return the new INTEGER balance (Saga compensation).
--   • Both are idempotent on p_ref so a Saga retry never double-applies.
--   • SECURITY DEFINER + locked search_path so they run above RLS safely.

-- ── deduct_credits(uuid, int, text) → integer ────────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount  INTEGER,
  p_ref     TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: if this exact ref already debited, return the current balance.
  IF EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id AND description = p_ref AND transaction_type = 'deduction'
  ) THEN
    SELECT balance INTO v_balance FROM public.credits WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Lock the balance row.
  SELECT balance INTO v_balance
  FROM public.credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001', DETAIL = 'no credit record';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001', DETAIL = format('have %s need %s', v_balance, p_amount);
  END IF;

  v_balance := v_balance - p_amount;

  UPDATE public.credits
  SET balance = v_balance,
      total_spent = total_spent + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions
    (user_id, amount, balance_after, transaction_type, description, job_id, agent_id)
  VALUES
    (p_user_id, -p_amount, v_balance, 'deduction', p_ref, NULL, 'orchestrator');

  RETURN v_balance;
END;
$$;

-- ── refund_credits(uuid, int, text) → integer ────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id UUID,
  p_amount  INTEGER,
  p_ref     TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: never refund the same ref twice.
  IF EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id AND description = p_ref AND transaction_type = 'refund'
  ) THEN
    SELECT balance INTO v_balance FROM public.credits WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Upsert a credit row so a refund can never silently no-op.
  INSERT INTO public.credits (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.credits
  SET balance = balance + p_amount,
      total_earned = total_earned + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions
    (user_id, amount, balance_after, transaction_type, description, job_id, agent_id)
  VALUES
    (p_user_id, p_amount, v_balance, 'refund', p_ref, NULL, 'orchestrator');

  RETURN v_balance;
END;
$$;

-- ── Execution grants ─────────────────────────────────────────────────────────
-- Service role (server runners) + authenticated callers may invoke; SECURITY
-- DEFINER means the body runs as the owner, bypassing RLS on public.credits.
REVOKE ALL ON FUNCTION public.deduct_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) TO authenticated, service_role;
