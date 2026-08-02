-- ============================================================================
-- 20260802c_unified_free_trial.sql — ONE free trial grant, replacing three that disagreed.
--
-- Apply BY HAND in the Supabase SQL Editor (automated DDL is dead on this project). Idempotent: every
-- statement is CREATE OR REPLACE, ALTER … DEFAULT, or guarded, so a re-run is a no-op. VERIFY block at
-- the end raises if anything did not take.
--
-- ⚠️ WHAT WAS WRONG. A new user was told three different things and given a fourth:
--     · the pricing card advertised 6 images  = 12 credits
--     · on_auth_user_starter_balance granted  = 10 credits
--     · profiles.free_films_remaining DEFAULT 3 handed out THREE FREE VIDEOS that the credit ledger
--       knows nothing about — a separate currency with a separate counter
--   So "what do I get for free" had no single answer anywhere in the product, and the most expensive
--   part of it (the videos) was the part not denominated in credits at all.
--
-- ⚠️ AND THE VIDEOS WERE THE ENTIRE COST. At the guardrail's own unit prices ($0.96/8s video,
--   $0.10/track, $0.03/image), the old free tier cost $3.06 per signup — and $2.88 of that, 94%, was
--   the three films. The credits were rounding error. Signup is AUTO-CONFIRMED (no email verification),
--   so that figure is also the per-farmed-account cost, repeatable at will.
--
--   New grant: 50 credits, video capped at 1 by free_films_remaining.
--     worst realistic mix  1 video + 5 tracks   = $1.46
--     1 video + 12 images                       = $1.32
--     25 images                                 = $0.75
--   Less than half what it replaces, while showing the user a 5x bigger number than the card used to.
--
-- ⚠️ THE CAP IS ENFORCED IN CODE, NOT COPY. free_films_remaining is decremented by the race-safe
--   consume_free_film() RPC and restored by restore_free_film() on failure. Video is the ONLY medium
--   sold below cost (25 credits = $0.926 of revenue against $0.96 of Veo spend), which is exactly why
--   it is the one that needs a hard quota rather than a credit price.
-- ============================================================================

BEGIN;

-- ─── 1. The single starter grant: 10 → 50 credits ───────────────────────────
CREATE OR REPLACE FUNCTION public.on_auth_user_starter_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
     WHERE user_id = NEW.id AND metadata->>'kind' = 'signup_bonus'
  ) THEN
    RETURN NEW;
  END IF;

  -- ⚠️ LEDGER INSERT ONLY. The AFTER INSERT trigger on credit_ledger maintains
  -- profiles.credits_balance; adding an explicit UPDATE here pays the user TWICE (that bug shipped
  -- once already — see 20260802b_fix_double_credit.sql).
  -- reason MUST be a value the credit_ledger_reason_check CHECK accepts ('purchase'|'commit'|'refund');
  -- the specifics live in metadata.
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (NEW.id, 50, 'purchase',
          jsonb_build_object('kind', 'signup_bonus', 'credits', 50,
                             'note', 'free trial: 50 credits, max 1 video (free_films_remaining)'));

  RETURN NEW;
END;
$fn$;

-- ─── 2. The video quota: 3 → 1 ──────────────────────────────────────────────
ALTER TABLE public.profiles ALTER COLUMN free_films_remaining SET DEFAULT 1;

COMMENT ON COLUMN public.profiles.free_films_remaining IS
  'Free VIDEO quota for the trial. DEFAULT 1 (was 3). This is a QUOTA, not a currency: the 50-credit '
  'signup grant is the currency, and this caps how much of it may go to video — the one medium sold '
  'below provider cost. Decremented by consume_free_film(), restored by restore_free_film().';

-- ⚠️ EXISTING BALANCES ARE NOT CLAWED BACK. Accounts already holding 3 keep them: they were promised
-- that, and retroactively taking back a granted allowance to tidy a default is how you turn a pricing
-- change into a support incident. Only NEW signups get the new quota.
--   To see the exposure this leaves:  SELECT count(*), sum(free_films_remaining)
--                                       FROM profiles WHERE free_films_remaining > 1;

COMMIT;

-- ============================================================================
-- VERIFY
DO $$
DECLARE v_default text; v_body text;
BEGIN
  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'free_films_remaining';
  IF v_default IS NULL OR v_default NOT LIKE '1%' THEN
    RAISE EXCEPTION 'VERIFY FAILED — free_films_remaining default is %, expected 1', v_default;
  END IF;

  SELECT prosrc INTO v_body FROM pg_proc WHERE proname = 'on_auth_user_starter_balance';
  IF v_body IS NULL OR v_body NOT LIKE '%50%' THEN
    RAISE EXCEPTION 'VERIFY FAILED — starter grant does not mention 50 credits';
  END IF;
  IF v_body LIKE '%UPDATE public.profiles%' THEN
    RAISE EXCEPTION 'VERIFY FAILED — starter grant contains an explicit balance UPDATE; the ledger trigger already does that and this would pay twice';
  END IF;

  RAISE NOTICE 'VERIFY OK — starter grant = 50 credits (ledger insert only), free video quota default = 1.';
END $$;

-- Confirm on the next signup:
--   SELECT delta, reason, metadata FROM credit_ledger
--    WHERE metadata->>'kind' = 'signup_bonus' ORDER BY created_at DESC LIMIT 1;   -- delta 50
-- ============================================================================
