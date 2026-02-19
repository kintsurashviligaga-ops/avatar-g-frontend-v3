-- Avatar G SaaS Core Migration
-- Billing + Credits + Jobs + Idempotent Webhooks

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================
-- Subscriptions
-- =============================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'FREE',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.subscriptions
  ALTER COLUMN plan SET DEFAULT 'FREE',
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN cancel_at_period_end SET DEFAULT FALSE,
  ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE public.subscriptions
SET
  plan = COALESCE(NULLIF(UPPER(plan), ''), 'FREE'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  cancel_at_period_end = COALESCE(cancel_at_period_end, FALSE),
  updated_at = COALESCE(updated_at, NOW());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_plan_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_plan_check
      CHECK (UPPER(plan) IN ('FREE', 'PRO', 'PREMIUM', 'ENTERPRISE'));
  END IF;
END $$;

-- =============================
-- Credits
-- =============================
CREATE TABLE IF NOT EXISTS public.credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  monthly_allowance INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS balance INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_allowance INTEGER,
  ADD COLUMN IF NOT EXISTS reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.credits
  ALTER COLUMN balance SET DEFAULT 0,
  ALTER COLUMN monthly_allowance SET DEFAULT 0,
  ALTER COLUMN reset_at SET DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE public.credits
SET
  balance = COALESCE(balance, 0),
  monthly_allowance = COALESCE(monthly_allowance, 0),
  reset_at = COALESCE(reset_at, date_trunc('month', NOW()) + INTERVAL '1 month'),
  updated_at = COALESCE(updated_at, NOW());

-- =============================
-- Jobs
-- =============================
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  cost INTEGER NOT NULL DEFAULT 0,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS agent_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS cost INTEGER,
  ADD COLUMN IF NOT EXISTS input_json JSONB,
  ADD COLUMN IF NOT EXISTS output_json JSONB,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.jobs
  ALTER COLUMN status SET DEFAULT 'queued',
  ALTER COLUMN cost SET DEFAULT 0,
  ALTER COLUMN input_json SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE public.jobs
SET
  status = CASE
    WHEN status IN ('done', 'completed', 'succeeded') THEN 'succeeded'
    WHEN status IN ('error', 'failed') THEN 'failed'
    WHEN status = 'processing' THEN 'processing'
    ELSE 'queued'
  END,
  cost = COALESCE(cost, COALESCE(cost_credits, 0)),
  input_json = COALESCE(input_json, '{}'::jsonb),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_status_check'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_status_check
      CHECK (status IN ('queued', 'processing', 'succeeded', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS jobs_user_created_idx ON public.jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_user_agent_idx ON public.jobs(user_id, agent_id);

-- =============================
-- Idempotency + Credit Ledger
-- =============================
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  agent_id TEXT,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_idempotency_key_unique
  ON public.credit_ledger(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx ON public.credit_ledger(user_id, created_at DESC);

-- =============================
-- Helpers
-- =============================
CREATE OR REPLACE FUNCTION public.plan_monthly_allowance(p_plan TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE UPPER(COALESCE(p_plan, 'FREE'))
    WHEN 'FREE' THEN RETURN 100;
    WHEN 'PRO' THEN RETURN 1000;
    WHEN 'PREMIUM' THEN RETURN 5000;
    WHEN 'ENTERPRISE' THEN RETURN 20000;
    ELSE RETURN 100;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_billing_rows(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
  v_allowance INTEGER;
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status, updated_at)
  VALUES (p_user_id, 'FREE', 'active', NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT plan INTO v_plan
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  v_allowance := public.plan_monthly_allowance(v_plan);

  INSERT INTO public.credits (user_id, balance, monthly_allowance, reset_at, updated_at)
  VALUES (
    p_user_id,
    v_allowance,
    v_allowance,
    date_trunc('month', NOW()) + INTERVAL '1 month',
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_user_credits_if_due(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
  v_allowance INTEGER;
BEGIN
  PERFORM public.ensure_user_billing_rows(p_user_id);

  SELECT plan INTO v_plan
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  v_allowance := public.plan_monthly_allowance(v_plan);

  UPDATE public.credits
  SET
    monthly_allowance = v_allowance,
    balance = CASE WHEN reset_at <= NOW() THEN v_allowance ELSE balance END,
    reset_at = CASE WHEN reset_at <= NOW() THEN date_trunc('month', NOW()) + INTERVAL '1 month' ELSE reset_at END,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits_transaction(
  p_user_id UUID,
  p_amount INTEGER,
  p_job_id UUID,
  p_agent_id TEXT,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
  v_existing_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'Amount must be greater than zero'::TEXT;
    RETURN;
  END IF;

  PERFORM public.reset_user_credits_if_due(p_user_id);

  IF p_idempotency_key IS NOT NULL THEN
    SELECT balance_after INTO v_existing_balance
    FROM public.credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT TRUE, v_existing_balance, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  SELECT balance INTO v_balance
  FROM public.credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 'Credits row not found'::TEXT;
    RETURN;
  END IF;

  IF v_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, v_balance, 'Insufficient credits'::TEXT;
    RETURN;
  END IF;

  v_balance := v_balance - p_amount;

  UPDATE public.credits
  SET balance = v_balance, updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_ledger (
    user_id,
    job_id,
    agent_id,
    amount,
    balance_after,
    reason,
    idempotency_key
  ) VALUES (
    p_user_id,
    p_job_id,
    p_agent_id,
    -p_amount,
    v_balance,
    p_reason,
    p_idempotency_key
  );

  RETURN QUERY SELECT TRUE, v_balance, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.refill_due_credits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  WITH due_users AS (
    SELECT c.user_id, s.plan
    FROM public.credits c
    LEFT JOIN public.subscriptions s ON s.user_id = c.user_id
    WHERE c.reset_at <= NOW()
  ), updates AS (
    UPDATE public.credits c
    SET
      balance = public.plan_monthly_allowance(d.plan),
      monthly_allowance = public.plan_monthly_allowance(d.plan),
      reset_at = date_trunc('month', NOW()) + INTERVAL '1 month',
      updated_at = NOW()
    FROM due_users d
    WHERE c.user_id = d.user_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated_count FROM updates;

  RETURN v_updated_count;
END;
$$;

-- =============================
-- RLS
-- =============================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'subscriptions_owner_select'
  ) THEN
    CREATE POLICY subscriptions_owner_select ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'credits' AND policyname = 'credits_owner_select'
  ) THEN
    CREATE POLICY credits_owner_select ON public.credits FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'jobs_owner_select'
  ) THEN
    CREATE POLICY jobs_owner_select ON public.jobs FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'credit_ledger' AND policyname = 'credit_ledger_owner_select'
  ) THEN
    CREATE POLICY credit_ledger_owner_select ON public.credit_ledger FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
