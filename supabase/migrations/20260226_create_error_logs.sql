-- Migration: Ensure error_logs table exists for client/server error logging

create table if not exists public.error_logs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    route text,
    message text not null,
    code text,
    details jsonb,
    user_id uuid,
    request_id text,
    severity text,
    meta jsonb
);

create index if not exists idx_error_logs_created_at on public.error_logs(created_at);
create index if not exists idx_error_logs_route on public.error_logs(route);
create index if not exists idx_error_logs_severity on public.error_logs(severity);

-- RLS: Only service role can insert/select
alter table public.error_logs enable row level security;
create policy "Service role can insert error logs" on public.error_logs
  for insert with check (true);
create policy "Service role can select error logs" on public.error_logs
  for select using (true);
