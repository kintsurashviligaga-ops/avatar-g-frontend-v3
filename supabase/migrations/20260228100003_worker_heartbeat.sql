-- Migration: Worker heartbeat table
-- Tracks worker health and availability for the job queue system

CREATE TABLE IF NOT EXISTS public.worker_heartbeat (
  worker_id text PRIMARY KEY,
  worker_type text NOT NULL CHECK (worker_type IN ('cpu','gpu')),
  agent_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle','busy','draining','offline')),
  current_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  jobs_processed integer NOT NULL DEFAULT 0,
  jobs_failed integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_last_seen ON public.worker_heartbeat (last_seen_at DESC);

-- No RLS on worker_heartbeat — service role only
-- Admin dashboard reads via service role API route
