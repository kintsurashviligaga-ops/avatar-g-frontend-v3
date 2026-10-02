-- 20261003d_push_subscriptions.sql — Web Push: the browsers and phones a user turned notifications on for.
--
-- PREPARED, NOT APPLIED. Until the owner applies it (and sets the VAPID keys — ENV_CHECKLIST.md) the feature degrades by
-- itself: GET /api/push/public-key answers { available: false } (a schema probe, lib/notifications/push/config.ts), the
-- opt-in card says "not available yet", and the push channel answers `not_configured` to the notification dispatcher.
--
-- One row is ONE browser's PushSubscription: the endpoint its push service gave it (FCM, Mozilla, Apple, WNS) and the two
-- keys the payload is encrypted to. Written ONLY by service_role, through POST /api/push/subscribe, which checks that the
-- endpoint is https on a known push service. ⚠️ THE SERVER POSTS TO `endpoint`. A client role able to insert or update a
-- row could point it at any host (our servers would call it on every notification) — so client INSERT/UPDATE/TRUNCATE are
-- revoked and no insert/update policy exists. The owner may READ their own rows and DELETE them (switching a device off);
-- a delete can only ever remove a notification, never redirect one.
--
-- `endpoint` is unique across users: one browser has one endpoint, and the route's upsert moves it to whoever subscribes
-- last (a shared computer shows the signed-in person's notifications, not the previous account's). The route keeps at
-- most 10 rows per user; the sender deletes a row the push service answers 404/410 for and counts other failures in
-- `failure_count` (reset by the next delivery, stamped in `last_success_at`).
--
-- Additive only: one new table, its index and policies. Nothing existing is altered.
-- After applying: `node scripts/check-db-exposure.mjs`.

begin;

create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- The push service URL. A bearer capability for that device: never logged, never sent back to a browser but its own.
  endpoint         text not null unique check (char_length(endpoint) between 9 and 2048 and endpoint like 'https://%'),
  -- The browser's P-256 public key (65 bytes) and auth secret (16 bytes), unpadded base64url.
  p256dh           text not null check (char_length(p256dh) between 80 and 100),
  auth             text not null check (char_length(auth) between 16 and 32),
  user_agent       text check (user_agent is null or char_length(user_agent) <= 300),
  locale           text not null default 'ka' check (locale in ('ka', 'en', 'ru')),
  -- Refreshed on every (re)registration, so the per-user cap retires the device not seen the longest.
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failure_count    integer not null default 0 check (failure_count >= 0)
);

create index if not exists push_subscriptions_user_created_idx on public.push_subscriptions (user_id, created_at desc);

-- RLS: the owner reads and deletes their own rows; nobody but service_role inserts or updates (service_role bypasses RLS).
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner_select on public.push_subscriptions;
create policy push_subscriptions_owner_select on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists push_subscriptions_owner_delete on public.push_subscriptions;
create policy push_subscriptions_owner_delete on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.push_subscriptions from anon;
revoke insert, update, truncate on public.push_subscriptions from authenticated;

-- ─── VERIFY — raise (rolling back the whole file) if a guarantee did not take ────────────────────────────────
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass) then
    raise exception 'VERIFY FAILED — row level security is off on push_subscriptions';
  end if;
  if has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
     or has_table_privilege('anon', 'public.push_subscriptions', 'INSERT')
     or has_table_privilege('anon', 'public.push_subscriptions', 'DELETE') then
    raise exception 'VERIFY FAILED — anon holds a privilege on push_subscriptions';
  end if;
  if has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.push_subscriptions', 'TRUNCATE') then
    raise exception 'VERIFY FAILED — a client role can write push_subscriptions (it could point the server at any host)';
  end if;
  if not has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
     or not has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE') then
    raise exception 'VERIFY FAILED — the owner cannot read or delete their own push subscriptions';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
       and (qual is null or btrim(qual) = 'true' or cmd not in ('SELECT', 'DELETE'))
  ) then
    raise exception 'VERIFY FAILED — a push_subscriptions policy lets every row through, or allows a client write';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.push_subscriptions'::regclass and contype = 'u'
  ) then
    raise exception 'VERIFY FAILED — push_subscriptions.endpoint is not unique (the subscribe upsert needs it)';
  end if;
  raise notice 'VERIFY OK — push_subscriptions: owner select/delete only, client inserts/updates revoked, endpoint unique.';
end
$$;

commit;
