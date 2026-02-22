CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.agent_g_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ka',
  style_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_emotion TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_g_memory_channel_check CHECK (channel IN ('web', 'telegram')),
  CONSTRAINT agent_g_memory_locale_check CHECK (locale IN ('ka', 'en', 'ru'))
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_g_memory_user_channel_uidx
  ON public.agent_g_memory(user_id, channel);

CREATE INDEX IF NOT EXISTS agent_g_memory_user_updated_idx
  ON public.agent_g_memory(user_id, updated_at DESC);

DROP TRIGGER IF EXISTS agent_g_memory_updated_at_trigger ON public.agent_g_memory;
CREATE TRIGGER agent_g_memory_updated_at_trigger
  BEFORE UPDATE ON public.agent_g_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_g_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_g_memory_owner_select ON public.agent_g_memory;
CREATE POLICY agent_g_memory_owner_select
  ON public.agent_g_memory FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()::text
  );

DROP POLICY IF EXISTS agent_g_memory_owner_crud ON public.agent_g_memory;
CREATE POLICY agent_g_memory_owner_crud
  ON public.agent_g_memory FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()::text
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()::text
  );
