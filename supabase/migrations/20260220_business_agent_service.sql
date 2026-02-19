CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.business_agent_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  locale TEXT NOT NULL,
  business_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  goals TEXT[] NOT NULL DEFAULT '{}',
  mode TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_pack JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT business_agent_projects_locale_check CHECK (locale IN ('ka', 'en'))
);

CREATE TABLE IF NOT EXISTS public.business_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.business_agent_projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT business_agent_runs_status_check CHECK (status IN ('queued', 'running', 'done', 'error'))
);

CREATE INDEX IF NOT EXISTS business_agent_projects_owner_updated_idx
  ON public.business_agent_projects(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS business_agent_runs_project_created_idx
  ON public.business_agent_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS business_agent_runs_owner_created_idx
  ON public.business_agent_runs(owner_id, created_at DESC);

DROP TRIGGER IF EXISTS business_agent_projects_updated_at_trigger ON public.business_agent_projects;
CREATE TRIGGER business_agent_projects_updated_at_trigger
  BEFORE UPDATE ON public.business_agent_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.business_agent_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_agent_projects_owner_select ON public.business_agent_projects;
CREATE POLICY business_agent_projects_owner_select
  ON public.business_agent_projects
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS business_agent_projects_owner_insert ON public.business_agent_projects;
CREATE POLICY business_agent_projects_owner_insert
  ON public.business_agent_projects
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS business_agent_projects_owner_update ON public.business_agent_projects;
CREATE POLICY business_agent_projects_owner_update
  ON public.business_agent_projects
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS business_agent_projects_owner_delete ON public.business_agent_projects;
CREATE POLICY business_agent_projects_owner_delete
  ON public.business_agent_projects
  FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS business_agent_runs_owner_select ON public.business_agent_runs;
CREATE POLICY business_agent_runs_owner_select
  ON public.business_agent_runs
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS business_agent_runs_owner_insert ON public.business_agent_runs;
CREATE POLICY business_agent_runs_owner_insert
  ON public.business_agent_runs
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS business_agent_runs_owner_update ON public.business_agent_runs;
CREATE POLICY business_agent_runs_owner_update
  ON public.business_agent_runs
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS business_agent_runs_owner_delete ON public.business_agent_runs;
CREATE POLICY business_agent_runs_owner_delete
  ON public.business_agent_runs
  FOR DELETE
  USING (auth.uid() = owner_id);
