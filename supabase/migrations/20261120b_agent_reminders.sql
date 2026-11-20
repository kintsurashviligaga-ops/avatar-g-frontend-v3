-- 20261120b_agent_reminders.sql — NOT APPLIED (the production database is paused). Agent G Calendar & Reminders plugin:
-- reminders the user asks Agent G to keep ("remind me Friday 10:00"). Nothing reads or writes this table yet: the store,
-- the cron sweep that sends due reminders, and their flag come in the follow-up once the database is back and GG OKs it.
--
-- Additive only: one new table. Safe to run twice. Rollback: drop table public.agent_reminders;

begin;

create table if not exists public.agent_reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  -- The instant (UTC) and the zone the user said it in, so "10:00 Tbilisi" stays 10:00 across DST elsewhere.
  due_at      timestamptz not null,
  time_zone   text not null check (length(time_zone) between 1 and 64),
  note        text check (note is null or length(note) <= 2000),
  status      text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists agent_reminders_due on public.agent_reminders (due_at) where status = 'pending';
create index if not exists agent_reminders_user on public.agent_reminders (user_id, created_at desc);

alter table public.agent_reminders enable row level security;
-- The user sees and cancels their own; inserts and the sweep go through service_role only.
drop policy if exists agent_reminders_select_own on public.agent_reminders;
create policy agent_reminders_select_own on public.agent_reminders for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on table public.agent_reminders from public, anon, authenticated;
grant select on table public.agent_reminders to authenticated;
grant select, insert, update, delete on table public.agent_reminders to service_role;

commit;
