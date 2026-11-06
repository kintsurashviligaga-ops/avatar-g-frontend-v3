-- prod_schema_readonly.sql — READ-ONLY check of the Production database for docs/production-truth/PRODUCT_TRUTH_MATRIX.md.
--
-- Run it ONLY in the Production project's SQL Editor:
--   https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/sql/new
-- (the URL must contain zwksnayknzggdcenqqxy; supabase-beige-river is a different project).
--
-- It reads the catalog only: no INSERT/UPDATE/DELETE/DDL, no row data, no secrets. One result table.

with t(name, migration) as (values
  ('profiles',               'base'),
  ('generation_jobs',        'base / 20261031a'),
  ('credit_ledger',          '20261002a..d'),
  ('chat_messages',          '20260801'),
  ('request_idempotency',    '20261013a'),
  ('library_favorites',      '20261024a'),
  ('sandbox_spend',          '20261031b'),
  ('connector_accounts',     '20261101a'),
  ('research_context_files', '20261003b')
), f(name, migration) as (values
  ('reserve_sandbox_spend', '20261031b'),
  ('settle_sandbox_spend',  '20261031b')
)
select 'table' as kind, t.name, t.migration,
       (to_regclass('public.' || t.name) is not null) as present,
       c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.name) as policies,
       c.reltuples::bigint as approx_rows
from t
left join pg_class c on c.oid = to_regclass('public.' || t.name)
union all
select 'function', f.name, f.migration,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = f.name),
       null, null, null
from f
union all
select 'check', 'generation_jobs allows service_type document', '20261031a',
       coalesce((select pg_get_constraintdef(oid) like '%document%' from pg_constraint
                 where conrelid = to_regclass('public.generation_jobs') and contype = 'c'
                   and pg_get_constraintdef(oid) like '%service_type%' limit 1), false),
       null, null, null
union all
select 'check', 'anon/authenticated have NO grant on connector_accounts', '20261101a',
       not exists (select 1 from information_schema.role_table_grants
                   where table_schema = 'public' and table_name = 'connector_accounts'
                     and grantee in ('anon', 'authenticated')),
       null, null, null
order by 1 desc, 2;
