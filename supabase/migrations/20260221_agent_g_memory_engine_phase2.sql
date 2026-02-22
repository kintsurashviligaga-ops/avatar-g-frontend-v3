CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.agent_g_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.agent_g_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_platform TEXT NOT NULL,
  user_id TEXT NOT NULL,
  memory JSONB NOT NULL DEFAULT '{}'::jsonb,
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_g_memory'
      AND column_name = 'channel'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_g_memory'
      AND column_name = 'user_platform'
  ) THEN
    EXECUTE 'ALTER TABLE public.agent_g_memory RENAME COLUMN channel TO user_platform';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_g_memory'
      AND column_name = 'style_profile'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_g_memory'
      AND column_name = 'style'
  ) THEN
    EXECUTE 'ALTER TABLE public.agent_g_memory RENAME COLUMN style_profile TO style';
  END IF;
END;
$$;

ALTER TABLE public.agent_g_memory
  ADD COLUMN IF NOT EXISTS memory JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS style JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_g_memory'
      AND column_name = 'user_platform'
  ) THEN
    EXECUTE 'ALTER TABLE public.agent_g_memory ADD COLUMN user_platform TEXT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_g_memory'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.agent_g_memory ADD COLUMN user_id TEXT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_g_memory'
      AND column_name = 'locale'
  ) THEN
    EXECUTE $sql$
      UPDATE public.agent_g_memory
      SET memory = jsonb_set(memory, '{preferredLanguage}', to_jsonb(locale), true)
      WHERE locale IS NOT NULL
        AND COALESCE(memory->>'preferredLanguage', '') = ''
    $sql$;
  END IF;
END;
$$;

UPDATE public.agent_g_memory
SET user_platform = COALESCE(NULLIF(user_platform, ''), 'telegram')
WHERE user_platform IS NULL OR user_platform = '';

ALTER TABLE public.agent_g_memory
  ALTER COLUMN user_platform SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN memory SET DEFAULT '{}'::jsonb,
  ALTER COLUMN style SET DEFAULT '{}'::jsonb,
  ALTER COLUMN last_seen_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

DROP INDEX IF EXISTS public.agent_g_memory_user_channel_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS agent_g_memory_user_platform_user_id_uidx
  ON public.agent_g_memory (user_platform, user_id);

DROP TRIGGER IF EXISTS agent_g_memory_updated_at_trigger ON public.agent_g_memory;
CREATE TRIGGER agent_g_memory_updated_at_trigger
  BEFORE UPDATE ON public.agent_g_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_g_set_updated_at();

CREATE TABLE IF NOT EXISTS public.agent_g_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_platform TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_g_events_platform_user_created_idx
  ON public.agent_g_events (user_platform, user_id, created_at DESC);
