-- 20261014a_phone_agent_connection.sql
-- Verified phone onboarding for Agent G. OTP rows are service-role only: codes and phone numbers are sensitive.

ALTER TABLE public.agent_g_user_prefs
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_agent_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS agent_g_user_prefs_verified_phone_uq
  ON public.agent_g_user_prefs (phone_number)
  WHERE phone_verified = TRUE AND phone_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.agent_g_phone_otp_challenges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'ubill' CHECK (provider IN ('ubill', 'twilio')),
  code_hash TEXT NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_g_phone_otp_user_created_idx
  ON public.agent_g_phone_otp_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_g_phone_otp_phone_created_idx
  ON public.agent_g_phone_otp_challenges (phone_e164, created_at DESC);

ALTER TABLE public.agent_g_phone_otp_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_g_phone_otp_challenges FROM anon, authenticated;

COMMENT ON TABLE public.agent_g_phone_otp_challenges IS
  'Service-role-only, one-time phone ownership challenges. code_hash is never the SMS code itself.';
