-- Avatar G - Unified Service Jobs + Outputs + Storage Policies
-- Created: 2026-02-16

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- SERVICE JOBS
-- ============================================
CREATE TABLE IF NOT EXISTS public.service_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_jobs_status_check CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT service_jobs_progress_check CHECK (progress >= 0 AND progress <= 100),
  CONSTRAINT service_jobs_attempts_check CHECK (attempt_count >= 0 AND max_attempts >= 1)
);

CREATE INDEX IF NOT EXISTS service_jobs_user_created_idx
  ON public.service_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_jobs_user_service_created_idx
  ON public.service_jobs(user_id, service_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS service_jobs_status_updated_idx
  ON public.service_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS service_jobs_processing_heartbeat_idx
  ON public.service_jobs(status, heartbeat_at)
  WHERE status = 'processing';

-- ============================================
-- SERVICE OUTPUTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.service_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_slug TEXT NOT NULL,
  job_id UUID REFERENCES public.service_jobs(id) ON DELETE SET NULL,
  output_type TEXT NOT NULL DEFAULT 'image',
  storage_path TEXT,
  external_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_outputs_type_check CHECK (output_type IN ('image', 'video', 'audio', 'text', 'file')),
  CONSTRAINT service_outputs_source_check CHECK (
    COALESCE(NULLIF(storage_path, ''), NULLIF(external_url, '')) IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS service_outputs_user_created_idx
  ON public.service_outputs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_outputs_user_service_idx
  ON public.service_outputs(user_id, service_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS service_outputs_job_idx
  ON public.service_outputs(job_id);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS service_jobs_updated_at_trigger ON public.service_jobs;
CREATE TRIGGER service_jobs_updated_at_trigger
  BEFORE UPDATE ON public.service_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS service_outputs_updated_at_trigger ON public.service_outputs;
CREATE TRIGGER service_outputs_updated_at_trigger
  BEFORE UPDATE ON public.service_outputs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.service_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_jobs_owner_select ON public.service_jobs;
CREATE POLICY service_jobs_owner_select
  ON public.service_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS service_jobs_owner_insert ON public.service_jobs;
CREATE POLICY service_jobs_owner_insert
  ON public.service_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS service_jobs_owner_update ON public.service_jobs;
CREATE POLICY service_jobs_owner_update
  ON public.service_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS service_jobs_owner_delete ON public.service_jobs;
CREATE POLICY service_jobs_owner_delete
  ON public.service_jobs
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS service_outputs_owner_select ON public.service_outputs;
CREATE POLICY service_outputs_owner_select
  ON public.service_outputs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS service_outputs_owner_insert ON public.service_outputs;
CREATE POLICY service_outputs_owner_insert
  ON public.service_outputs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS service_outputs_owner_update ON public.service_outputs;
CREATE POLICY service_outputs_owner_update
  ON public.service_outputs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS service_outputs_owner_delete ON public.service_outputs;
CREATE POLICY service_outputs_owner_delete
  ON public.service_outputs
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- STORAGE BUCKET + POLICIES
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatar-g-outputs', 'avatar-g-outputs', FALSE)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatar_g_outputs_select_own'
  ) THEN
    CREATE POLICY avatar_g_outputs_select_own
      ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'avatar-g-outputs'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatar_g_outputs_insert_own'
  ) THEN
    CREATE POLICY avatar_g_outputs_insert_own
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'avatar-g-outputs'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatar_g_outputs_update_own'
  ) THEN
    CREATE POLICY avatar_g_outputs_update_own
      ON storage.objects
      FOR UPDATE
      USING (
        bucket_id = 'avatar-g-outputs'
        AND split_part(name, '/', 1) = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'avatar-g-outputs'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatar_g_outputs_delete_own'
  ) THEN
    CREATE POLICY avatar_g_outputs_delete_own
      ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'avatar-g-outputs'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END $$;

COMMENT ON TABLE public.service_jobs IS 'Unified async jobs table for all 13 Avatar G services.';
COMMENT ON TABLE public.service_outputs IS 'Generated output registry for service jobs; links to storage or external URLs.';
