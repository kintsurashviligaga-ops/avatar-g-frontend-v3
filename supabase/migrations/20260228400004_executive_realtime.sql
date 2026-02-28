-- supabase/migrations/20260228400004_executive_realtime.sql
-- Enable Supabase Realtime for executive_task_logs and user_credits

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'executive_task_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.executive_task_logs;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_credits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_credits;
  END IF;
END $$;
