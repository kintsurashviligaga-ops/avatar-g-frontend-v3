-- Avatar G SaaS - Billing, Credits, and Subscriptions
-- Migration: 004_saas_billing_credits
-- Created: Feb 2026

-- ============================================
-- PROFILES TABLE (User Extended Data)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_user_policy ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- ============================================
-- SUBSCRIPTIONS TABLE (Stripe Integration)
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Stripe identifiers
  stripe_customer_id TEXT UNIQUE NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  
  -- Plan details
  plan VARCHAR(50) NOT NULL DEFAULT 'FREE', -- FREE, PRO, PREMIUM, ENTERPRISE
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, canceled, past_due, incomplete
  
  -- Billing cycle
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_idx ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_plan_idx ON public.subscriptions(plan);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_user_policy ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- CREDITS TABLE (Monthly Allowance & Balance)
-- ============================================
CREATE TABLE IF NOT EXISTS public.credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Current balance
  balance INTEGER NOT NULL DEFAULT 0,
  
  -- Monthly allowance based on plan
  monthly_allowance INTEGER NOT NULL DEFAULT 100, -- FREE plan default
  
  -- Reset tracking
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_reset_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  
  -- Usage tracking
  total_earned INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credits_next_reset_idx ON public.credits(next_reset_at);

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY credits_user_policy ON public.credits
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- CREDIT TRANSACTIONS TABLE (Audit Log)
-- ============================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Transaction details  
  amount INTEGER NOT NULL, -- Can be negative (deduction) or positive (refill/bonus)
  balance_after INTEGER NOT NULL,
  
  -- Context
  transaction_type VARCHAR(50) NOT NULL, -- 'deduction', 'refill', 'bonus', 'refund'
  description TEXT,
  
  -- Related entities
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  agent_id VARCHAR(100),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_transactions_user_idx ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS credit_transactions_created_idx ON public.credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS credit_transactions_job_idx ON public.credit_transactions(job_id);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_transactions_user_policy ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- ENHANCE JOBS TABLE
-- ============================================
-- Add cost_credits if not exists
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS cost_credits INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agent_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS plan_required VARCHAR(50);

CREATE INDEX IF NOT EXISTS jobs_agent_id_idx ON public.jobs(agent_id);

-- ============================================
-- FUNCTIONS: Credit Reset
-- ============================================
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.credits
  SET 
    balance = monthly_allowance,
    last_reset_at = NOW(),
    next_reset_at = NOW() + INTERVAL '1 month',
    updated_at = NOW()
  WHERE next_reset_at <= NOW();
END;
$$;

-- ============================================
-- FUNCTIONS: Deduct Credits (Transaction-Safe)
-- ============================================
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_job_id UUID,
  p_agent_id VARCHAR(100),
  p_description TEXT
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the row for update
  SELECT balance INTO v_current_balance
  FROM public.credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Check if user has credit record
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Credit record not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check sufficient balance
  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT false, v_current_balance, 'Insufficient credits'::TEXT;
    RETURN;
  END IF;
  
  -- Calculate new balance
  v_new_balance := v_current_balance - p_amount;
  
  -- Update balance
  UPDATE public.credits
  SET 
    balance = v_new_balance,
    total_spent = total_spent + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_after, transaction_type, description, job_id, agent_id
  ) VALUES (
    p_user_id, -p_amount, v_new_balance, 'deduction', p_description, p_job_id, p_agent_id
  );
  
  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$;

-- ============================================
-- FUNCTIONS: Add Credits (Refill/Bonus)
-- ============================================
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Credit addition'
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Update balance
  UPDATE public.credits
  SET 
    balance = balance + p_amount,
    total_earned = total_earned + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.credits (user_id, balance, monthly_allowance, total_earned)
    VALUES (p_user_id, p_amount, 100, p_amount)
    RETURNING balance INTO v_new_balance;
  END IF;
  
  -- Log transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_after, transaction_type, description
  ) VALUES (
    p_user_id, p_amount, v_new_balance, 'refill', p_description
  );
  
  RETURN QUERY SELECT true, v_new_balance;
END;
$$;

-- ============================================
-- TRIGGERS: Auto-update timestamps
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at 
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credits_updated_at 
  BEFORE UPDATE ON public.credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- DEFAULT DATA: Initialize FREE plan credits for existing users
-- ============================================
INSERT INTO public.subscriptions (user_id, stripe_customer_id, plan, status)
SELECT 
  id, 
  'temp_' || id::text, 
  'FREE', 
  'active'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.credits (user_id, balance, monthly_allowance)
SELECT 
  id, 
  100, 
  100
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.profiles (id, email)
SELECT 
  id,
  email
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE public.subscriptions IS 'Stripe subscription and plan data';
COMMENT ON TABLE public.credits IS 'User credit balance and monthly allowance';
COMMENT ON TABLE public.credit_transactions IS 'Audit log for all credit changes';
COMMENT ON FUNCTION public.deduct_credits IS 'Transaction-safe credit deduction with balance check';
COMMENT ON FUNCTION public.add_credits IS 'Add credits to user balance (refill/bonus)';
COMMENT ON FUNCTION public.reset_monthly_credits IS 'Reset credits to monthly allowance for all users';
