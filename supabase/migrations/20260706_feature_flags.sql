-- 20260706_feature_flags.sql — runtime feature-flag overrides for the Master Control Panel (v358 #3).
-- Apply in the Supabase SQL Editor (the Management API / CLI DDL channels are unavailable in this env).
-- ADDITIVE + fail-open: lib/server/feature-flags.ts returns the ENV value or the built-in default when this
-- table is absent, so nothing breaks pre-migration. Reads + writes go through the SERVICE-ROLE client only.

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name   text NOT NULL UNIQUE,
  enabled     boolean NOT NULL DEFAULT false,
  description text,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Deny-by-default: no anon/authenticated policy. The service-role key bypasses RLS, so the admin API
-- (which already gates on the email allowlist) is the only path that can read or write overrides.
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.feature_flags IS
  'Runtime overrides for per-request feature gates. Precedence: env-wins-when-set > this row > code default. Admin-only via service role.';
