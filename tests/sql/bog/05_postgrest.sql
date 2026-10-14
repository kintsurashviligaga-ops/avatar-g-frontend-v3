-- tests/sql/bog/05_postgrest.sql — let a LOCAL PostgREST play Supabase's REST layer for the end-to-end run
-- (scripts/bog-e2e.sh). service_role gets what Supabase gives it: every table and function in public.
-- LOCAL TEST DATABASE ONLY.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'local-e2e-only';
  end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Test helper: a signed-up user (auth.users row, no profile yet — like a brand-new account).
create or replace function public.e2e_create_user(p_id uuid) returns void language sql security definer
  set search_path = public, auth as $$ insert into auth.users (id, email) values (p_id, p_id::text || '@test.local') $$;
revoke execute on function public.e2e_create_user(uuid) from public, anon, authenticated;
grant execute on function public.e2e_create_user(uuid) to service_role;
