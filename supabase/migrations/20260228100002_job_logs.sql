-- Migration: Job logs and execution trace tables
-- For structured logging and multi-step execution tracking

CREATE TABLE IF NOT EXISTS public.job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  worker_id text,
  level text NOT NULL CHECK (level IN ('debug','info','warn','error')),
  message text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_logs_job ON public.job_logs (job_id, created_at DESC);

ALTER TABLE public.job_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_job_logs"
  ON public.job_logs FOR SELECT
  USING (
    job_id IN (SELECT id FROM public.jobs WHERE user_id = auth.uid())
  );

-- Execution trace: every step Agent G dispatches
CREATE TABLE IF NOT EXISTS public.execution_trace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  step_index smallint NOT NULL,
  agent_id text NOT NULL,
  sub_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','done','failed','skipped')),
  input_snapshot jsonb,
  output_snapshot jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_trace_root ON public.execution_trace (root_job_id, step_index);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'execution_trace_updated_at'
  ) THEN
    CREATE TRIGGER execution_trace_updated_at
      BEFORE UPDATE ON public.execution_trace
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.execution_trace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_trace"
  ON public.execution_trace FOR SELECT
  USING (
    root_job_id IN (SELECT id FROM public.jobs WHERE user_id = auth.uid())
  );
