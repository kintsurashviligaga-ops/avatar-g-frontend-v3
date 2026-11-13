-- Local, throwaway-Postgres checks for docs/v5.1-phase5/migrations/20261114a_phase5_money.sql.
-- Run by scripts/phase5-sql-check.sh (never against Supabase). Every check raises on failure.
\set ON_ERROR_STOP on

-- Supabase's shapes the migration depends on.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to service_role;
grant references on auth.users to service_role;

\i docs/v5.1-phase5/migrations/20261114a_phase5_money.sql
-- idempotent: the second run is a no-op
\i docs/v5.1-phase5/migrations/20261114a_phase5_money.sql

insert into auth.users values ('00000000-0000-0000-0000-000000000001');

set role service_role;

-- an approved price and its successor, back to back
insert into public.price_versions (id, capability, model, unit, usd_per_unit, credits_per_unit, valid_from, valid_to, source_url, fetched_at, approved_by, approved_at)
values ('pv_flash_out_1', 'agent.text', 'gemini-3.8-flash', 'output_mtok', 2, 250, '2026-11-01', '2026-11-20', 'https://cloud.google.com/vertex-ai/generative-ai/pricing', now(), 'GG', now()),
       ('pv_flash_out_2', 'agent.text', 'gemini-3.8-flash', 'output_mtok', 2.5, 300, '2026-11-20', null, 'https://cloud.google.com/vertex-ai/generative-ai/pricing', now(), 'GG', now());

-- an unapproved draft may overlap (it is not usable until approved)
insert into public.price_versions (id, capability, model, unit, usd_per_unit, credits_per_unit, valid_from, source_url, fetched_at)
values ('pv_flash_out_draft', 'agent.text', 'gemini-3.8-flash', 'output_mtok', 3, 400, '2026-11-10', 'https://cloud.google.com/vertex-ai/generative-ai/pricing', now());

do $$
declare ok boolean;
begin
  -- 1. two approved rows live at once are refused
  begin
    insert into public.price_versions (id, capability, model, unit, usd_per_unit, credits_per_unit, valid_from, source_url, fetched_at, approved_by, approved_at)
    values ('pv_overlap', 'agent.text', 'gemini-3.8-flash', 'output_mtok', 2, 250, '2026-11-15', 'https://x.example/p', now(), 'GG', now());
    raise exception 'FAIL overlap accepted';
  exception when exclusion_violation then null; end;
  -- 2. approving the overlapping draft is refused too
  begin
    update public.price_versions set approved_by = 'GG', approved_at = now() where id = 'pv_flash_out_draft';
    raise exception 'FAIL approving an overlapping draft accepted';
  exception when exclusion_violation then null; end;
  -- 3. an approved price is immutable
  begin
    update public.price_versions set credits_per_unit = 1 where id = 'pv_flash_out_1';
    raise exception 'FAIL approved price edited';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- 3b. ... and so is its id (quotes and provider_costs name the row by id)
  begin
    update public.price_versions set id = 'pv_renamed' where id = 'pv_flash_out_1';
    raise exception 'FAIL approved price renamed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- 4. valid_to may be set once, and never changed after
  update public.price_versions set valid_to = '2026-12-01' where id = 'pv_flash_out_2';
  begin
    update public.price_versions set valid_to = '2026-12-02' where id = 'pv_flash_out_2';
    raise exception 'FAIL valid_to changed twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- 5. an approved price is never deleted; a draft may be
  begin
    delete from public.price_versions where id = 'pv_flash_out_1';
    raise exception 'FAIL approved price deleted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  delete from public.price_versions where id = 'pv_flash_out_draft';
  -- 6. bad rows are refused by checks: http source, zero price, promo without end, approver without time
  begin insert into public.price_versions (id, capability, model, unit, usd_per_unit, credits_per_unit, valid_from, source_url, fetched_at) values ('pv_bad1','c','m','second',1,1,now(),'http://x',now()); raise exception 'FAIL http'; exception when check_violation then null; end;
  begin insert into public.price_versions (id, capability, model, unit, usd_per_unit, credits_per_unit, valid_from, source_url, fetched_at) values ('pv_bad2','c','m','second',0,1,now(),'https://x',now()); raise exception 'FAIL zero'; exception when check_violation then null; end;
  begin insert into public.price_versions (id, capability, model, unit, usd_per_unit, credits_per_unit, valid_from, source_url, fetched_at, promo) values ('pv_bad3','c','m','second',1,1,now(),'https://x',now(),true); raise exception 'FAIL promo'; exception when check_violation then null; end;
  begin insert into public.price_versions (id, capability, model, unit, usd_per_unit, credits_per_unit, valid_from, source_url, fetched_at, approved_by) values ('pv_bad4','c','m','second',1,1,now(),'https://x',now(),'GG'); raise exception 'FAIL approver'; exception when check_violation then null; end;
  -- 7. provider_costs: one row per ref; a loss needs its reason
  insert into public.provider_costs (ref, user_id, capability, model, usd, credits_charged) values ('run:r1:s1', '00000000-0000-0000-0000-000000000001', 'agent.text', 'gemini-3.8-flash', 0.05, 12);
  begin insert into public.provider_costs (ref, user_id, capability, model, usd, credits_charged) values ('run:r1:s1', '00000000-0000-0000-0000-000000000001', 'agent.text', 'gemini-3.8-flash', 0.05, 12); raise exception 'FAIL dup ref'; exception when unique_violation then null; end;
  begin insert into public.provider_costs (ref, user_id, capability, model, usd, credits_charged, loss) values ('run:r2:s1', '00000000-0000-0000-0000-000000000001', 'agent.text', 'gemini-3.8-flash', 0.05, 0, true); raise exception 'FAIL loss without reason'; exception when check_violation then null; end;
end $$;

reset role;

-- 8. client roles cannot read anything
do $$ begin
  if has_table_privilege('authenticated', 'public.price_versions', 'select') or has_table_privilege('anon', 'public.provider_costs', 'select')
     or has_table_privilege('authenticated', 'public.reconcile_reports', 'select') then raise exception 'FAIL client can read'; end if;
end $$;

-- 8b. the draft price seed loads as drafts only, twice without error, and one draft approves at "now"
\i docs/v5.1-phase5/seed/20261113b_price_drafts.sql
\i docs/v5.1-phase5/seed/20261113b_price_drafts.sql
set role service_role;
do $$
declare n int; a int;
begin
  select count(*), count(approved_by) into n, a from public.price_versions where id like 'pv\_%' and source_url = 'https://cloud.google.com/vertex-ai/generative-ai/pricing' and fetched_at = '2026-11-13T13:15:00Z';
  if n < 30 then raise exception 'FAIL seed loaded % rows', n; end if;
  if a <> 0 then raise exception 'FAIL seed approved % rows', a; end if;
  update public.price_versions set valid_from = now(), approved_by = 'GG', approved_at = now() where id = 'pv_tts_38flash_out' and approved_by is null;
  if not found then raise exception 'FAIL approving a draft'; end if;
  begin
    update public.price_versions set credits_per_unit = 1 where id = 'pv_tts_38flash_out';
    raise exception 'FAIL approved seed row edited';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- 9. rollback drops exactly what the migration made, and the migration applies again after it
\i docs/v5.1-phase5/migrations/20261114a_phase5_money.rollback.sql
do $$ begin
  if to_regclass('public.price_versions') is not null or to_regclass('public.provider_costs') is not null then raise exception 'FAIL rollback left a table'; end if;
  if to_regclass('auth.users') is null then raise exception 'FAIL rollback touched auth.users'; end if;
end $$;
\i docs/v5.1-phase5/migrations/20261114a_phase5_money.sql

select 'PHASE5 SQL CHECKS PASSED' as result;
