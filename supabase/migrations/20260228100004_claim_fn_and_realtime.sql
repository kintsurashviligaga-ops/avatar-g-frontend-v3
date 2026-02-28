-- Migration: claim_next_job function + enhanced agent_definitions
-- Atomic job claim using FOR UPDATE SKIP LOCKED

-- claim_next_job: Atomically claims the next job matching worker's supported agents
CREATE OR REPLACE FUNCTION public.claim_next_job(
  p_worker_id text,
  p_agent_ids text[]
)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job public.jobs;
BEGIN
  SELECT * INTO v_job
  FROM public.jobs
  WHERE status = 'queued'
    AND agent_id = ANY(p_agent_ids)
    AND (next_retry_at IS NULL OR next_retry_at <= now())
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.jobs
  SET
    status = 'claimed',
    worker_id = p_worker_id,
    claimed_at = now(),
    updated_at = now()
  WHERE id = v_job.id;

  -- Return the updated row
  SELECT * INTO v_job FROM public.jobs WHERE id = v_job.id;
  RETURN v_job;
END;
$$;

-- Enhance existing agent_definitions with missing columns from spec
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS agent_type public.agent_type;
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS worker_type text DEFAULT 'cpu' CHECK (worker_type IN ('cpu','gpu','hybrid'));
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS timeout_seconds integer DEFAULT 300;
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS max_attempts smallint DEFAULT 3;

-- Backfill agent_type from text 'type' column
UPDATE public.agent_definitions SET agent_type = 'director'::public.agent_type WHERE type = 'director' AND agent_type IS NULL;
UPDATE public.agent_definitions SET agent_type = 'specialist'::public.agent_type WHERE type = 'specialist' AND agent_type IS NULL;
UPDATE public.agent_definitions SET agent_type = 'integration'::public.agent_type WHERE type = 'integration' AND agent_type IS NULL;

-- Set worker_type and timeout for each agent
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 60 WHERE id = 'agent-g';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 600 WHERE id = 'avatar-agent';
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 120 WHERE id = 'workflow-agent';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 900 WHERE id = 'video-agent';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 600 WHERE id = 'media-agent';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 300 WHERE id = 'music-agent';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 180 WHERE id = 'photo-agent';
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 120 WHERE id = 'social-agent';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 180 WHERE id = 'visual-intel-agent';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 180 WHERE id = 'image-agent';
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 120 WHERE id = 'text-agent';
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 60 WHERE id = 'prompt-agent';
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 120 WHERE id = 'shop-agent';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 600 WHERE id = 'creative-engine-agent';
UPDATE public.agent_definitions SET worker_type = 'gpu', timeout_seconds = 1200 WHERE id = 'editing-agent';
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 30 WHERE id = 'telegram-agent';
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 30 WHERE id = 'whatsapp-agent';
UPDATE public.agent_definitions SET worker_type = 'cpu', timeout_seconds = 60 WHERE id = 'call-agent';

-- Enable Realtime on jobs and avatar_assets tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.avatar_assets;
