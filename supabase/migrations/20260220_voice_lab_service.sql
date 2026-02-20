CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  gender_hint TEXT,
  provider TEXT NOT NULL DEFAULT 'mock-provider',
  provider_voice_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voice_profiles_language_check CHECK (language IN ('ka', 'en'))
);

CREATE TABLE IF NOT EXISTS public.voice_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voice_projects_status_check CHECK (status IN ('draft', 'active'))
);

CREATE TABLE IF NOT EXISTS public.voice_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.voice_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  storage_path TEXT,
  url TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voice_assets_kind_check CHECK (kind IN ('recording', 'upload', 'generated'))
);

CREATE TABLE IF NOT EXISTS public.voice_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.voice_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voice_jobs_type_check CHECK (type IN ('cleanup', 'clone', 'generate')),
  CONSTRAINT voice_jobs_status_check CHECK (status IN ('queued', 'processing', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS voice_profiles_owner_created_idx ON public.voice_profiles(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_projects_owner_updated_idx ON public.voice_projects(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS voice_assets_owner_project_created_idx ON public.voice_assets(owner_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_jobs_owner_project_created_idx ON public.voice_jobs(owner_id, project_id, created_at DESC);

DROP TRIGGER IF EXISTS voice_projects_updated_at_trigger ON public.voice_projects;
CREATE TRIGGER voice_projects_updated_at_trigger
  BEFORE UPDATE ON public.voice_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS voice_jobs_updated_at_trigger ON public.voice_jobs;
CREATE TRIGGER voice_jobs_updated_at_trigger
  BEFORE UPDATE ON public.voice_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_profiles_owner_select ON public.voice_profiles;
CREATE POLICY voice_profiles_owner_select ON public.voice_profiles FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_profiles_owner_insert ON public.voice_profiles;
CREATE POLICY voice_profiles_owner_insert ON public.voice_profiles FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_profiles_owner_update ON public.voice_profiles;
CREATE POLICY voice_profiles_owner_update ON public.voice_profiles FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_profiles_owner_delete ON public.voice_profiles;
CREATE POLICY voice_profiles_owner_delete ON public.voice_profiles FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS voice_projects_owner_select ON public.voice_projects;
CREATE POLICY voice_projects_owner_select ON public.voice_projects FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_projects_owner_insert ON public.voice_projects;
CREATE POLICY voice_projects_owner_insert ON public.voice_projects FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_projects_owner_update ON public.voice_projects;
CREATE POLICY voice_projects_owner_update ON public.voice_projects FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_projects_owner_delete ON public.voice_projects;
CREATE POLICY voice_projects_owner_delete ON public.voice_projects FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS voice_assets_owner_select ON public.voice_assets;
CREATE POLICY voice_assets_owner_select ON public.voice_assets FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_assets_owner_insert ON public.voice_assets;
CREATE POLICY voice_assets_owner_insert ON public.voice_assets FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_assets_owner_update ON public.voice_assets;
CREATE POLICY voice_assets_owner_update ON public.voice_assets FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_assets_owner_delete ON public.voice_assets;
CREATE POLICY voice_assets_owner_delete ON public.voice_assets FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS voice_jobs_owner_select ON public.voice_jobs;
CREATE POLICY voice_jobs_owner_select ON public.voice_jobs FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_jobs_owner_insert ON public.voice_jobs;
CREATE POLICY voice_jobs_owner_insert ON public.voice_jobs FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_jobs_owner_update ON public.voice_jobs;
CREATE POLICY voice_jobs_owner_update ON public.voice_jobs FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS voice_jobs_owner_delete ON public.voice_jobs;
CREATE POLICY voice_jobs_owner_delete ON public.voice_jobs FOR DELETE USING (auth.uid() = owner_id);
