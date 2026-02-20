CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.agent_g_user_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT,
  display_name TEXT,
  call_me_when_finished BOOLEAN NOT NULL DEFAULT FALSE,
  voice_connected BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
  quiet_hours_end TEXT NOT NULL DEFAULT '08:00',
  timezone TEXT,
  timezone_offset_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_g_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_task_id UUID REFERENCES public.agent_g_tasks(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  transcript TEXT,
  summary TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_g_calls_direction_check CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT agent_g_calls_channel_check CHECK (channel IN ('phone', 'telegram', 'web_voice')),
  CONSTRAINT agent_g_calls_status_check CHECK (status IN ('queued', 'ringing', 'active', 'ended', 'failed'))
);

CREATE INDEX IF NOT EXISTS agent_g_calls_user_started_idx ON public.agent_g_calls(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_g_calls_related_task_idx ON public.agent_g_calls(related_task_id);

DROP TRIGGER IF EXISTS agent_g_user_prefs_updated_at_trigger ON public.agent_g_user_prefs;
CREATE TRIGGER agent_g_user_prefs_updated_at_trigger
  BEFORE UPDATE ON public.agent_g_user_prefs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS agent_g_calls_updated_at_trigger ON public.agent_g_calls;
CREATE TRIGGER agent_g_calls_updated_at_trigger
  BEFORE UPDATE ON public.agent_g_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_g_user_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_g_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_g_user_prefs_owner_crud ON public.agent_g_user_prefs;
CREATE POLICY agent_g_user_prefs_owner_crud
  ON public.agent_g_user_prefs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS agent_g_calls_owner_crud ON public.agent_g_calls;
CREATE POLICY agent_g_calls_owner_crud
  ON public.agent_g_calls FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
