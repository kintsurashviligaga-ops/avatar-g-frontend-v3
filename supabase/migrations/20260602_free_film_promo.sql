-- Avatar G — "First 30-second film free" founder promo (server-authoritative)
-- Created: 2026-06-02
--
-- Grants every profile ONE free 30-second cinematic film. The film's single
-- charge point is /api/video/assemble (ASSEMBLE_COST credits); this migration
-- lets that route waive the debit exactly once per user, atomically, with a
-- guaranteed restore-on-failure so a failed render never burns the free slot.
--
-- Design mirrors consume_free_avatar_chat (20260523_wallet_and_onboarding.sql):
--   • SECURITY DEFINER + locked search_path (runs above RLS, like the credit RPCs)
--   • the WHERE guard makes the decrement race-safe — concurrent assembles can
--     never double-spend past 0, and the function returns -1 when exhausted so
--     the caller falls back to the normal paid path (NEVER an infinite free loop).

-- ── profiles: free-film counter (default 1 = the founder bonus) ───────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_films_remaining INTEGER NOT NULL DEFAULT 1;

-- ── consume_free_film(uuid) → integer ─────────────────────────────────────────
-- Atomically burns the user's free film. Returns the new remaining count (>= 0)
-- when one was consumed, or -1 when none remain. Race-safe via the WHERE guard.
CREATE OR REPLACE FUNCTION public.consume_free_film(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  UPDATE public.profiles
     SET free_films_remaining = free_films_remaining - 1
   WHERE id = p_user_id
     AND COALESCE(free_films_remaining, 0) > 0
  RETURNING free_films_remaining INTO v_remaining;

  IF FOUND THEN
    RETURN v_remaining;
  END IF;
  RETURN -1;
END;
$$;

-- ── restore_free_film(uuid) → integer ─────────────────────────────────────────
-- Compensation: hands the free slot back when a render that consumed it later
-- fails (saga rollback). Idempotency is NOT enforced here — the caller only
-- invokes this on the compensate path of a consume it actually performed, so a
-- single +1 exactly undoes a single -1. Returns the new remaining count.
CREATE OR REPLACE FUNCTION public.restore_free_film(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  UPDATE public.profiles
     SET free_films_remaining = COALESCE(free_films_remaining, 0) + 1
   WHERE id = p_user_id
  RETURNING free_films_remaining INTO v_remaining;

  RETURN COALESCE(v_remaining, 0);
END;
$$;

COMMENT ON FUNCTION public.consume_free_film IS 'Atomic free-film decrement; -1 when exhausted (caller charges normally).';
COMMENT ON FUNCTION public.restore_free_film IS 'Saga compensation: returns one free film after a failed render that consumed it.';
