-- Migration: Projects, versions, conversations, messages
-- Core collaboration and version tracking for the service layer.

-- ─── Projects ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id text NOT NULL,
  title text NOT NULL,
  active_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user
  ON public.projects (user_id, service_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'projects_updated_at'
  ) THEN
    CREATE TRIGGER projects_updated_at
      BEFORE UPDATE ON public.projects
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_projects') THEN
    CREATE POLICY "users_own_projects" ON public.projects
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Project Versions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  intake jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','running','done','failed')),
  root_job_id uuid NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  qa_score smallint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_pv_project
  ON public.project_versions (project_id, version DESC);

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_versions') THEN
    CREATE POLICY "users_own_versions" ON public.project_versions FOR SELECT
      USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_insert_versions') THEN
    CREATE POLICY "users_insert_versions" ON public.project_versions FOR INSERT
      WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ─── Conversations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_user
  ON public.conversations (user_id, agent_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'conversations_updated_at'
  ) THEN
    CREATE TRIGGER conversations_updated_at
      BEFORE UPDATE ON public.conversations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_conversations') THEN
    CREATE POLICY "users_own_conversations" ON public.conversations
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Messages ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv
  ON public.messages (conversation_id, created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_messages') THEN
    CREATE POLICY "users_read_own_messages" ON public.messages FOR SELECT
      USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_insert_messages') THEN
    CREATE POLICY "users_insert_messages" ON public.messages FOR INSERT
      WITH CHECK (conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()));
  END IF;
END $$;
