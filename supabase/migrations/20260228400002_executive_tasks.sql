-- supabase/migrations/20260228400002_executive_tasks.sql
-- Executive task log: tracks every executive orchestrator invocation

create table if not exists public.executive_task_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_channel text not null default 'dashboard'
    check (input_channel in ('phone','sms','email','dashboard')),
  input_text text,
  phone_e164 text,
  detected_intent text,
  workflow jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{"summaryText":"","artifacts":[],"deliveries":[]}'::jsonb,
  credits_used integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_executive_tasks_user
  on public.executive_task_logs (user_id, created_at desc);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'executive_task_logs_updated_at'
  ) THEN
    CREATE TRIGGER executive_task_logs_updated_at
      BEFORE UPDATE ON public.executive_task_logs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

alter table public.executive_task_logs enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_executive_tasks'
  ) THEN
    CREATE POLICY "users_read_own_executive_tasks" ON public.executive_task_logs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
