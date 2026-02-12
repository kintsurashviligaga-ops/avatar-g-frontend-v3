-- Jobs Queue V2 Enhancements
-- Adds job locking and retry metadata for worker polling

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_urls JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_locked_at ON public.jobs(locked_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status_locked_at ON public.jobs(status, locked_at);

-- Atomic job claim (worker polling)
CREATE OR REPLACE FUNCTION public.fetch_next_render_job_v2(worker_id TEXT)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT id
    FROM public.jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.jobs j
  SET
    status = 'processing',
    locked_at = NOW(),
    locked_by = worker_id,
    attempts = COALESCE(j.attempts, 0) + 1,
    started_at = COALESCE(j.started_at, NOW()),
    updated_at = NOW()
  FROM next_job
  WHERE j.id = next_job.id
  RETURNING j.*;
END;
$$;

-- Stale job recovery
CREATE OR REPLACE FUNCTION public.reset_stale_jobs_v2(stale_minutes INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  UPDATE public.jobs
  SET
    status = 'queued',
    locked_at = NULL,
    locked_by = NULL,
    updated_at = NOW()
  WHERE status = 'processing'
    AND locked_at IS NOT NULL
    AND locked_at < NOW() - (stale_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;
