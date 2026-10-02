-- 20261002f_error_logs_service_only.sql — the client/server error log that app/api/log-error has been writing to a
-- table nobody ever created.
--
-- ⚠️ supabase/migrations/20260226_create_error_logs.sql was never applied to production. Every POST /api/log-error
-- insert (the app error boundaries, Live-voice failures) therefore failed with "Could not find the table
-- 'public.error_logs' in the schema cache", and client reports survived only as Vercel log lines.
--
-- ⚠️ THAT OLD FILE MUST NOT BE APPLIED AS WRITTEN. Its two policies ("… insert error logs" `with check (true)` and
-- "… select error logs" `using (true)`) are not limited to the service role, so they would let anyone holding the
-- public anon key READ every logged route, message, user id and stack trace — and write junk rows. (It predates the
-- P0 rules of 20260929a; lib/security/dbExposure.test.ts polices only the files from that one on.)
--
-- This file creates the same table and leaves it CLOSED: RLS on and NO policy (with RLS enabled and no policy, anon and
-- authenticated are denied outright), every grant taken from them, and service_role — the only caller, via
-- createServiceRoleClient in app/api/log-error — keeps select + insert. Nothing in the app reads the table; the owner
-- reads it from the Supabase dashboard.
--
-- Idempotent, and safe to run before OR after the old file: it drops that file's two permissive policies if they exist.

begin;

create table if not exists public.error_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  route       text,
  message     text not null,
  code        text,
  details     jsonb,
  user_id     uuid,
  request_id  text,
  severity    text,
  meta        jsonb
);

create index if not exists idx_error_logs_created_at on public.error_logs (created_at);
create index if not exists idx_error_logs_route      on public.error_logs (route);
create index if not exists idx_error_logs_severity   on public.error_logs (severity);

alter table public.error_logs enable row level security;

drop policy if exists "Service role can insert error logs" on public.error_logs;
drop policy if exists "Service role can select error logs" on public.error_logs;

revoke all on public.error_logs from public, anon, authenticated;
grant select, insert on public.error_logs to service_role;

commit;
