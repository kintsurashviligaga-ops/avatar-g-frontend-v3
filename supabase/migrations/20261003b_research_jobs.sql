-- 20261003b_research_jobs.sql — Deep Research (background agent runs) and the Connectors "local files" context.
--
-- PREPARED, NOT APPLIED. Until the owner applies it the feature degrades by itself: GET /api/research/capabilities
-- answers { available: false } (a schema probe, lib/research/capabilities.ts) and the composer shows Deep Research as
-- "opening soon"; no route writes anywhere.
--
-- `research_jobs` is ONE paid run of Google's Deep Research agent (Interactions API, background mode) and its billing
-- state, written ONLY by service_role — the owner may READ their own rows, nobody may write them (the same rule as
-- `studio_jobs`, 20260929b, and for the same reason: the row carries the ledger ref, the refund state and the report, and
-- a money decision must never read a field its user can write — see 20260929a for how a row-trusted refund amount became a
-- way to mint credits). Refunds are paid from the LEDGER (lib/orchestrator/ledger.refundDebitByRef), never from this row.
--
-- Every status change is a compare-and-set in application code (UPDATE … WHERE status IN (…) RETURNING), so a user's cancel,
-- the cron sweeper (app/api/cron/research-sweep) and a read-through refresh racing on one job cannot both refund, both
-- file the notification or overwrite a finished report. No SECURITY DEFINER function is needed, so none is created.
--
-- `research_context_files` is the user's own documents from the Connectors view: the TEXT extracted by
-- /api/utils/extract-text (≤ 30,000 characters each; ≤ 10 per user, enforced by the route), folded into the prompt of a run
-- the user attaches them to (lib/research/context.ts). It never holds the original bytes and nothing from Google Drive: that
-- connector is not wired (lib/connectors/registry.ts says so).
--
-- Additive only: two new tables, one trigger function, their indexes and policies. Nothing existing is altered.
-- After applying: `node scripts/check-db-exposure.mjs`.

begin;

-- ─── research_jobs ───────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.research_jobs (
  id                      uuid primary key,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  -- Idempotency key from the browser: a replay returns the same job instead of charging again.
  client_request_id       text check (client_request_id is null or char_length(client_request_id) between 1 and 100),
  status                  text not null default 'reserving'
                            check (status in ('reserving', 'reserved', 'submitting', 'running', 'completed', 'failed', 'canceled')),
  prompt                  text not null check (char_length(prompt) between 1 and 4000),
  locale                  text not null default 'ka' check (locale in ('ka', 'en', 'ru')),
  -- [{ id, name, chars }] — metadata only; the text stays in research_context_files.
  context_files           jsonb not null default '[]'::jsonb
                            check (jsonb_typeof(context_files) = 'array' and octet_length(context_files::text) <= 8192),
  context_chars           integer not null default 0 check (context_chars between 0 and 60000),
  agent                   text not null check (char_length(agent) between 3 and 80),
  charge_credits          integer not null check (charge_credits > 0),
  charge_ref              text not null unique,
  -- false once the job is known to have cost nothing (it failed before the debit): the daily caps count `counted` rows.
  counted                 boolean not null default true,
  refund_state            text check (refund_state in ('pending', 'done', 'nothing_to_refund')),
  refunded_credits        integer not null default 0 check (refunded_credits >= 0),
  provider_interaction_id text unique,
  provider_started_at     timestamptz,
  progress                jsonb not null default '{}'::jsonb check (octet_length(progress::text) <= 4096),
  report_md               text check (report_md is null or char_length(report_md) <= 450000),
  -- Denormalised so the LIST never reads the report or the sources.
  report_chars            integer not null default 0 check (report_chars >= 0),
  sources                 jsonb not null default '[]'::jsonb
                            check (jsonb_typeof(sources) = 'array' and octet_length(sources::text) <= 65536),
  sources_count           integer not null default 0 check (sources_count >= 0),
  usage                   jsonb not null default '{}'::jsonb check (octet_length(usage::text) <= 2048),
  incomplete              boolean not null default false,
  title                   text check (title is null or char_length(title) <= 200),
  error_code              text check (error_code is null or char_length(error_code) <= 40),
  -- Internal diagnostics (key-redacted, bounded) — never sent to a browser.
  error_detail            text check (error_detail is null or char_length(error_detail) <= 600),
  cancel_requested        boolean not null default false,
  poll_failures           integer not null default 0 check (poll_failures >= 0),
  -- The compare-and-set that spaces provider polls (the epoch until the first poll).
  last_polled_at          timestamptz not null default 'epoch',
  next_poll_at            timestamptz not null default now(),
  notified_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  reserved_at             timestamptz,
  completed_at            timestamptz,
  deadline_at             timestamptz not null,
  check (refunded_credits <= charge_credits),
  -- A finished job always has its report: the status and the report are written in ONE statement.
  check (status <> 'completed' or report_md is not null)
);

create unique index if not exists research_jobs_user_request_uniq
  on public.research_jobs (user_id, client_request_id) where client_request_id is not null;
create index if not exists research_jobs_user_created_idx on public.research_jobs (user_id, created_at desc);
create index if not exists research_jobs_active_due_idx on public.research_jobs (status, next_poll_at)
  where status in ('reserving', 'reserved', 'submitting', 'running');
create index if not exists research_jobs_active_updated_idx on public.research_jobs (status, updated_at)
  where status in ('reserving', 'reserved', 'submitting', 'running');
create index if not exists research_jobs_counted_day_idx on public.research_jobs (created_at) where counted;
create index if not exists research_jobs_counted_user_day_idx on public.research_jobs (user_id, created_at) where counted;
create index if not exists research_jobs_refund_pending_idx on public.research_jobs (updated_at) where refund_state = 'pending';

-- updated_at is bumped by the database, so the sweeper's "stuck since" reads can trust it. A plain trigger function (not
-- SECURITY DEFINER); EXECUTE is revoked from the client roles all the same.
create or replace function public.research_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.research_touch_updated_at() from public, anon, authenticated;

drop trigger if exists research_jobs_touch_updated_at on public.research_jobs;
create trigger research_jobs_touch_updated_at
  before update on public.research_jobs
  for each row execute function public.research_touch_updated_at();

-- RLS: the owner reads their own rows; nobody but service_role writes (service_role bypasses RLS).
alter table public.research_jobs enable row level security;

drop policy if exists research_jobs_owner_select on public.research_jobs;
create policy research_jobs_owner_select on public.research_jobs
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.research_jobs from anon;
revoke insert, update, delete, truncate on public.research_jobs from authenticated;

-- ─── research_context_files ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.research_context_files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  mime_type     text check (mime_type is null or char_length(mime_type) <= 120),
  bytes         integer not null default 0 check (bytes >= 0),
  -- The text extracted by /api/utils/extract-text. Never the original bytes.
  text_content  text not null check (char_length(text_content) between 1 and 30000),
  chars         integer not null check (chars between 1 and 30000),
  truncated     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists research_context_files_user_idx on public.research_context_files (user_id, created_at desc);

alter table public.research_context_files enable row level security;

drop policy if exists research_context_files_owner_select on public.research_context_files;
create policy research_context_files_owner_select on public.research_context_files
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.research_context_files from anon;
revoke insert, update, delete, truncate on public.research_context_files from authenticated;

-- ─── VERIFY — raise (rolling back the whole file) if a guarantee did not take ────────────────────────────────
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.research_jobs'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.research_context_files'::regclass) then
    raise exception 'VERIFY FAILED — row level security is off on a research table';
  end if;
  if has_table_privilege('anon', 'public.research_jobs', 'SELECT')
     or has_table_privilege('anon', 'public.research_context_files', 'SELECT') then
    raise exception 'VERIFY FAILED — anon can read a research table';
  end if;
  if has_table_privilege('authenticated', 'public.research_jobs', 'INSERT')
     or has_table_privilege('authenticated', 'public.research_jobs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.research_jobs', 'DELETE')
     or has_table_privilege('authenticated', 'public.research_context_files', 'INSERT')
     or has_table_privilege('authenticated', 'public.research_context_files', 'UPDATE')
     or has_table_privilege('authenticated', 'public.research_context_files', 'DELETE') then
    raise exception 'VERIFY FAILED — a client role can write a research table (money state would be user-writable)';
  end if;
  if not has_table_privilege('authenticated', 'public.research_jobs', 'SELECT') then
    raise exception 'VERIFY FAILED — the owner cannot read their own research jobs';
  end if;
  if has_function_privilege('anon', 'public.research_touch_updated_at()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.research_touch_updated_at()', 'EXECUTE') then
    raise exception 'VERIFY FAILED — research_touch_updated_at is executable by a client role';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename in ('research_jobs', 'research_context_files')
       and (qual is null or btrim(qual) = 'true')
  ) then
    raise exception 'VERIFY FAILED — a research policy lets every row through (an always-true qualifier)';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'research_jobs' and indexname = 'research_jobs_user_request_uniq'
  ) then
    raise exception 'VERIFY FAILED — the idempotency index research_jobs_user_request_uniq is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.research_jobs'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%running%' and pg_get_constraintdef(oid) like '%reserving%'
  ) then
    raise exception 'VERIFY FAILED — the research_jobs status check is missing';
  end if;
  raise notice 'VERIFY OK — research_jobs and research_context_files: owner-select only, client writes revoked, idempotency index present.';
end
$$;

commit;
