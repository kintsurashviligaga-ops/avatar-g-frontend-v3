-- =====================================================================================================================
-- 20261002c — debit_wallet_gel(uuid, numeric, text): the per-leg debit the composite pipelines call, which DOES NOT
-- EXIST on the production database.
--
-- ⚠️⚠️ PREPARED, NOT APPLIED — AND APPLYING IT IS A PRICING DECISION, NOT A BUG FIX. READ ALL OF THIS FIRST. ⚠️⚠️
--
-- WHAT IS BROKEN (verified live 2026-10-02: `select proname from pg_proc where pronamespace='public'::regnamespace`
-- lists add_credits, consume_free_*, credit_wallet_gel, deduct_credits, refund_credits, restore_free_*,
-- update_credits_balance — and no debit_wallet_gel; no film_clip_charges table, no refund_film_clip either):
--   lib/observability/agentTrace.ts `recordTrace({ deduct: true, costRetailGel, deductRef })` calls
--   `supabase.rpc('debit_wallet_gel', …)` and only console.warns the error. Every caller therefore charges NOTHING:
--     · lib/chat/filmComposite.ts     — every film CLIP (deductRef `${compositeId}:clip:${ordinal}`, 2.00 ₾ forecast each)
--     · lib/chat/musicVideoComposite.ts — the lyrics / music / video legs (`${compositeId}:lyrics|music|video`)
--   The studio's Video mode renders through filmComposite, so today a paying user's film costs ONLY the 20-credit
--   /api/video/assemble charge (or their one free film) while the clips cost the platform ~$0.96 (Veo Fast) to
--   ~$3.20 (Veo Standard) each. If the user never assembles (or the assemble 402s), the clips cost them nothing.
--   The refunds are already ledger-authoritative (refundDebitByRef: the net debited under each leg's ref — today 0),
--   so creating this function makes them refund exactly what it took. No other code change is required.
--
-- WHY THIS FILE IS NOT A SIMPLE "RESTORE": 20260528b_debit_wallet_gel_and_starter_balance.sql (never applied) defined
-- this function as CEIL(p_amount) credits — written when credits_balance was denominated in ₾. Today 1 credit = 0.10 ₾
-- (lib/credits/pricing CREDIT_VALUE_GEL) and credit_wallet_gel credits FLOOR(₾ × 10). Applying 20260528b as written
-- would charge 2 credits (0.20 ₾) for a 2.00 ₾ clip — 10× under. DO NOT APPLY 20260528b. This file uses the current
-- rate (× 10), so a 2.00 ₾ clip debits 20 credits.
--
-- WHAT APPLYING THIS DOES TO PRICES (owner decision required):
--   · film: 20 credits per clip + 20 assemble → 8 s (1 clip) = 40, 24 s (3) = 80, 48 s (6) = 140 credits;
--     the studio's own toast and pricing table quote video_30s = 25 / video_60s = 45 credits.
--   · music video: lyrics + music + video legs at their retail forecasts × 10.
--   The film pre-flight gate (filmComposite → filmBalanceDecision) compares profiles.credits_balance (CREDITS) with
--   forecast.totalRetailGel (₾): it under-requires by 10×, so it would not stop a user from starting a film they
--   cannot pay for — the per-clip debits would then refuse (insufficient_credits) and those clips render free.
--   RECOMMENDED instead of applying this as-is: price a film ONCE at creditCostFor('video', { seconds }) — the
--   figure the UI already shows — reserved before dispatch (the product-ad path does exactly this on its primary
--   clip), and set clip retail to 0. That is a code change, deliberately not made in the credit-audit branch.
--
-- SHAPE (mirrors deduct_credits, which the rest of the app uses):
--   · idempotent on (user_id, ref) among DEBITS — a replayed ref returns the balance without a second charge;
--   · the balance row is locked FOR UPDATE, then an overdraw raises 'insufficient_credits' (P0001) like deduct_credits;
--   · the ledger row carries source/ref/amount_gel/rate; the AFTER INSERT trigger moves profiles.credits_balance;
--   · SECURITY DEFINER with a pinned search_path, EXECUTE revoked from PUBLIC/anon/authenticated (20260929a's rule:
--     a money RPC that trusts p_user_id is service-role only).
-- After applying: re-run `node scripts/check-db-exposure.mjs`.
-- =====================================================================================================================

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
  v_credits INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_ref IS NULL OR p_ref = '' THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- 1 credit = 0.10 ₾ — the rate credit_wallet_gel credits at (FLOOR(₾ × 10)); a debit rounds UP.
  v_credits := CEIL(p_amount * 10)::INTEGER;

  -- Idempotency: never debit the same ref twice (debits only — a refund under `${ref}:refund` is a different ref).
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND metadata->>'ref' = p_ref AND delta < 0
  ) THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  SELECT credits_balance INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001', DETAIL = 'no profile record';
  END IF;

  IF COALESCE(v_balance, 0) < v_credits THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001',
      DETAIL = format('have %s need %s', COALESCE(v_balance, 0), v_credits);
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (
    p_user_id,
    -v_credits,
    'commit',
    jsonb_build_object('source', 'composite_leg', 'ref', p_ref, 'amount_gel', p_amount, 'rate', 10)
  );

  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

COMMENT ON FUNCTION public.debit_wallet_gel(UUID, NUMERIC, TEXT) IS
  'Per-leg composite debit: CEIL(p_amount ₾ × 10) credits, idempotent on (user, ref) among debits, overdraw raises '
  'insufficient_credits. Service-role only. Applying it turns ON per-clip film billing — see 20261002c header.';

REVOKE ALL ON FUNCTION public.debit_wallet_gel(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_wallet_gel(UUID, NUMERIC, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet_gel(UUID, NUMERIC, TEXT) TO service_role;
