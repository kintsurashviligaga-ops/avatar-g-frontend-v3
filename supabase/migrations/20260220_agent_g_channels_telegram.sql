CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_g_channels'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_g_channels' AND column_name = 'status'
    ) THEN
      ALTER TABLE public.agent_g_channels
        ADD COLUMN status TEXT NOT NULL DEFAULT 'disconnected';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_g_channels' AND column_name = 'external_id'
    ) THEN
      ALTER TABLE public.agent_g_channels
        ADD COLUMN external_id TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_g_channels' AND column_name = 'username'
    ) THEN
      ALTER TABLE public.agent_g_channels
        ADD COLUMN username TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_g_channels' AND column_name = 'meta'
    ) THEN
      ALTER TABLE public.agent_g_channels
        ADD COLUMN meta JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_g_channels' AND column_name = 'config'
    ) THEN
      EXECUTE 'UPDATE public.agent_g_channels SET meta = COALESCE(meta, ''{}''::jsonb) || COALESCE(config, ''{}''::jsonb)';
    END IF;
  ELSE
    CREATE TABLE public.agent_g_channels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disconnected',
      external_id TEXT,
      username TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

ALTER TABLE public.agent_g_channels
  DROP CONSTRAINT IF EXISTS agent_g_channels_type_check;
ALTER TABLE public.agent_g_channels
  ADD CONSTRAINT agent_g_channels_type_check CHECK (type IN ('telegram', 'whatsapp', 'web'));

ALTER TABLE public.agent_g_channels
  DROP CONSTRAINT IF EXISTS agent_g_channels_status_check;
ALTER TABLE public.agent_g_channels
  ADD CONSTRAINT agent_g_channels_status_check CHECK (status IN ('connected', 'disconnected'));

CREATE UNIQUE INDEX IF NOT EXISTS agent_g_channels_type_external_id_uidx
  ON public.agent_g_channels(type, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_g_channels_user_type_idx ON public.agent_g_channels(user_id, type);

DROP TRIGGER IF EXISTS agent_g_channels_updated_at_trigger ON public.agent_g_channels;
CREATE TRIGGER agent_g_channels_updated_at_trigger
  BEFORE UPDATE ON public.agent_g_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.agent_g_channel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_g_channel_events_user_idx ON public.agent_g_channel_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_g_channel_events_type_idx ON public.agent_g_channel_events(type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_g_connect_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_g_connect_codes_user_idx ON public.agent_g_connect_codes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_g_connect_codes_exp_idx ON public.agent_g_connect_codes(expires_at);

ALTER TABLE public.agent_g_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_g_channel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_g_connect_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_g_channels_owner_crud ON public.agent_g_channels;
CREATE POLICY agent_g_channels_owner_crud
  ON public.agent_g_channels FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS agent_g_channel_events_owner_select ON public.agent_g_channel_events;
CREATE POLICY agent_g_channel_events_owner_select
  ON public.agent_g_channel_events FOR SELECT
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS agent_g_connect_codes_owner_crud ON public.agent_g_connect_codes;
CREATE POLICY agent_g_connect_codes_owner_crud
  ON public.agent_g_connect_codes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
