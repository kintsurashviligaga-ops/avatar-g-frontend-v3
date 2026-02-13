-- Avatar G SaaS - Stripe Event Idempotency & Enhanced Credits
-- Migration: 005_stripe_events_idempotency
-- Created: Feb 2026

-- ============================================
-- STRIPE EVENTS TABLE (Idempotency)
-- ============================================
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Stripe event data
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  
  -- Processing status
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Event data (for debugging)
  event_data JSONB,
  
  -- Result tracking
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_events_stripe_event_id_idx ON public.stripe_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS stripe_events_event_type_idx ON public.stripe_events(event_type);
CREATE INDEX IF NOT EXISTS stripe_events_created_idx ON public.stripe_events(created_at DESC);

-- No RLS needed - this is internal only, accessed by service role

COMMENT ON TABLE public.stripe_events IS 'Track processed Stripe webhook events for idempotency';

-- ============================================
-- ORCHESTRATION RUNS TABLE (AI Orchestration Logging)
-- ============================================
CREATE TABLE IF NOT EXISTS public.orchestration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Request details
  agent_id VARCHAR(100) NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  task_type VARCHAR(100),
  
  -- Input/Output (hashed for privacy)
  input_hash VARCHAR(64),
  input_summary TEXT,
  output_summary TEXT,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  
  -- Usage tracking
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 4) DEFAULT 0,
  credits_spent INTEGER DEFAULT 0,
  
  -- Timing
  duration_ms INTEGER,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS orchestration_runs_user_idx ON public.orchestration_runs(user_id);
CREATE INDEX IF NOT EXISTS orchestration_runs_agent_idx ON public.orchestration_runs(agent_id);
CREATE INDEX IF NOT EXISTS orchestration_runs_provider_idx ON public.orchestration_runs(provider_id);
CREATE INDEX IF NOT EXISTS orchestration_runs_status_idx ON public.orchestration_runs(status);
CREATE INDEX IF NOT EXISTS orchestration_runs_created_idx ON public.orchestration_runs(created_at DESC);

ALTER TABLE public.orchestration_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY orchestration_runs_user_policy ON public.orchestration_runs
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.orchestration_runs IS 'Log all AI orchestration runs for analytics and debugging';

-- ============================================
-- CREDIT LEDGER VIEW (Compatibility Alias)
-- ============================================
CREATE OR REPLACE VIEW public.credit_ledger AS
SELECT
  id,
  user_id,
  amount AS delta,
  transaction_type AS reason,
  job_id AS ref_id,
  agent_id AS ref_type,
  metadata,
  created_at
FROM public.credit_transactions;

COMMENT ON VIEW public.credit_ledger IS 'Compatibility view mapping credit_transactions to credit_ledger schema';

-- ============================================
-- FUNCTION: Check and Record Stripe Event (Idempotent)
-- ============================================
CREATE OR REPLACE FUNCTION public.check_stripe_event_processed(
  p_event_id VARCHAR(255)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Check if event already processed
  SELECT EXISTS(
    SELECT 1 FROM public.stripe_events WHERE stripe_event_id = p_event_id
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_stripe_event(
  p_event_id VARCHAR(255),
  p_event_type VARCHAR(100),
  p_event_data JSONB DEFAULT NULL,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.stripe_events (
    stripe_event_id, 
    event_type, 
    event_data, 
    success, 
    error_message
  ) VALUES (
    p_event_id,
    p_event_type,
    p_event_data,
    p_success,
    p_error_message
  )
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- ============================================
-- FUNCTION: Update Monthly Allowance (Called on subscription changes)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_monthly_allowance(
  p_user_id UUID,
  p_plan VARCHAR(50)
)
RETURNS TABLE(success BOOLEAN, new_allowance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowance INTEGER;
BEGIN
  -- Determine allowance based on plan
  CASE p_plan
    WHEN 'FREE' THEN v_allowance := 100;
    WHEN 'PRO' THEN v_allowance := 500;
    WHEN 'BASIC' THEN v_allowance := 500;
    WHEN 'PREMIUM' THEN v_allowance := 2000;
    WHEN 'ENTERPRISE' THEN v_allowance := 10000;
    ELSE v_allowance := 100;
  END CASE;
  
  -- Update credits record
  UPDATE public.credits
  SET 
    monthly_allowance = v_allowance,
    -- If upgrading, grant new allowance immediately
    balance = CASE 
      WHEN balance < v_allowance THEN v_allowance 
      ELSE balance 
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Create record if doesn't exist
  IF NOT FOUND THEN
    INSERT INTO public.credits (user_id, balance, monthly_allowance)
    VALUES (p_user_id, v_allowance, v_allowance);
  END IF;
  
  RETURN QUERY SELECT true, v_allowance;
END;
$$;

-- ============================================
-- VIEW: User Billing Summary (For Admin Dashboard)
-- ============================================
CREATE OR REPLACE VIEW public.billing_summary AS
SELECT 
  s.user_id,
  p.email,
  p.full_name,
  s.plan,
  s.status AS subscription_status,
  c.balance AS current_credits,
  c.monthly_allowance,
  c.total_spent AS lifetime_credits_spent,
  s.current_period_end,
  s.cancel_at_period_end,
  s.created_at AS subscription_created_at
FROM public.subscriptions s
LEFT JOIN public.profiles p ON p.id = s.user_id
LEFT JOIN public.credits c ON c.user_id = s.user_id;

COMMENT ON VIEW public.billing_summary IS 'Combined view of user billing and credit data for admin dashboard';

-- ============================================
-- FUNCTION: Get User Credits (Safe Read)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_credits(p_user_id UUID)
RETURNS TABLE(
  balance INTEGER,
  monthly_allowance INTEGER,
  next_reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT c.balance, c.monthly_allowance, c.next_reset_at
  FROM public.credits c
  WHERE c.user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.check_stripe_event_processed IS 'Check if a Stripe event has already been processed';
COMMENT ON FUNCTION public.record_stripe_event IS 'Record a processed Stripe event for idempotency';
COMMENT ON FUNCTION public.update_monthly_allowance IS 'Update user monthly credit allowance based on subscription plan';
COMMENT ON FUNCTION public.get_user_credits IS 'Safely retrieve user credit balance and allowance';
