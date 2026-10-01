-- 20261001b_longform_jobs.sql — the long-form (8 s … 240 s) video queue (docs/video/LONGFORM.md).
--
-- One `longform_jobs` row per film and one `longform_scenes` row per 8 s Veo clip. A cron tick
-- (app/api/cron/longform-tick) leases a job, reads its scenes, asks the pure state machine
-- (lib/video/longform/stateMachine.ts) what to do, does it, and writes the result back. Nothing lives in memory
-- between ticks, so a killed function loses only its own in-flight call.
--
-- ⚠️ WRITTEN ONLY BY service_role. Both tables carry money (charge_ref / charge_credits / refunded), so — unlike
-- generation_jobs, which is owner-writable — a user may READ their own rows and never write them (see 20260929a for
-- how a row-trusted refund amount became a way to mint credits). Refunds are still capped by the ledger, never by a
-- row (lib/orchestrator/ledger.netDebitedForRef).
--
-- ⚠️ The two claim functions are SECURITY DEFINER and executable by service_role ONLY (revoked from public, anon,
-- authenticated): a claim moves a scene toward a paid Veo submit.
--
-- Additive only: two new tables, their triggers, policies and two functions. Nothing existing is altered.
-- NOT APPLIED automatically — see the activation checklist in docs/video/LONGFORM.md.

begin;

create table if not exists public.longform_jobs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  status                text not null default 'planned'
                          check (status in ('planned', 'rendering', 'stitching', 'done', 'failed', 'canceled')),
  prompt                text not null check (char_length(prompt) between 1 and 4000),
  seconds               integer not null check (seconds between 8 and 240 and seconds % 8 = 0),
  scene_count           integer not null check (scene_count between 1 and 30),
  act_count             integer not null check (act_count between 1 and 3),
  tier                  text not null check (tier in ('standard', 'fast', 'lite')),
  format                text not null default '16:9' check (format in ('16:9', '9:16', '1:1', '4:5')),
  resolution            text not null default '1080p' check (resolution in ('720p', '1080p')),
  generate_audio        boolean not null default true,
  -- The director's bible (cast with locked descriptions, look, arc, music) — bounded by the app; capped here too.
  bible                 jsonb not null default '{}'::jsonb check (octet_length(bible::text) <= 65536),
  -- Render options: negativePrompt, referenceImageUrls (≤ 3), chainActFrames, musicUrl, …
  options               jsonb not null default '{}'::jsonb check (octet_length(options::text) <= 16384),
  seed                  bigint check (seed is null or seed between 0 and 4294967295),
  estimate_usd          numeric not null default 0 check (estimate_usd >= 0),
  credits_per_scene     integer not null default 0 check (credits_per_scene >= 0),
  hold_reason           text check (hold_reason in ('insufficient_credits', 'billing_unavailable', 'platform_budget', 'provider_unavailable')),
  hold_until            timestamptz,
  cancel_requested      boolean not null default false,
  stitch_attempts       integer not null default 0 check (stitch_attempts >= 0),
  -- A refund that did not land (ledger down) keeps the job claimable after it is terminal, until it does.
  refunds_pending       boolean not null default false,
  output_url            text,
  output_path           text,
  output_bytes          bigint check (output_bytes is null or output_bytes >= 0),
  error_code            text,
  error_detail          text,
  -- Tick lease: one tick works a job at a time (claim_longform_jobs).
  lease_until           timestamptz,
  deadline_at           timestamptz not null default (now() + interval '24 hours'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz,
  check (scene_count * 8 = seconds)
);

create index if not exists longform_jobs_user_created_idx on public.longform_jobs (user_id, created_at desc);
create index if not exists longform_jobs_claimable_idx on public.longform_jobs (updated_at)
  where status in ('planned', 'rendering', 'stitching') or refunds_pending;

drop trigger if exists longform_jobs_updated_at on public.longform_jobs;
create trigger longform_jobs_updated_at
  before update on public.longform_jobs
  for each row execute function public.update_updated_at_column();

create table if not exists public.longform_scenes (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references public.longform_jobs(id) on delete cascade,
  -- Denormalised from the job so the owner policy needs no join.
  user_id               uuid not null references auth.users(id) on delete cascade,
  ordinal               integer not null check (ordinal between 0 and 29),
  act                   integer not null check (act between 0 and 2),
  status                text not null default 'queued'
                          check (status in ('queued', 'submitted', 'rendering', 'delivered', 'failed')),
  -- The director's scene (storyboard fields + the structured Veo shot), bounded.
  spec                  jsonb not null check (octet_length(spec::text) <= 65536),
  operation_name        text,
  transport             text check (transport in ('vertex', 'gemini')),
  model                 text,
  attempts              integer not null default 0 check (attempts >= 0),
  next_attempt_at       timestamptz,
  submitted_at          timestamptz,
  -- Act chaining: the ordinal whose LAST FRAME seeds this scene, and that frame once extracted.
  depends_on            integer,
  seed_frame_url        text,
  -- Billing: the ACT reservation's ledger ref and this scene's share; refunded once, under its own ref.
  charge_ref            text,
  charge_credits        integer not null default 0 check (charge_credits >= 0),
  refunded              boolean not null default false,
  output_url            text,
  output_path           text,
  output_bytes          bigint check (output_bytes is null or output_bytes >= 0),
  error_code            text,
  error_detail          text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  delivered_at          timestamptz,
  unique (job_id, ordinal),
  check (depends_on is null or (depends_on between 0 and 29 and depends_on <> ordinal)),
  check (not refunded or charge_ref is not null)
);

create index if not exists longform_scenes_job_status_idx on public.longform_scenes (job_id, status, ordinal);
create index if not exists longform_scenes_user_idx on public.longform_scenes (user_id, created_at desc);
-- One Veo operation belongs to one scene: a duplicated answer can never be filed under two rows.
create unique index if not exists longform_scenes_operation_uniq on public.longform_scenes (operation_name)
  where operation_name is not null;

drop trigger if exists longform_scenes_updated_at on public.longform_scenes;
create trigger longform_scenes_updated_at
  before update on public.longform_scenes
  for each row execute function public.update_updated_at_column();

-- RLS: the owner reads their own rows; nobody but service_role writes.
alter table public.longform_jobs enable row level security;
alter table public.longform_scenes enable row level security;

drop policy if exists longform_jobs_owner_select on public.longform_jobs;
create policy longform_jobs_owner_select on public.longform_jobs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists longform_scenes_owner_select on public.longform_scenes;
create policy longform_scenes_owner_select on public.longform_scenes
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete, truncate on public.longform_jobs from anon, authenticated;
revoke insert, update, delete, truncate on public.longform_scenes from anon, authenticated;

-- Lease up to p_limit jobs for one tick. A job is claimable while active (or while a refund is still owed) and not
-- leased by another tick; the least-recently-touched go first (the lease itself bumps updated_at → round robin).
create or replace function public.claim_longform_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.longform_jobs
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.longform_jobs j
     set lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900)))
   where j.id in (
     select c.id
       from public.longform_jobs c
      where (c.status in ('planned', 'rendering', 'stitching') or c.refunds_pending)
        and (c.lease_until is null or c.lease_until < now())
      order by c.updated_at asc
      limit greatest(1, least(coalesce(p_limit, 5), 50))
      for update skip locked
   )
  returning j.*;
$$;

-- Claim specific queued, due scenes of one job: queued → submitted, attempts + 1, stamped. Atomic per row, so two
-- overlapping ticks can never both submit one scene (the loser gets the row back from neither SELECT nor UPDATE).
create or replace function public.claim_longform_scenes(p_job_id uuid, p_ordinals integer[])
returns setof public.longform_scenes
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.longform_scenes s
     set status = 'submitted',
         attempts = s.attempts + 1,
         operation_name = null,
         submitted_at = now(),
         next_attempt_at = null,
         error_code = null,
         error_detail = null
   where s.id in (
     select c.id
       from public.longform_scenes c
      where c.job_id = p_job_id
        and c.ordinal = any(coalesce(p_ordinals, '{}'::integer[]))
        and c.status = 'queued'
        and c.charge_ref is not null
        and (c.next_attempt_at is null or c.next_attempt_at <= now())
      order by c.ordinal
      limit 30
      for update skip locked
   )
  returning s.*;
$$;

revoke execute on function public.claim_longform_jobs(integer, integer) from public, anon, authenticated;
revoke execute on function public.claim_longform_scenes(uuid, integer[]) from public, anon, authenticated;
grant execute on function public.claim_longform_jobs(integer, integer) to service_role;
grant execute on function public.claim_longform_scenes(uuid, integer[]) to service_role;

commit;
