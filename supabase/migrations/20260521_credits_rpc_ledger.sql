-- Migration: 20260521_credits_rpc_ledger
-- Durable ledger RPCs for the orchestrator Saga (lib/orchestrator/ledger.ts).
--
-- LIVE schema of this project:
--   • public.profiles.credits_balance (integer) — balance of record
--   • public.credit_ledger (user_id, job_id, delta, reason, metadata, created_at)
--       reason ∈ {reserve, commit, refund, admin_adjustment, purchase}
--   • TRIGGER trigger_update_credits_balance AFTER INSERT ON credit_ledger
--       applies delta to profiles.credits_balance.
--
-- ⇒ These RPCs MUST NOT touch profiles.credits_balance directly (the trigger
--   owns that). They only validate + append a ledger row; the trigger does the
--   arithmetic. Balance is re-read after the insert for an accurate return.
--
-- Contract for lib/orchestrator/ledger.ts:
--   • deduct: RAISE 'insufficient_credits' when balance < amount → fail-fast;
--     else append delta=-amount and return the new INTEGER balance.
--   • refund: append delta=+amount (Saga compensation), return new balance.
--   • idempotent on p_ref (stored in metadata->>'ref' since reason is enum'd).
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
$$;

-- ── Execution grants ─────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.deduct_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) TO authenticated, service_role;

-- ── High-load optimization ───────────────────────────────────────────────────
-- Idempotency guards probe credit_ledger by (user_id, metadata->>'ref').
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_ref
  ON public.credit_ledger (user_id, (metadata->>'ref'));
