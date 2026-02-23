-- Monetization + Multi-tenant + Growth Automation
-- Created: 2026-02-23

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'FREE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.org_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color TEXT,
  accent_color TEXT,
  app_name TEXT,
  support_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.usage_meter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  service_id TEXT NOT NULL,
  route TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('api_call', 'job_enqueue', 'job_execution', 'tokens', 'storage_output')),
  units NUMERIC(18,4) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.runtime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  route TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER NOT NULL,
  plan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.job_runtime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.service_jobs(id) ON DELETE CASCADE,
  queue TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  retries INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('bonus_credits', 'discount_month')),
  reward_units INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.service_jobs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS queue_name TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_usage_meter_user_time ON public.usage_meter_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_meter_org_time ON public.usage_meter_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_meter_route_time ON public.usage_meter_events(route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_logs_route_time ON public.runtime_logs(route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runtime_logs_job ON public.job_runtime_logs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_processed ON public.events(processed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_jobs_queue_status ON public.service_jobs(queue_name, status, created_at DESC);

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_meter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orgs_member_select ON public.orgs;
CREATE POLICY orgs_member_select ON public.orgs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = orgs.id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS org_members_member_select ON public.org_members;
CREATE POLICY org_members_member_select ON public.org_members
  FOR SELECT
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = org_members.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS org_branding_member_select ON public.org_branding;
CREATE POLICY org_branding_member_select ON public.org_branding
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = org_branding.org_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS usage_meter_own_select ON public.usage_meter_events;
CREATE POLICY usage_meter_own_select ON public.usage_meter_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS referral_codes_own_select ON public.referral_codes;
CREATE POLICY referral_codes_own_select ON public.referral_codes
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS referral_events_related_select ON public.referral_events;
CREATE POLICY referral_events_related_select ON public.referral_events
  FOR SELECT USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());

DROP POLICY IF EXISTS events_own_select ON public.events;
CREATE POLICY events_own_select ON public.events
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE public.orgs IS 'Organization tenants for multi-tenant/white-label support.';
COMMENT ON TABLE public.usage_meter_events IS 'Per-action billing usage meter events.';
COMMENT ON TABLE public.events IS 'Lifecycle and growth automation events with processing state.';
