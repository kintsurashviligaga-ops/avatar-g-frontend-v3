-- 20261115a_studio3d_jobs.sql — NOT APPLIED. Phase 8.8 3D Studio (flag STUDIO_3D_V2, off). GG runs it in the SQL Editor
-- (https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/sql/new) only when the 3D Studio is turned on.
--
-- One row per 3D job. `state` is lib/studio3d/pipeline Studio3dJob (step, credits, held/charged/refunded flags), written
-- only by the server. Models live in the PRIVATE bucket `studio3d` under <user id>/<job id>/ and are read through signed
-- links. Money is NOT stored here: the ledger rows (refs studio3d:<id>, :ref, :refund) are the truth.
--
-- Additive only. Rollback: drop table public.studio3d_jobs; (and empty + delete the studio3d bucket).

begin;

create table if not exists public.studio3d_jobs (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  mode        text not null check (mode in ('image', 'text', 'retexture')),
  prompt      text not null default '' check (length(prompt) <= 600),
  request     jsonb not null default '{}'::jsonb,
  state       jsonb not null,
  step        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists studio3d_jobs_user_created on public.studio3d_jobs (user_id, created_at desc);
create index if not exists studio3d_jobs_active on public.studio3d_jobs (step, created_at) where step in ('queued', 'starting', 'shape', 'texture', 'export');

alter table public.studio3d_jobs enable row level security;
revoke all on table public.studio3d_jobs from public, anon, authenticated;
grant select, insert, update on table public.studio3d_jobs to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('studio3d', 'studio3d', false, 104857600)
on conflict (id) do nothing;

commit;
