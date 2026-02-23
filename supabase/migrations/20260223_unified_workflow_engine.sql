-- Unified Workflow Engine
-- Created: 2026-02-23

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  current_step TEXT,
  result JSONB,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_definitions_status_check CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  current_step TEXT,
  result JSONB,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  trigger_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT workflow_runs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.workflow_step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  service_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB,
  diagnostics JSONB,
  error_message TEXT,
  cost_credits INTEGER NOT NULL DEFAULT 0,
  execution_ms INTEGER,
  service_job_id UUID REFERENCES public.service_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT workflow_step_runs_status_check CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT workflow_step_runs_attempts_check CHECK (attempt_count >= 0 AND max_attempts >= 1),
  CONSTRAINT workflow_step_runs_unique_step UNIQUE (workflow_run_id, step_id)
);

CREATE INDEX IF NOT EXISTS workflow_definitions_user_created_idx
  ON public.workflow_definitions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_user_created_idx
  ON public.workflow_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_status_updated_idx
  ON public.workflow_runs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS workflow_step_runs_run_idx
  ON public.workflow_step_runs(workflow_run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS workflow_step_runs_service_job_idx
  ON public.workflow_step_runs(service_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_user_idempotency_idx
  ON public.workflow_runs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP TRIGGER IF EXISTS workflow_definitions_updated_at_trigger ON public.workflow_definitions;
CREATE TRIGGER workflow_definitions_updated_at_trigger
  BEFORE UPDATE ON public.workflow_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS workflow_runs_updated_at_trigger ON public.workflow_runs;
CREATE TRIGGER workflow_runs_updated_at_trigger
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS workflow_step_runs_updated_at_trigger ON public.workflow_step_runs;
CREATE TRIGGER workflow_step_runs_updated_at_trigger
  BEFORE UPDATE ON public.workflow_step_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_step_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_definitions_owner_select ON public.workflow_definitions;
CREATE POLICY workflow_definitions_owner_select
  ON public.workflow_definitions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_definitions_owner_insert ON public.workflow_definitions;
CREATE POLICY workflow_definitions_owner_insert
  ON public.workflow_definitions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_definitions_owner_update ON public.workflow_definitions;
CREATE POLICY workflow_definitions_owner_update
  ON public.workflow_definitions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_definitions_owner_delete ON public.workflow_definitions;
CREATE POLICY workflow_definitions_owner_delete
  ON public.workflow_definitions
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_runs_owner_select ON public.workflow_runs;
CREATE POLICY workflow_runs_owner_select
  ON public.workflow_runs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_runs_owner_insert ON public.workflow_runs;
CREATE POLICY workflow_runs_owner_insert
  ON public.workflow_runs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_runs_owner_update ON public.workflow_runs;
CREATE POLICY workflow_runs_owner_update
  ON public.workflow_runs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_runs_owner_delete ON public.workflow_runs;
CREATE POLICY workflow_runs_owner_delete
  ON public.workflow_runs
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_step_runs_owner_select ON public.workflow_step_runs;
CREATE POLICY workflow_step_runs_owner_select
  ON public.workflow_step_runs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_step_runs_owner_insert ON public.workflow_step_runs;
CREATE POLICY workflow_step_runs_owner_insert
  ON public.workflow_step_runs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_step_runs_owner_update ON public.workflow_step_runs;
CREATE POLICY workflow_step_runs_owner_update
  ON public.workflow_step_runs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_step_runs_owner_delete ON public.workflow_step_runs;
CREATE POLICY workflow_step_runs_owner_delete
  ON public.workflow_step_runs
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.workflow_definitions IS 'User-defined workflow templates (step chains, mappings, retry policy).';
COMMENT ON TABLE public.workflow_runs IS 'Workflow execution instances with status, logs, and final result.';
COMMENT ON TABLE public.workflow_step_runs IS 'Per-step execution state and linkage to queued service jobs.';
