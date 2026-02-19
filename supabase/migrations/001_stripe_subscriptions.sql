-- Stripe Subscriptions Schema
-- Run this in your Supabase SQL Editor

-- ========================================
-- SUBSCRIPTIONS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing', 'unpaid')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- Index for fast Stripe subscription ID lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- Index for fast customer ID lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(stripe_customer_id);

-- Index for active subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status) WHERE status IN ('active', 'trialing');

-- RLS Policies
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own subscriptions
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update subscriptions (webhooks)
CREATE POLICY "Service role can manage subscriptions" ON subscriptions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ========================================
-- USER PROFILES TABLE (for customer mapping)
-- ========================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Index for customer ID lookup
CREATE INDEX IF NOT EXISTS idx_user_profiles_customer_id ON user_profiles(stripe_customer_id);

-- RLS Policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ========================================
-- WEBHOOK EVENTS TABLE (idempotency)
-- ========================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast event lookup
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);

-- RLS disabled for service role only access
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage webhook events" ON webhook_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ========================================
-- FUNCTIONS
-- ========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for subscriptions
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_profiles
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- CLEANUP (optional - for development reset)
-- ========================================

-- Uncomment to reset tables (WARNING: deletes all data)
-- DROP TABLE IF EXISTS webhook_events CASCADE;
-- DROP TABLE IF EXISTS subscriptions CASCADE;
-- DROP TABLE IF EXISTS user_profiles CASCADE;

-- ========================================
-- VERIFICATION
-- ========================================

-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('subscriptions', 'user_profiles', 'webhook_events');

-- Check indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename IN ('subscriptions', 'user_profiles', 'webhook_events')
ORDER BY tablename, indexname;

-- Check RLS policies
SELECT tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('subscriptions', 'user_profiles', 'webhook_events')
ORDER BY tablename, policyname;
