-- Library stars (lib/library/libraryFavorites.pg.test.ts): public.generation_jobs as the Library's signed-in reader meets it
-- in Production. RLS on with the owner-select and owner-delete policies (supabase/migrations/20260523_generation_jobs.sql;
-- the owner insert/update policies went in 20261001f), SELECT and DELETE for authenticated (INSERT/UPDATE revoked in
-- 20261002e), plus the suite's two accounts. Applied after every other suite has run, which all use the service role.
alter table public.generation_jobs enable row level security;
drop policy if exists generation_jobs_owner_select on public.generation_jobs;
create policy generation_jobs_owner_select on public.generation_jobs for select using (auth.uid() = user_id);
drop policy if exists generation_jobs_owner_delete on public.generation_jobs;
create policy generation_jobs_owner_delete on public.generation_jobs for delete using (auth.uid() = user_id);
grant select, delete on public.generation_jobs to authenticated;
insert into auth.users (id) values ('0e000000-0000-4000-8000-00000000fa01'), ('0e000000-0000-4000-8000-00000000fa02')
  on conflict do nothing;
