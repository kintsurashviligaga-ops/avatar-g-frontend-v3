-- Avatar G — credit_transactions: per-action credit ledger for the Settings → History tab.
-- Created: 2026-06-25
--
-- The GEL wallet (credit_ledger / credit_wallet_gel) is the source of truth for MONEY;
-- this table is the human-readable, credit-denominated activity feed the user sees
-- ("🎬 ვიდეო 30წმ  −25 კრედიტი"). It is written best-effort from /api/credits/record
-- after each successful generation and read by /api/credits/history (last 10).
-- Purely additive + fail-open: if this migration hasn't run, both routes degrade to
-- a no-op / empty list and nothing else is affected.

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action        text NOT NULL,            -- e.g. 'video', 'music', 'image', 'avatar', 'remix', 'topup'
  credits_delta integer NOT NULL,         -- negative = spent, positive = top-up
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Fast "last N for this user, newest first" reads.
CREATE INDEX IF NOT EXISTS credit_transactions_user_created_idx
  ON public.credit_transactions (user_id, created_at DESC);

-- RLS: a user may read their OWN rows; writes go through the service-role route
-- (which bypasses RLS), so no INSERT policy is granted to end users.
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_transactions_select_own ON public.credit_transactions;
CREATE POLICY credit_transactions_select_own
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.credit_transactions IS
  'Human-readable credit activity feed (Settings → History). Written by /api/credits/record (service role), read by /api/credits/history. 1 credit = 0.10 GEL.';
