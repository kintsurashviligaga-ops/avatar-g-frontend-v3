/**
 * Stripe Connect Integration - Database Migration
 * 
 * Adds Stripe Connect account tracking to seller_profiles
 * Date: 2026-02-14
 */

-- =====================================================
-- Add Stripe Connect fields to seller_profiles
-- =====================================================
ALTER TABLE seller_profiles
ADD COLUMN IF NOT EXISTS stripe_connected_account_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_account_status TEXT 
  CHECK (stripe_account_status IN ('pending', 'restricted', 'enabled', 'rejected')),
ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_onboarding_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_account_updated_at TIMESTAMPTZ;

-- Index for fast account lookups
CREATE INDEX IF NOT EXISTS idx_seller_profiles_stripe_account 
  ON seller_profiles(stripe_connected_account_id);

CREATE INDEX IF NOT EXISTS idx_seller_profiles_stripe_status 
  ON seller_profiles(stripe_account_status);

-- =====================================================
-- Table: stripe_connect_events
-- Description: Log all Connect account events for audit
-- =====================================================
CREATE TABLE IF NOT EXISTS stripe_connect_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'account_created',
    'account_updated',
    'onboarding_started',
    'onboarding_completed',
    'charges_enabled',
    'charges_disabled',
    'payouts_enabled',
    'payouts_disabled',
    'requirements_due',
    'account_restricted',
    'account_rejected'
  )),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for event queries
CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_seller 
  ON stripe_connect_events(seller_id);

CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_account 
  ON stripe_connect_events(stripe_account_id);

CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_type 
  ON stripe_connect_events(event_type);

CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_created 
  ON stripe_connect_events(created_at DESC);

-- RLS Policies
ALTER TABLE stripe_connect_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_connect_events_seller_policy ON stripe_connect_events
  FOR SELECT USING (seller_id = auth.uid());

-- =====================================================
-- Table: platform_commissions
-- Description: Track commission/fees on each transaction
-- =====================================================
CREATE TABLE IF NOT EXISTS platform_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Payment details
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_connected_account_id TEXT NOT NULL,
  
  -- Amount breakdown
  total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents > 0),
  application_fee_cents INTEGER NOT NULL CHECK (application_fee_cents >= 0),
  seller_payout_cents INTEGER NOT NULL CHECK (seller_payout_cents >= 0),
  
  -- Commission rate at time of transaction
  commission_percentage DECIMAL(5, 2) NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'failed', 'refunded')),
  collected_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_commissions_order 
  ON platform_commissions(order_id);

CREATE INDEX IF NOT EXISTS idx_platform_commissions_seller 
  ON platform_commissions(seller_id);

CREATE INDEX IF NOT EXISTS idx_platform_commissions_payment_intent 
  ON platform_commissions(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_platform_commissions_status 
  ON platform_commissions(status);

CREATE INDEX IF NOT EXISTS idx_platform_commissions_created 
  ON platform_commissions(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_platform_commissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_commissions_updated_at
  BEFORE UPDATE ON platform_commissions
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_commissions_updated_at();

-- RLS Policies
ALTER TABLE platform_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_commissions_seller_policy ON platform_commissions
  FOR SELECT USING (seller_id = auth.uid());

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to calculate application fee
CREATE OR REPLACE FUNCTION calculate_application_fee(
  total_amount_cents INTEGER,
  commission_percentage DECIMAL
) RETURNS INTEGER AS $$
BEGIN
  RETURN FLOOR(total_amount_cents * commission_percentage / 100);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if seller can receive payments
CREATE OR REPLACE FUNCTION can_seller_receive_payments(seller_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  seller_record RECORD;
BEGIN
  SELECT 
    stripe_connected_account_id,
    stripe_account_status,
    stripe_charges_enabled,
    stripe_payouts_enabled
  INTO seller_record
  FROM seller_profiles
  WHERE user_id = seller_user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  RETURN (
    seller_record.stripe_connected_account_id IS NOT NULL
    AND seller_record.stripe_account_status = 'enabled'
    AND seller_record.stripe_charges_enabled = TRUE
    AND seller_record.stripe_payouts_enabled = TRUE
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify migration success
DO $$
BEGIN
  -- Check if columns were added
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seller_profiles' 
    AND column_name = 'stripe_connected_account_id'
  ), 'Column stripe_connected_account_id not found';
  
  -- Check if tables were created
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'stripe_connect_events'
  ), 'Table stripe_connect_events not found';
  
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'platform_commissions'
  ), 'Table platform_commissions not found';
  
  -- Check if functions were created
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'calculate_application_fee'
  ), 'Function calculate_application_fee not found';
  
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'can_seller_receive_payments'
  ), 'Function can_seller_receive_payments not found';
  
  RAISE NOTICE '✅ Stripe Connect migration completed successfully';
END $$;

-- Sample query to check seller payment eligibility
-- SELECT user_id, can_seller_receive_payments(user_id) as can_receive_payments
-- FROM seller_profiles
-- LIMIT 10;
