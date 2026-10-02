-- 20261003c_agent_g_whatsapp.sql — Agent G on WhatsApp: which number belongs to which account, the one-time link
-- codes, and the short conversation history Agent G reads back.
--
-- PREPARED, NOT APPLIED. Until the owner applies it the feature degrades by itself: the webhook answers a fixed
-- "opening soon" text (no model call, no write — lib/agent-g/channels/handleInbound.ts), the WhatsApp card in Settings
-- says the same, and WhatsApp alerts answer `not_configured`.
--
-- ⚠️ A NUMBER IS LINKED ONLY BY A MESSAGE FROM THAT NUMBER. The signed-in user takes a one-time code on the website
-- and sends it from WhatsApp; the Meta-signed webhook binds sender → account with service_role. So the client roles
-- may READ their own link row and nothing else here: the older policies (20260220) let an owner INSERT a channel row
-- with any `external_id` — anyone could have claimed someone else's number and read their conversation under their own
-- account. Those policies are dropped and the client write privileges revoked.
--
-- Safe on a database that already has the 20260220 tables (older column set, owner-CRUD policies): every statement is
-- IF NOT EXISTS / DROP IF EXISTS, columns are added only when missing, nothing existing is dropped.
-- After applying: `node scripts/check-db-exposure.mjs`.

begin;

create extension if not exists pgcrypto;

-- ─── agent_g_channels ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.agent_g_channels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  status      text not null default 'disconnected',
  -- WhatsApp: the sender's wa_id (international digits). Telegram: the chat id.
  external_id text,
  username    text,
  -- WhatsApp: { locale, alerts, linked_at, last_inbound_at (the 24 h window), profile_name }.
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.agent_g_channels add column if not exists status      text not null default 'disconnected';
alter table public.agent_g_channels add column if not exists external_id text;
alter table public.agent_g_channels add column if not exists username    text;
alter table public.agent_g_channels add column if not exists meta        jsonb not null default '{}'::jsonb;
alter table public.agent_g_channels add column if not exists updated_at  timestamptz not null default now();

alter table public.agent_g_channels drop constraint if exists agent_g_channels_type_check;
alter table public.agent_g_channels
  add constraint agent_g_channels_type_check check (type in ('telegram', 'whatsapp', 'web', 'mobile'));
alter table public.agent_g_channels drop constraint if exists agent_g_channels_status_check;
alter table public.agent_g_channels
  add constraint agent_g_channels_status_check check (status in ('connected', 'disconnected'));
alter table public.agent_g_channels drop constraint if exists agent_g_channels_meta_size;
alter table public.agent_g_channels
  add constraint agent_g_channels_meta_size check (jsonb_typeof(meta) = 'object' and octet_length(meta::text) <= 4096) not valid;

-- One account per number, one WhatsApp number per account.
create unique index if not exists agent_g_channels_type_external_id_uidx
  on public.agent_g_channels (type, external_id) where external_id is not null;
create unique index if not exists agent_g_channels_one_whatsapp_per_user
  on public.agent_g_channels (user_id) where type = 'whatsapp';
create index if not exists agent_g_channels_user_type_idx on public.agent_g_channels (user_id, type);

create or replace function public.agent_g_touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists agent_g_channels_updated_at_trigger on public.agent_g_channels;
create trigger agent_g_channels_updated_at_trigger
  before update on public.agent_g_channels
  for each row execute function public.agent_g_touch_updated_at();

-- ─── agent_g_channel_events (also the WhatsApp conversation history: type = 'whatsapp_message') ─────────────────
create table if not exists public.agent_g_channel_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.agent_g_channel_events drop constraint if exists agent_g_channel_events_payload_size;
alter table public.agent_g_channel_events
  add constraint agent_g_channel_events_payload_size check (octet_length(payload::text) <= 16384) not valid;

create index if not exists agent_g_channel_events_user_idx on public.agent_g_channel_events (user_id, created_at desc);
create index if not exists agent_g_channel_events_user_type_idx
  on public.agent_g_channel_events (user_id, type, created_at desc);

-- ─── agent_g_connect_codes ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.agent_g_connect_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code       text not null unique,
  channel    text not null default 'telegram',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.agent_g_connect_codes add column if not exists channel text not null default 'telegram';
alter table public.agent_g_connect_codes drop constraint if exists agent_g_connect_codes_channel_check;
alter table public.agent_g_connect_codes
  add constraint agent_g_connect_codes_channel_check check (channel in ('telegram', 'whatsapp'));

create index if not exists agent_g_connect_codes_user_idx on public.agent_g_connect_codes (user_id, channel);
create index if not exists agent_g_connect_codes_exp_idx on public.agent_g_connect_codes (expires_at);

-- ─── Access: owners READ their own link and history; every write is service_role ─────────────────────────────
alter table public.agent_g_channels       enable row level security;
alter table public.agent_g_channel_events enable row level security;
alter table public.agent_g_connect_codes  enable row level security;

drop policy if exists agent_g_channels_owner_crud on public.agent_g_channels;
drop policy if exists agent_g_channels_owner_read on public.agent_g_channels;
create policy agent_g_channels_owner_read
  on public.agent_g_channels for select
  using (auth.uid() = user_id);

drop policy if exists agent_g_channel_events_owner_select on public.agent_g_channel_events;
create policy agent_g_channel_events_owner_select
  on public.agent_g_channel_events for select
  using (user_id is not null and auth.uid() = user_id);

-- Codes are never read by a browser: the route that mints one returns it once.
drop policy if exists agent_g_connect_codes_owner_crud on public.agent_g_connect_codes;

revoke insert, update, delete, truncate on public.agent_g_channels       from anon, authenticated;
revoke insert, update, delete, truncate on public.agent_g_channel_events from anon, authenticated;
revoke all                              on public.agent_g_connect_codes  from anon, authenticated;
revoke all on function public.agent_g_touch_updated_at() from public, anon, authenticated;

commit;
