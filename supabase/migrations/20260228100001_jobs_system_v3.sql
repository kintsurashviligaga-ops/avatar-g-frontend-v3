-- Migration: Enhanced jobs system v3
-- Adds job_status enum, enhanced indexes, and execution trace support

-- Job status enum (create only if not exists)
DO $$ BEGIN
  CREATE TYPE public.job_status AS ENUM (
    'queued', 'claimed', 'processing', 'completed', 'failed', 'dead'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Agent type enum
DO $$ BEGIN
  CREATE TYPE public.agent_type AS ENUM (
    'director', 'specialist', 'integration'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns to jobs table (if not already present)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS parent_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS priority smallint DEFAULT 5;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS attempt_count smallint DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS max_attempts smallint DEFAULT 3;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS worker_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS timeout_seconds integer DEFAULT 300;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Add unique constraint on idempotency_key if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_idempotency_key_unique'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_idempotency_key_unique UNIQUE (idempotency_key);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Priority check constraint
DO $$
BEGIN
  ALTER TABLE public.jobs ADD CONSTRAINT check_priority CHECK (priority BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for queue performance
CREATE INDEX IF NOT EXISTS idx_jobs_queue_claim_v3
  ON public.jobs (priority DESC, created_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_jobs_agent_status
  ON public.jobs (agent_id, status);

CREATE INDEX IF NOT EXISTS idx_jobs_retry_v3
  ON public.jobs (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_worker_claimed
  ON public.jobs (worker_id)
  WHERE status = 'claimed';

-- updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add trigger if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jobs_set_updated_at'
  ) THEN
    CREATE TRIGGER jobs_set_updated_at
      BEFORE UPDATE ON public.jobs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
