-- 20261024a_library_favorites.sql — applied to Production (zwksnayknzggdcenqqxy) by the owner in the Supabase SQL Editor
-- on 2026-10-24 ~08:05Z, this exact file, before the PR that reads it (Phase 3 PR 4, favorites) was merged. GG chose this
-- table on 2026-10-24 07:19Z (decision card: "C: ცალკე ცხრილი").
--
-- WHY A TABLE. A Library star used to live in one browser's localStorage, unscoped by account, and the Favorites tab only
-- filtered the newest 60 works (MASTER TASK v3.1 §4.2.4). Keeping it on the work's own generation_jobs row
-- (params.favorite) was the first plan, but every write to that row moves its updated_at (its trigger), and three readers
-- treat a recent updated_at as "this just finished": the bell's feed (lib/notifications/store), the task tray
-- (/api/orchestrator/jobs, lib/tasks) and the delivery outbox (lib/notifications/outbox), which could send a push or
-- WhatsApp notice for a work starred long after it ended. A row here touches none of them.
--
-- WHAT. One row per (owner, starred work). Read by the owner only (RLS), written only by the server
-- (app/api/studio/library PATCH, through the service role, after it has checked that the work is the caller's own and
-- finished), like generation_jobs itself since 20261001f. A deleted work takes its star with it (on delete cascade), and
-- so does a deleted account.
--
-- Additive only: one table, one index, one policy. Nothing existing is altered, and it can be applied twice. Verified on
-- a throwaway Postgres 16 + PostgREST (scripts/lease-isolation/run.sh → lib/library/libraryFavorites.pg.test.ts).
-- Rollback (the Library then answers its Favorites tab with 503 and shows every star off; nothing else changes):
--   drop table public.library_favorites;

begin;

create table if not exists public.library_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- generation_jobs.id is text ('prod_…', 'vremix:…', a uuid).
  job_id     text not null references public.generation_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- The cascade from a deleted work looks its stars up by job_id (the primary key leads with user_id).
create index if not exists library_favorites_job_idx on public.library_favorites (job_id);

-- The owner reads their own stars (the Library joins them to their works through their own session); nobody but the
-- server writes.
alter table public.library_favorites enable row level security;
revoke all on table public.library_favorites from public, anon, authenticated;
grant select on table public.library_favorites to authenticated;
grant select, insert, delete on table public.library_favorites to service_role;

drop policy if exists library_favorites_owner_select on public.library_favorites;
create policy library_favorites_owner_select on public.library_favorites
  for select to authenticated using (auth.uid() = user_id);

commit;
