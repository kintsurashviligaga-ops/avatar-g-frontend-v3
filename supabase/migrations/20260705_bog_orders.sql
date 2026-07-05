-- Avatar G — bog_orders: pending BOG (Bank of Georgia) checkout → user mapping
-- =============================================================================
-- The BOG webhook (app/api/billing/bog/webhook) receives an authenticated callback that
-- identifies an order but NOT which of our users paid. This table is written at initiate time
-- (app/api/checkout/bog/initiate) so the webhook can resolve shop_order_id → user_id + amount and
-- credit the correct wallet. The AMOUNT here is the server-side source of truth (from the validated
-- REFILL tier) — the webhook never trusts the callback's amount to decide how much to credit.
--
-- Fully ADDITIVE + idempotent (IF NOT EXISTS). RLS on: owners may read their own orders; all writes
-- go through the service-role client (initiate + webhook), which bypasses RLS.
--
-- Apply with `supabase db push` or the Supabase dashboard SQL editor.

CREATE TABLE IF NOT EXISTS public.bog_orders (
  shop_order_id TEXT PRIMARY KEY,                     -- our internal id, echoed to BOG as shop_order_id
  bog_order_id  TEXT,                                 -- BOG's order id (filled after order creation)
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_gel    NUMERIC(12,2) NOT NULL CHECK (amount_gel > 0),
  status        TEXT NOT NULL DEFAULT 'pending',      -- pending | paid | rejected | pending/…
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bog_orders_user_idx     ON public.bog_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bog_orders_bog_id_idx   ON public.bog_orders (bog_order_id);

ALTER TABLE public.bog_orders ENABLE ROW LEVEL SECURITY;

-- Owners can read their own order history; writes are service-role only (no INSERT/UPDATE policy).
DROP POLICY IF EXISTS bog_orders_owner_select ON public.bog_orders;
CREATE POLICY bog_orders_owner_select ON public.bog_orders
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.bog_orders IS
  'Pending/settled Bank of Georgia checkout orders. Maps shop_order_id → user_id + amount so the '
  'BOG webhook credits the right wallet. Amount is the server-side source of truth for crediting.';
