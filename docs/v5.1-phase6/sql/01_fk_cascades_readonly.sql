-- v5.1 Phase 6 — READ-ONLY. Lists every foreign key that points at auth.users or public.profiles, and what happens to
-- the row when the user is deleted (CASCADE / SET NULL / NO ACTION / RESTRICT). Reads catalog views only; changes nothing.
select
  con.conrelid::regclass  as table_name,
  att.attname             as column_name,
  con.confrelid::regclass as points_at,
  case con.confdeltype
    when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
    when 'r' then 'RESTRICT' when 'a' then 'NO ACTION' end as on_delete
from pg_constraint con
join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
where con.contype = 'f'
  and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
order by on_delete, table_name::text;

-- Tables in public that have a user_id column but NO foreign key (deletion would leave them behind):
select c.table_name
from information_schema.columns c
where c.table_schema = 'public' and c.column_name = 'user_id'
  and not exists (
    select 1 from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.contype = 'f' and con.conrelid = ('public.' || quote_ident(c.table_name))::regclass and att.attname = 'user_id')
order by 1;
