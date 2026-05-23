-- Avatar G — server-side wallet top-up reconciliation + onboarding anti-abuse
-- Created: 2026-05-23
--
-- Ties the front-end GEL wallet + onboarding gate into a hardened server lifecycle:
--   • profiles gains avatar_name / is_avatar_named / free_avatar_chats_remaining.
--   • wallet_topups gives idempotent (ref-keyed) Stripe credit reconciliation.
--   • RPCs are SECURITY DEFINER + locked search_path (run above RLS, like the
--     existing credit RPCs). Crediting goes THROUGH credit_ledger so the
--     trigger-maintained profiles.credits_balance stays the single balance of
--     record (these RPCs never write credits_balance directly).

-- ── profiles: onboarding columns ─────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_avatar_named BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_avatar_chats_remaining INTEGER NOT NULL DEFAULT 3;

-- ── wallet_topups: idempotency ledger for Stripe GEL credits ──────────────────
CREATE TABLE IF NOT EXISTS public.wallet_topups (
  ref        TEXT PRIMARY KEY,                 -- e.g. 'stripe:<session_id>' — dedupe key
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_gel NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wallet_topups_user_idx ON public.wallet_topups(user_id, created_at DESC);
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_topups_owner_select ON public.wallet_topups;
CREATE POLICY wallet_topups_owner_select ON public.wallet_topups FOR SELECT USING (auth.uid() = user_id);

-- ── credit_wallet_gel(uuid, numeric, text) → integer ──────────────────────────
-- Idempotent on p_ref. Credits the user's GEL balance exactly once per ref by
-- appending a credit_ledger row (the balance trigger applies the +delta).
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

  -- Idempotency gate: a re-delivered Stripe event with the same ref no-ops.
  INSERT INTO public.wallet_topups (ref, user_id, amount_gel)
  VALUES (p_ref, p_user_id, p_amount)
  ON CONFLICT (ref) DO NOTHING;

  IF NOT FOUND THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- First time for this ref → append the credit (trigger updates credits_balance).
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (p_user_id, FLOOR(p_amount)::INTEGER, 'wallet_topup',
          jsonb_build_object('source', 'stripe', 'ref', p_ref, 'amount_gel', p_amount));

  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

-- ── consume_free_avatar_chat(uuid) → integer ──────────────────────────────────
-- Atomically burns one free response. Returns the new remaining count (>= 0)
-- when one was consumed, or -1 when the user has none left (the WHERE guard makes
-- this race-safe — concurrent calls can never double-decrement past 0).
CREATE OR REPLACE FUNCTION public.consume_free_avatar_chat(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  UPDATE public.profiles
     SET free_avatar_chats_remaining = free_avatar_chats_remaining - 1
   WHERE id = p_user_id
     AND COALESCE(free_avatar_chats_remaining, 0) > 0
  RETURNING free_avatar_chats_remaining INTO v_remaining;

  IF FOUND THEN
    RETURN v_remaining;
  END IF;
  RETURN -1;
END;
$$;

-- ── set_avatar_name(uuid, text) → void ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_avatar_name(p_user_id UUID, p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET avatar_name = NULLIF(LEFT(p_name, 40), ''),
         is_avatar_named = TRUE
   WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.credit_wallet_gel IS 'Idempotent (ref-keyed) GEL wallet credit via credit_ledger.';
COMMENT ON FUNCTION public.consume_free_avatar_chat IS 'Atomic free-response decrement; -1 when exhausted.';
