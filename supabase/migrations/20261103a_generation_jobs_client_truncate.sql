-- Defense in depth for a production grant observed read-only: RLS does not
-- restrict TRUNCATE. This does not assume any PostgREST endpoint exposes it.
-- Revoke only client/PUBLIC TRUNCATE; owner DELETE and service-role privileges
-- remain unchanged. Fail atomically if a client inherits it from another role.
do $$
begin
  if to_regclass('public.generation_jobs') is null then
    raise exception 'generation_jobs missing; client TRUNCATE revoke not applied';
  end if;
  revoke truncate on table public.generation_jobs from public, anon, authenticated;
  if has_table_privilege('anon', 'public.generation_jobs', 'TRUNCATE') or
     has_table_privilege('authenticated', 'public.generation_jobs', 'TRUNCATE') then
    raise exception 'client still has inherited generation_jobs TRUNCATE; inspect role membership';
  end if;
end $$;
