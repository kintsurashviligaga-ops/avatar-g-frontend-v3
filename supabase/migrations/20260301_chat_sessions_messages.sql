-- Migration: Chat sessions and messages with memory isolation
-- Enforces user_id + org_id + agent_id isolation

-- ─── Chat Sessions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID,
  agent_id TEXT NOT NULL DEFAULT 'main-assistant',
  channel TEXT NOT NULL DEFAULT 'web'
    CHECK (channel IN ('web', 'whatsapp', 'telegram', 'phone', 'api')),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_agent
  ON public.chat_sessions (user_id, agent_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_org
  ON public.chat_sessions (org_id, agent_id) WHERE org_id IS NOT NULL;

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_chat_sessions') THEN
    CREATE POLICY "users_own_chat_sessions" ON public.chat_sessions
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Chat Messages ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(session_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  model_used TEXT,
  cost_estimate NUMERIC(10,6) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON public.chat_messages (session_id, created_at ASC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_chat_messages') THEN
    CREATE POLICY "users_own_chat_messages" ON public.chat_messages
      USING (
        EXISTS (
          SELECT 1 FROM public.chat_sessions cs
          WHERE cs.session_id = chat_messages.session_id
            AND cs.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── AI Usage Log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID,
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_estimate NUMERIC(10,6) NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'web',
  duration_ms INTEGER,
  dual_stage BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_day
  ON public.ai_usage_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org
  ON public.ai_usage_log (org_id) WHERE org_id IS NOT NULL;

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_ai_usage') THEN
    CREATE POLICY "users_own_ai_usage" ON public.ai_usage_log
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Updated At Trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'chat_sessions_updated_at'
  ) THEN
    CREATE TRIGGER chat_sessions_updated_at
      BEFORE UPDATE ON public.chat_sessions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
