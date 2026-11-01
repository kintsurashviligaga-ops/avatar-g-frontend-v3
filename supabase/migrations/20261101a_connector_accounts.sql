-- 20261101a_connector_accounts.sql — NOT YET APPLIED. Needs GG's OK, then GG runs it in the Supabase SQL Editor.
--
-- Agent G Phase 4 (Google Drive, GG 2026-11-01 07:00Z: only the files the user picks, scope drive.file). One row per
-- user and provider holds the OAuth refresh token ENCRYPTED by the server (AES-256-GCM, CONNECTOR_TOKEN_KEY, the user id
-- as associated data: lib/connectors/google/crypto.ts). The database never sees the plain token. No access token is
-- stored. Disconnect revokes the token at Google and deletes the row.
--
-- Additive only: one table. Nothing existing is altered. Rollback (the Drive connector then answers "not linked"):
--   drop table public.connector_accounts;

begin;

create table if not exists public.connector_accounts (
  user_id            uuid not null references auth.users (id) on delete cascade,
  provider           text not null check (provider in ('google_drive')),
  enc_refresh_token  text not null check (length(enc_refresh_token) between 20 and 4096),
  scope              text not null default '',
  account_email      text check (account_email is null or length(account_email) <= 254),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Service role only: no policy for anon/authenticated, and no grants either.
alter table public.connector_accounts enable row level security;
revoke all on table public.connector_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.connector_accounts to service_role;

commit;
