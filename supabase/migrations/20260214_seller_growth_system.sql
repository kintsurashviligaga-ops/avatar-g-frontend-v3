/**
 * Seller Growth System - Database Migration
 * 
 * Creates tables for:
 * - seller_profiles
 * - onboarding_events
 * - growth_campaigns
 * - revenue_forecasts
 * 
 * Date: 2026-02-14
 */

-- =====================================================
-- Table: seller_profiles
-- Description: Extended seller information and configuration
-- =====================================================
CREATE TABLE IF NOT EXISTS seller_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  tax_status TEXT NOT NULL CHECK (tax_status IN ('vat_payer', 'non_vat_payer')),
  business_type TEXT NOT NULL CHECK (business_type IN ('dropshipping', 'own_product', 'digital')),
  target_monthly_income_cents INTEGER NOT NULL CHECK (target_monthly_income_cents >= 10000),
  available_budget_cents INTEGER NOT NULL CHECK (available_budget_cents >= 5000),
  pricing_mode TEXT NOT NULL DEFAULT 'hybrid' CHECK (pricing_mode IN ('growth', 'profit', 'hybrid')),
  margin_floor_bps INTEGER NOT NULL DEFAULT 2000 CHECK (margin_floor_bps >= 0 AND margin_floor_bps <= 10000),
  margin_target_bps INTEGER NOT NULL DEFAULT 3000 CHECK (margin_target_bps >= 0 AND margin_target_bps <= 10000),
  guardrails_enabled BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_seller_profiles_user_id ON seller_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_tax_status ON seller_profiles(tax_status);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_business_type ON seller_profiles(business_type);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_seller_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seller_profiles_updated_at
  BEFORE UPDATE ON seller_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_profiles_updated_at();

-- =====================================================
-- Table: onboarding_events
-- Description: Log of all onboarding automation events
-- =====================================================
CREATE TABLE IF NOT EXISTS onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'onboarding_started',
    'tax_status_detected',
    'pricing_mode_set',
    'margin_configured',
    'product_recommendation_generated',
    'gtm_plan_generated',
    'onboarding_completed',
    'onboarding_failed'
  )),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for event queries
CREATE INDEX IF NOT EXISTS idx_onboarding_events_user_id ON onboarding_events(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_event_type ON onboarding_events(event_type);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_status ON onboarding_events(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_created_at ON onboarding_events(created_at DESC);

-- =====================================================
-- Table: growth_campaigns
-- Description: Growth/marketing campaign tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS growth_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('dm', 'tiktok', 'email', 'referral')),
  script_content TEXT,
  cac_target_cents INTEGER,
  conversions INTEGER NOT NULL DEFAULT 0,
  total_reach INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for campaign queries
CREATE INDEX IF NOT EXISTS idx_growth_campaigns_seller_id ON growth_campaigns(seller_id);
CREATE INDEX IF NOT EXISTS idx_growth_campaigns_campaign_type ON growth_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_growth_campaigns_created_at ON growth_campaigns(created_at DESC);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_growth_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER growth_campaigns_updated_at
  BEFORE UPDATE ON growth_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_growth_campaigns_updated_at();

-- =====================================================
-- Table: revenue_forecasts
-- Description: Cached revenue projections (1, 3, 6 months)
-- =====================================================
CREATE TABLE IF NOT EXISTS revenue_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  forecast_month INTEGER NOT NULL CHECK (forecast_month IN (1, 3, 6)),
  gmv_projection_cents INTEGER NOT NULL,
  revenue_projection_cents INTEGER NOT NULL,
  net_profit_projection_cents INTEGER NOT NULL,
  ltv_cac_ratio NUMERIC(10,2),
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one forecast per seller per month
  UNIQUE(seller_id, forecast_month)
);

-- Index for forecast queries
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_seller_id ON revenue_forecasts(seller_id);
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_forecast_month ON revenue_forecasts(forecast_month);
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_generated_at ON revenue_forecasts(generated_at DESC);

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_forecasts ENABLE ROW LEVEL SECURITY;

-- Seller profiles: Users can only see their own profile
CREATE POLICY seller_profiles_select ON seller_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY seller_profiles_insert ON seller_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY seller_profiles_update ON seller_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin can see all seller profiles
CREATE POLICY seller_profiles_admin ON seller_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Onboarding events: Users can see their own events
CREATE POLICY onboarding_events_select ON onboarding_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY onboarding_events_insert ON onboarding_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin can see all onboarding events
CREATE POLICY onboarding_events_admin ON onboarding_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Growth campaigns: Users can see and manage their own campaigns
CREATE POLICY growth_campaigns_select ON growth_campaigns
  FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY growth_campaigns_insert ON growth_campaigns
  FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY growth_campaigns_update ON growth_campaigns
  FOR UPDATE
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- Revenue forecasts: Users can see their own forecasts
CREATE POLICY revenue_forecasts_select ON revenue_forecasts
  FOR SELECT
  USING (auth.uid() = seller_id);

-- Admin can see all forecasts
CREATE POLICY revenue_forecasts_admin ON revenue_forecasts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- =====================================================
-- Migration Complete
-- =====================================================
-- Run this migration in Supabase SQL Editor
-- or via: supabase migration new seller_growth_system
