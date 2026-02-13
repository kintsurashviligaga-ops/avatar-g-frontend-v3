/**
 * Avatar G - Business & Finance Layer
 *
 * Tables:
 * - fx_rates
 * - simulation_scenarios
 * - launch_plans
 * - payout_accounts
 * - payout_requests
 * - growth_kpis
 *
 * All money fields are integer cents.
 */

-- ============================================
-- FX RATES
-- ============================================

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL CHECK (base_currency IN ('GEL', 'USD')),
  quote_currency TEXT NOT NULL CHECK (quote_currency IN ('GEL', 'USD')),
  rate NUMERIC(12,6) NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_pair_created ON public.fx_rates(base_currency, quote_currency, created_at DESC);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_rates_read ON public.fx_rates;
DROP POLICY IF EXISTS fx_rates_write ON public.fx_rates;

-- Authenticated users can read latest FX rates
CREATE POLICY fx_rates_read ON public.fx_rates
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Writes only via service role (RLS bypass)
CREATE POLICY fx_rates_write ON public.fx_rates
  FOR INSERT WITH CHECK (false);

-- ============================================
-- SIMULATION SCENARIOS
-- ============================================

CREATE TABLE IF NOT EXISTS public.simulation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.shop_stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('GEL', 'USD')),
  inputs_json JSONB NOT NULL,
  outputs_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulation_scenarios_store ON public.simulation_scenarios(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulation_scenarios_user ON public.simulation_scenarios(user_id, created_at DESC);

ALTER TABLE public.simulation_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS simulation_scenarios_owner_select ON public.simulation_scenarios;
DROP POLICY IF EXISTS simulation_scenarios_owner_insert ON public.simulation_scenarios;
DROP POLICY IF EXISTS simulation_scenarios_owner_update ON public.simulation_scenarios;
DROP POLICY IF EXISTS simulation_scenarios_owner_delete ON public.simulation_scenarios;

CREATE POLICY simulation_scenarios_owner_select ON public.simulation_scenarios
  FOR SELECT USING (
    auth.uid() = user_id AND auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

CREATE POLICY simulation_scenarios_owner_insert ON public.simulation_scenarios
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

CREATE POLICY simulation_scenarios_owner_update ON public.simulation_scenarios
  FOR UPDATE USING (
    auth.uid() = user_id AND auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

CREATE POLICY simulation_scenarios_owner_delete ON public.simulation_scenarios
  FOR DELETE USING (
    auth.uid() = user_id AND auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

-- ============================================
-- LAUNCH PLANS
-- ============================================

CREATE TABLE IF NOT EXISTS public.launch_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.shop_stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  plan_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launch_plans_store ON public.launch_plans(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launch_plans_user ON public.launch_plans(user_id, created_at DESC);

ALTER TABLE public.launch_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS launch_plans_owner_select ON public.launch_plans;
DROP POLICY IF EXISTS launch_plans_owner_insert ON public.launch_plans;
DROP POLICY IF EXISTS launch_plans_owner_update ON public.launch_plans;
DROP POLICY IF EXISTS launch_plans_owner_delete ON public.launch_plans;

CREATE POLICY launch_plans_owner_select ON public.launch_plans
  FOR SELECT USING (
    auth.uid() = user_id AND auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

CREATE POLICY launch_plans_owner_insert ON public.launch_plans
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

CREATE POLICY launch_plans_owner_update ON public.launch_plans
  FOR UPDATE USING (
    auth.uid() = user_id AND auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

CREATE POLICY launch_plans_owner_delete ON public.launch_plans
  FOR DELETE USING (
    auth.uid() = user_id AND auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

-- ============================================
-- PAYOUT ACCOUNTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('stripe', 'tbc', 'bog', 'payze')),
  details_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_accounts_user ON public.payout_accounts(user_id, created_at DESC);

ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_accounts_owner_select ON public.payout_accounts;
DROP POLICY IF EXISTS payout_accounts_owner_insert ON public.payout_accounts;
DROP POLICY IF EXISTS payout_accounts_owner_update ON public.payout_accounts;
DROP POLICY IF EXISTS payout_accounts_owner_delete ON public.payout_accounts;

CREATE POLICY payout_accounts_owner_select ON public.payout_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY payout_accounts_owner_insert ON public.payout_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY payout_accounts_owner_update ON public.payout_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY payout_accounts_owner_delete ON public.payout_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- PAYOUT REQUESTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('GEL', 'USD')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'paid', 'rejected')),
  review_required BOOLEAN NOT NULL DEFAULT false,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON public.payout_requests(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status, requested_at DESC);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_requests_owner_select ON public.payout_requests;
DROP POLICY IF EXISTS payout_requests_owner_insert ON public.payout_requests;
DROP POLICY IF EXISTS payout_requests_owner_update ON public.payout_requests;

CREATE POLICY payout_requests_owner_select ON public.payout_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY payout_requests_owner_insert ON public.payout_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Updates only via service role
CREATE POLICY payout_requests_owner_update ON public.payout_requests
  FOR UPDATE USING (false);

-- ============================================
-- GROWTH KPIS
-- ============================================

CREATE TABLE IF NOT EXISTS public.growth_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.shop_stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  revenue_amount_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, date)
);

CREATE INDEX IF NOT EXISTS idx_growth_kpis_store ON public.growth_kpis(store_id, date DESC);

ALTER TABLE public.growth_kpis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS growth_kpis_owner_select ON public.growth_kpis;
DROP POLICY IF EXISTS growth_kpis_owner_insert ON public.growth_kpis;
DROP POLICY IF EXISTS growth_kpis_owner_update ON public.growth_kpis;

CREATE POLICY growth_kpis_owner_select ON public.growth_kpis
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

-- Inserts/updates only via service role
CREATE POLICY growth_kpis_owner_insert ON public.growth_kpis
  FOR INSERT WITH CHECK (false);

CREATE POLICY growth_kpis_owner_update ON public.growth_kpis
  FOR UPDATE USING (false);

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON public.fx_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulation_scenarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.launch_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_accounts TO authenticated;
GRANT SELECT, INSERT ON public.payout_requests TO authenticated;
GRANT SELECT ON public.growth_kpis TO authenticated;
