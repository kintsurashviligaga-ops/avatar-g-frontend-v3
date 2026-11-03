-- REVIEW-ONLY: staging fixture for Supabase project lejrrdeffeswrdzjqthm.
-- Do not execute against production or any database containing real data.
-- The caller MUST independently verify the connected project reference. The
-- following settings are operator attestations, NOT proof of database identity:
--   set mcp.preview_project_ref = 'lejrrdeffeswrdzjqthm';
--   set mcp.synthetic_user_id = '<existing staging-only auth.users UUID>';
--   set mcp.preview_asset_url = 'https://lejrrdeffeswrdzjqthm.supabase.co/storage/v1/object/public/renders/mcp-preview/<synthetic-file>';
-- Create the synthetic file and staging user separately; this file does not.
-- Apply oauth-broker.sql separately after review; it relies on auth.users.
-- Source for the columns: supabase/migrations/20260523_generation_jobs.sql and
-- lib/mcp/gemini/works.ts. This intentionally grants only owner SELECT.
-- Cleanup: after test verification, delete this uniquely named synthetic row;
-- drop the fixture table only after independently checking its contents and
-- dependencies. Remove the synthetic asset and user via normal staging tools.

begin;
do $$
declare synthetic_user uuid; asset text;
begin
  if current_setting('mcp.preview_project_ref',true) is distinct from 'lejrrdeffeswrdzjqthm' then
    raise exception 'wrong or unacknowledged staging project';
  end if;
  if to_regclass('public.generation_jobs') is not null then
    raise exception 'generation_jobs already exists; refusing to modify it';
  end if;
  begin
    synthetic_user := current_setting('mcp.synthetic_user_id',true)::uuid;
  exception when invalid_text_representation then raise exception 'invalid synthetic user'; end;
  if synthetic_user is null or not exists(select 1 from auth.users where id=synthetic_user) then
    raise exception 'staging test user must already exist';
  end if;
  asset := current_setting('mcp.preview_asset_url',true);
  if asset is null or asset !~ '^https://lejrrdeffeswrdzjqthm\.supabase\.co/storage/v1/object/public/renders/mcp-preview/[A-Za-z0-9_-]+\.(png|jpg|mp4)$' then
    raise exception 'expected canonical staging synthetic asset URL';
  end if;
end $$;

create table public.generation_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  service_type text not null,
  status text not null,
  created_at timestamptz not null default now(),
  signed_url text,
  result jsonb,
  params jsonb not null default '{}'::jsonb
);
alter table public.generation_jobs enable row level security;
revoke all on public.generation_jobs from public, anon, authenticated;
grant select on public.generation_jobs to authenticated;
grant select,insert,update,delete on public.generation_jobs to service_role;
create policy mcp_preview_owner_select on public.generation_jobs
  for select to authenticated using (auth.uid() = user_id);

insert into public.generation_jobs(id,user_id,service_type,status,signed_url,params)
values ('mcp-preview-synthetic-image',current_setting('mcp.synthetic_user_id')::uuid,'image','completed',
  current_setting('mcp.preview_asset_url'),'{"prompt":"Synthetic MCP preview image"}'::jsonb);
commit;
