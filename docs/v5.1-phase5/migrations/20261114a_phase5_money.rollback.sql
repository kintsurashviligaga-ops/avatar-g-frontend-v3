-- Rollback for 20261114a_phase5_money.sql. PREPARED, NOT APPLIED. Drops ONLY what that file created.
-- Run only while nothing reads these tables (AGENT_PRICE_BOOK=off, reconcile cron off). provider_costs holds our cost
-- history: export it first (select * from public.provider_costs) if it has rows worth keeping.
begin;
drop table if exists public.reconcile_reports;
drop table if exists public.provider_costs;
drop trigger if exists price_versions_guard on public.price_versions;
drop table if exists public.price_versions;
drop function if exists public.price_versions_guard();
-- btree_gist is left installed: other objects may use it, and it holds no data.
commit;
