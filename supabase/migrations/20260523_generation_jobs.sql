-- Avatar G — generation_jobs: durable swarm-pipeline state for resumable produce
-- Created: 2026-05-23  (#5 Job Persistence & Resumable Pipelines)
--
-- Every /api/orchestrator/*produce SSE run persists its lifecycle here so a
-- browser reload (or a cross-device handoff) can recover the timeline: the row
-- id IS the SSE pipelineId, status walks pending→processing→completed|failed,
-- and the final media payload is captured verbatim in `result` for re-render.
-- RLS scopes every row to its owner; service-role writes from the routes bypass
-- RLS, while the recovery API reads through the user session (owner-only).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Idempotent updated_at trigger fn (already present project-wide; redefined so
-- this migration is self-contained / re-runnable in isolation).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  -- id == the SSE pipelineId (e.g. 'prod_1700000000000_ab12cd') so the client
  -- can correlate a recovered row back to its event channel.
  id            TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_type  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  current_stage TEXT,
  pct           INTEGER NOT NULL DEFAULT 0,
  params        JSONB NOT NULL DEFAULT '{}'::jsonb,
  result        JSONB,
  signed_url    TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT generation_jobs_service_check CHECK (
    service_type IN ('film', 'avatar', 'interior', 'image', 'music', 'voice')
  ),
  CONSTRAINT generation_jobs_status_check CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  CONSTRAINT generation_jobs_pct_check CHECK (pct >= 0 AND pct <= 100)
);

-- Recovery query: a user's most-recent jobs, newest first.
CREATE INDEX IF NOT EXISTS generation_jobs_user_updated_idx
  ON public.generation_jobs(user_id, updated_at DESC);
-- Hot path: a user's still-running jobs (the reload-recovery candidates).
CREATE INDEX IF NOT EXISTS generation_jobs_user_active_idx
  ON public.generation_jobs(user_id, updated_at DESC)
  WHERE status IN ('pending', 'processing');

DROP TRIGGER IF EXISTS generation_jobs_updated_at_trigger ON public.generation_jobs;
CREATE TRIGGER generation_jobs_updated_at_trigger
  BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: owner-only ──────────────────────────────────────────────────────────
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generation_jobs_owner_select ON public.generation_jobs;
CREATE POLICY generation_jobs_owner_select
  ON public.generation_jobs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS generation_jobs_owner_insert ON public.generation_jobs;
CREATE POLICY generation_jobs_owner_insert
  ON public.generation_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS generation_jobs_owner_update ON public.generation_jobs;
CREATE POLICY generation_jobs_owner_update
  ON public.generation_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS generation_jobs_owner_delete ON public.generation_jobs;
CREATE POLICY generation_jobs_owner_delete
  ON public.generation_jobs FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.generation_jobs IS
  'Durable per-run state for the 6 swarm produce pipelines; enables browser-reload recovery. Row id == SSE pipelineId.';
