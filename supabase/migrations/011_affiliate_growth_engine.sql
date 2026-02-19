-- Affiliate Growth Engine Schema
-- Phase 7: Affiliates, Referrals, Commissions, Payouts

-- ========================================
-- Table: affiliates
-- ========================================
CREATE TABLE IF NOT EXISTS public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_code TEXT UNIQUE NOT NULL,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON public.affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_active ON public.affiliates(is_active);

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own affiliate" ON public.affiliates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own affiliate" ON public.affiliates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own affiliate" ON public.affiliates
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ========================================
-- Table: affiliate_referrals
-- ========================================
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referred_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_touch_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_touch_at TIMESTAMPTZ,
  source TEXT,
  campaign TEXT,
  medium TEXT,
  landing_path TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_referrals_affiliate_id ON public.affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id ON public.affiliate_referrals(referred_user_id);

ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals" ON public.affiliate_referrals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = affiliate_referrals.affiliate_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage referrals" ON public.affiliate_referrals
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ========================================
-- Table: affiliate_commission_events
-- ========================================
CREATE TABLE IF NOT EXISTS public.affiliate_commission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_event_id TEXT UNIQUE NOT NULL,
  stripe_object_id TEXT,
  event_type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  gross_amount_cents INTEGER NOT NULL,
  commission_amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  available_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_affiliate_id ON public.affiliate_commission_events(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commission_status ON public.affiliate_commission_events(status);
CREATE INDEX IF NOT EXISTS idx_commission_available_at ON public.affiliate_commission_events(available_at);

ALTER TABLE public.affiliate_commission_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own commissions" ON public.affiliate_commission_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = affiliate_commission_events.affiliate_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage commissions" ON public.affiliate_commission_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ========================================
-- Table: affiliate_payouts
-- ========================================
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'requested',
  stripe_transfer_id TEXT,
  stripe_payout_id TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_payout_affiliate_id ON public.affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_payout_status ON public.affiliate_payouts(status);

ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payouts" ON public.affiliate_payouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = affiliate_payouts.affiliate_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage payouts" ON public.affiliate_payouts
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ========================================
-- Table: affiliate_clicks (optional)
-- ========================================
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  landing_url TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  utm_medium TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_clicks_affiliate_id ON public.affiliate_clicks(affiliate_id);

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clicks" ON public.affiliate_clicks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = affiliate_clicks.affiliate_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage clicks" ON public.affiliate_clicks
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
