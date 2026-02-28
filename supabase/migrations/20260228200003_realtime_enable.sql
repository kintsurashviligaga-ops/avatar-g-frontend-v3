-- Migration: Enable Realtime for key tables
-- These tables get real-time subscriptions through Supabase postgres_changes.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.execution_trace;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_versions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
