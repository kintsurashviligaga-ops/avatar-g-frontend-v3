-- Avatar G — analytics_events (PHASE 4 Task 1)
-- ============================================
-- A lightweight first-party event log (signups, generations, payments) for the
-- admin dashboard. Additive + idempotent. Inserts come from the service role
-- (/api/analytics/track); reads are service-role only (admin). Anonymous events
-- are allowed (user_id nullable).
--
-- Apply with `supabase db push` or the Supabase dashboard SQL editor.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  TEXT NOT NULL,
  props       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
  ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx
  ON public.analytics_events (created_at DESC);

-- RLS on, no public policies → only the service role (server) can read/write.
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.analytics_events IS 'First-party analytics event log (signup/generation/payment) — service-role access only.';
