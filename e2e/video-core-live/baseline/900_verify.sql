-- 900 — the baseline checks itself: every Production contract the Video Core E2E leans on must hold, or apply.sh fails
-- (ON_ERROR_STOP) before a single test runs. Read-only.
do $$
declare
  t text;
  f text;
  missing text;
begin
  -- Row Level Security is on for every table a user session can reach on this path.
  foreach t in array array['profiles','credit_ledger','generation_jobs','analytics_events','agent_evolution_traces'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t and c.relrowsecurity) then
      raise exception 'baseline: RLS is off on public.%', t;
    end if;
  end loop;

  -- generation_jobs: owners may read and delete their rows, never write them (20261001f).
  select string_agg(policyname, ',' order by policyname) into missing from pg_policies
   where schemaname = 'public' and tablename = 'generation_jobs';
  if missing is distinct from 'generation_jobs_owner_delete,generation_jobs_owner_select' then
    raise exception 'baseline: generation_jobs policies are %, expected owner select + delete only', missing;
  end if;

  -- The money functions and the account lookup run for the service role only (20260929a, 20261002d, 20261003f).
  foreach f in array array['public.deduct_credits(uuid,integer,text)','public.refund_credits(uuid,integer,text)',
                           'public.deduct_credits_once(uuid,integer,text)','public.auth_account_status(text,text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'baseline: % is executable by anon or authenticated', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'baseline: service_role cannot execute %', f;
    end if;
  end loop;

  -- Money tables: no client writes.
  foreach t in array array['public.profiles','public.credit_ledger'] loop
    if has_table_privilege('anon', t, 'insert') or has_table_privilege('authenticated', t, 'insert')
       or has_table_privilege('authenticated', t, 'update') or has_table_privilege('authenticated', t, 'delete') then
      raise exception 'baseline: a client role can write %', t;
    end if;
  end loop;

  -- The ledger's idempotency indexes (reserve/commit/refund once per job; one grant and one debit per ref).
  foreach t in array array['idx_credit_ledger_job_reason','credit_ledger_user_ref_positive_uniq','credit_ledger_user_ref_negative_uniq'] loop
    if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = t) then
      raise exception 'baseline: index % is missing', t;
    end if;
  end loop;

  -- A new account gets its profile and (confirmed) its starter grant; a confirmation grants it exactly once.
  foreach t in array array['on_auth_user_created','on_auth_user_starter_balance','on_auth_user_confirmed_starter'] loop
    if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = t and not tgisinternal) then
      raise exception 'baseline: trigger auth.users.% is missing', t;
    end if;
  end loop;

  -- Storage: both buckets private; uploads capped at 50 MB with a media allowlist (20261008c, 20261009b).
  if not exists (select 1 from storage.buckets where id = 'uploads' and not public and file_size_limit = 52428800
                 and allowed_mime_types is not null) then
    raise exception 'baseline: the uploads bucket is not private with its 50 MB media allowlist';
  end if;
  if not exists (select 1 from storage.buckets where id = 'renders' and not public) then
    raise exception 'baseline: the renders bucket is not private';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT','ALL')
             and roles && array['public','anon','authenticated']::name[] and (qual is null or btrim(qual) in ('true','(true)'))) then
    raise exception 'baseline: a storage.objects policy lets anyone read every bucket';
  end if;
end
$$;

select 'baseline verified' as status;
