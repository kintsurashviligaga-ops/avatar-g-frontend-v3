-- ============================================================
-- Referral System Migration
-- Adds referral columns to profiles table
-- Run: via Supabase Management API or Dashboard SQL editor
-- ============================================================

-- Add referral columns to profiles (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code          TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_count         INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_credits_earned INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_redeemed      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS referral_used_code     TEXT;

-- Index for fast lookup by referral code
CREATE INDEX IF NOT EXISTS profiles_referral_code_idx
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

-- Helper RPC: safely add credits to a user
CREATE OR REPLACE FUNCTION public.add_credits(p_user_id UUID, p_amount INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Try to update existing row
  UPDATE public.credits
    SET balance = balance + p_amount
  WHERE user_id = p_user_id;

  -- If no row updated, insert one
  IF NOT FOUND THEN
    INSERT INTO public.credits (user_id, balance, monthly_allowance, reset_at)
    VALUES (p_user_id, p_amount, 200, NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = credits.balance + EXCLUDED.balance;
  END IF;
END;
$$;

-- Grant execute to authenticated users (called server-side with service role anyway)
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, INT) TO service_role;
