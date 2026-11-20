-- 20261120a_connector_accounts_providers.sql — NOT APPLIED. Agent G plugins (GG 2026-11-20): Notion and GitHub rows in
-- connector_accounts. Run in the Supabase SQL Editor of project zwksnayknzggdcenqqxy only with GG's OK, after the
-- database is back.
--
-- Additive: widens the provider CHECK (google_drive stays allowed, its rows are untouched) and adds a read-only helper the
-- app calls to know whether notion/github rows are allowed yet (lib/connectors/oauth/live providerRowsAllowed). Until this
-- runs, the Notion and GitHub plugins say "needs setup" and never open a link flow.
--
-- For Notion and GitHub, enc_refresh_token holds their long-lived ACCESS token, sealed by the server with AES-256-GCM
-- (CONNECTOR_TOKEN_KEY, the user id as associated data). The database never sees a plain token.
--
-- Rollback (the two plugins go back to "needs setup"; delete their rows first):
--   delete from public.connector_accounts where provider in ('notion', 'github');
--   alter table public.connector_accounts drop constraint connector_accounts_provider_check;
--   alter table public.connector_accounts add constraint connector_accounts_provider_check check (provider in ('google_drive'));
--   drop function if exists public.connector_providers_allowed();

begin;

alter table public.connector_accounts drop constraint if exists connector_accounts_provider_check;
alter table public.connector_accounts
  add constraint connector_accounts_provider_check check (provider in ('google_drive', 'notion', 'github'));

create or replace function public.connector_providers_allowed()
returns text[]
language sql
stable
security definer
set search_path = public
as $$ select array['google_drive', 'notion', 'github']::text[] $$;

revoke all on function public.connector_providers_allowed() from public, anon, authenticated;
grant execute on function public.connector_providers_allowed() to service_role;

commit;
