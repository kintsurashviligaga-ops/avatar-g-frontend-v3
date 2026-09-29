-- 20260929b_studio_jobs.sql — Phase 1 of the Higgsfield studio (docs/MYAVATAR_STUDIO_BRIEF.md §4).
--
-- `studio_jobs` holds one provider generation and its billing state. It is written ONLY by service_role:
-- users may read their own rows, never write them. That is the difference from `generation_jobs`, which is
-- owner-writable (the film pipeline relies on it) and therefore must never carry a number that moves money —
-- see 20260929a for how a row-trusted refund amount became a way to mint credits. A finished job is also
-- filed into generation_jobs (service role) so the existing Library lists it unchanged.
--
-- `provider_webhook_events` makes webhook handling idempotent: Higgsfield may deliver the same terminal
-- event more than once, so (provider, request_id, status) is the primary key and a duplicate insert is the
-- signal to acknowledge without re-applying.
--
-- Additive only: two new tables, one trigger on the new table. Nothing existing is altered.

begin;

create table if not exists public.studio_jobs (
  id                        uuid primary key,
  user_id                   uuid not null references auth.users(id) on delete cascade,
  service                   text not null check (service in ('image', 'video', 'avatar', 'motion', 'remix')),
  model_id                  text not null,
  provider                  text not null default 'higgsfield',
  provider_endpoint         text not null,
  provider_request_id       text unique,
  status                    text not null default 'reserving' check (status in (
                              'reserving', 'reserved', 'pending', 'submitting', 'submit_unknown',
                              'queued', 'in_progress', 'finalizing', 'completed', 'failed', 'nsfw', 'canceled')),
  input                     jsonb not null default '{}'::jsonb,
  prompt_original           text,
  estimate_provider_credits numeric,
  estimate_usd              numeric,
  estimate_gel              numeric not null check (estimate_gel >= 0),
  charge_credits            integer not null check (charge_credits > 0),
  charge_ref                text not null unique,
  charged_gel               numeric,
  refund_state              text check (refund_state in ('pending', 'done', 'nothing_to_refund')),
  refunded_credits          integer not null default 0 check (refunded_credits >= 0),
  provider_output_urls      jsonb not null default '[]'::jsonb,
  output_urls               jsonb not null default '[]'::jsonb,
  correlation_id            text,
  error_code                text,
  error_detail              text,
  attempts                  integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  submitted_at              timestamptz,
  completed_at              timestamptz,
  next_poll_at              timestamptz
);

create index if not exists studio_jobs_user_created_idx on public.studio_jobs (user_id, created_at desc);
create index if not exists studio_jobs_active_idx on public.studio_jobs (status, updated_at)
  where status not in ('completed', 'failed', 'nsfw', 'canceled');
create index if not exists studio_jobs_refund_pending_idx on public.studio_jobs (updated_at)
  where refund_state = 'pending';

drop trigger if exists studio_jobs_updated_at on public.studio_jobs;
create trigger studio_jobs_updated_at
  before update on public.studio_jobs
  for each row execute function public.update_updated_at_column();

alter table public.studio_jobs enable row level security;

drop policy if exists studio_jobs_owner_select on public.studio_jobs;
create policy studio_jobs_owner_select on public.studio_jobs
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete, truncate on public.studio_jobs from anon, authenticated;

create table if not exists public.provider_webhook_events (
  provider    text not null,
  request_id  text not null,
  status      text not null,
  job_id      uuid,
  payload     jsonb,
  received_at timestamptz not null default now(),
  primary key (provider, request_id, status)
);

-- Service role only: RLS on with no policies, and no client privileges at all.
alter table public.provider_webhook_events enable row level security;
revoke all on public.provider_webhook_events from anon, authenticated;

commit;
