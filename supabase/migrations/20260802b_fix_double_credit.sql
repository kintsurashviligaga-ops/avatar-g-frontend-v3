-- ============================================================================
-- 20260802b_fix_double_credit.sql
--
-- ⚠️ THIS REPAIRS A BUG I SHIPPED IN 20260802_credit_denomination_and_starter.sql. Read this before
--    running anything else: that migration granted every credit TWICE.
--
-- WHY. `credit_ledger` has an AFTER INSERT trigger that maintains `profiles.credits_balance` — I
-- verified it empirically after the fact (insert a +7 ledger row, the balance moves +7 on its own).
-- 20260705_fix_credit_wallet_gel_reason.sql even says so in a parenthesis: "(trigger updates
-- credits_balance)". My migration inserted the ledger row AND then ran its own
-- `UPDATE profiles SET credits_balance = credits_balance + n`, so every path credited n twice:
--     · credit_wallet_gel            → every future top-up would pay out 20x, not the intended 10x
--     · on_auth_user_starter_balance → every new signup would receive 20 credits, not 10
--     · the retroactive settlement   → already ran, and over-credited one account by 900
--
-- MEASURED DAMAGE, from reconciling all 34 accounts against their own ledgers:
--     kintsurashviligaga@gmail.com   ledger 901, balance 1801   → 900 too high  ← caused by me
--   Six other accounts also disagree with their ledgers (drift 100, and 1,000,000 on
--   sandbox-test@avatarg.ai). Those are seeded test accounts that never had ledger rows and predate
--   this work — they are NOT touched here. Fixing what I did not break, in a money table, on the same
--   pass as an apology, is how a small error becomes an unexplainable one.
--
-- IDEMPOTENT: the functions are CREATE OR REPLACE, and the correction is guarded by its own marker.
-- ============================================================================

BEGIN;

-- ─── 1. Let the trigger do its job — the functions must only append to the ledger ────
CREATE OR REPLACE FUNCTION public.credit_wallet_gel(
  p_user_id uuid,
  p_amount  numeric,
  p_ref     text,
  p_reason  text DEFAULT 'purchase'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_credits integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_topups WHERE ref = p_ref) THEN RETURN; END IF;

  -- 1 credit = 0.10 GEL, so credits = GEL x 10.
  v_credits := FLOOR(p_amount * 10);

  INSERT INTO public.wallet_topups (ref, user_id, amount_gel)
  VALUES (p_ref, p_user_id, p_amount);

  -- ⚠️ LEDGER INSERT ONLY. The AFTER INSERT trigger on credit_ledger moves credits_balance; adding an
  -- explicit UPDATE here (as my previous version did) pays the user twice.
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (p_user_id, v_credits, COALESCE(p_reason, 'purchase'),
          jsonb_build_object('ref', p_ref, 'amount_gel', p_amount, 'rate', 10));
END;
$fn$;

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

  -- 10 credits = 5 images. Ledger insert only; the trigger updates the balance.
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (NEW.id, 10, 'purchase',
          jsonb_build_object('kind', 'signup_bonus', 'credits', 10, 'images', 5));

  RETURN NEW;
END;
$fn$;

-- ─── 2. Take back the 900 that was granted twice ────────────────────────────
-- Scoped deliberately narrowly: ONLY accounts that received the settlement row, and only by the amount
-- that row double-paid. Recorded in the ledger as a correction rather than done silently, because a
-- balance that drops without explanation is worse than the original error.
--
-- ⚠️ This ledger insert will ALSO fire the trigger, which is exactly what is wanted here: one negative
-- ledger row, one matching balance decrease. That is the same mechanism the bug misused by adding a
-- second, manual update on top of it.
DO $$
DECLARE
  v_fix text := 'double_credit_fix_20260802b';
BEGIN
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE metadata->>'kind' = v_fix) THEN
    RAISE NOTICE 'double-credit correction already applied — skipping';
    RETURN;
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  SELECT user_id, -delta, 'commit',
         jsonb_build_object('kind', v_fix,
                            'note', 'reverses the duplicate grant from 20260802: that migration wrote the ledger row AND updated credits_balance, but an AFTER INSERT trigger already does the second part')
    FROM public.credit_ledger
   WHERE metadata->>'kind' = 'denomination_repair_20260802'
     AND delta > 0;

  RAISE NOTICE 'double-credit correction applied';
END $$;

COMMIT;

-- ============================================================================
-- VERIFY — every account should now agree with its own ledger, except the pre-existing
-- seeded test accounts (audit-probe-*, smoke-*, qa-*, sandbox-test@avatarg.ai):
--
--   SELECT p.email, p.credits_balance AS balance, COALESCE(SUM(l.delta), 0) AS ledger,
--          p.credits_balance - COALESCE(SUM(l.delta), 0) AS drift
--     FROM profiles p LEFT JOIN credit_ledger l ON l.user_id = p.id
--    GROUP BY p.id, p.email, p.credits_balance
--   HAVING p.credits_balance <> COALESCE(SUM(l.delta), 0)
--    ORDER BY drift DESC;
--
-- kintsurashviligaga@gmail.com should read balance 901 = ledger 901, drift 0.
-- ============================================================================
