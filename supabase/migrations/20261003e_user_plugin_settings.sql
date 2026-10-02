-- 20261003e_user_plugin_settings.sql — the studio tools a user has switched OFF (the „Plugins" tab of the Connectors · Plugins ·
-- Skills hub, components/studio/hub).
--
-- PREPARED, NOT APPLIED. Until the owner applies it the feature degrades by itself: GET /api/plugins answers
-- { available: false } (a schema probe, lib/plugins/settings.ts) and the Plugins tab shows its switches disabled with an
-- "opening soon" line; PUT answers 503 and nothing is written anywhere.
--
-- ONE ROW PER USER: `disabled_tools` is the list of tool ids (lib/studio/tools.ts) the user hid from their OWN menus — the
-- sidebar, the collapsed rail and the composer's „+" sheet. The route validates every id against that list
-- (lib/plugins/catalog.ts); the checks below only bound the shape, so a new tool never needs a migration.
--
-- ⚠️ A HIDDEN TOOL IS A TIDIER MENU, NOTHING MORE. This table is NOT a security boundary and NOT a billing control: no route
-- reads it before generating or charging, the tool's deep link and Agent G still reach it, and none of that may change.
-- Still, client roles get NO write privilege (the rule of 20261002e / 20260929a): the only writer is app/api/plugins through
-- service_role, which validates the ids; the owner may only READ their own row. Nothing here is money state — the grants are
-- kept tight because a later table that IS money state is usually copied from the last one written.
--
-- Additive only: one new table, its policy and its grants. Nothing existing is altered. No function, no trigger
-- (`updated_at` is written by the route on every upsert).
-- After applying: `node scripts/check-db-exposure.mjs`.

begin;

create table if not exists public.user_plugin_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  -- Tool ids, e.g. {music,remix}. ≤ 32 entries (the studio has 16 pluggable tools), no NULL entry, ≤ 1 KB in total.
  disabled_tools  text[] not null default '{}'::text[]
                    check (cardinality(disabled_tools) <= 32
                           and array_position(disabled_tools, null) is null
                           and octet_length(array_to_string(disabled_tools, ',')) <= 1024),
  updated_at      timestamptz not null default now()
);

-- RLS: the owner reads their own row; nobody but service_role writes (service_role bypasses RLS).
alter table public.user_plugin_settings enable row level security;

drop policy if exists user_plugin_settings_owner_select on public.user_plugin_settings;
create policy user_plugin_settings_owner_select on public.user_plugin_settings
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.user_plugin_settings from anon;
revoke insert, update, delete, truncate on public.user_plugin_settings from authenticated;

-- ─── VERIFY — raise (rolling back the whole file) if a guarantee did not take ────────────────────────────────
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.user_plugin_settings'::regclass) then
    raise exception 'VERIFY FAILED — row level security is off on user_plugin_settings';
  end if;
  if has_table_privilege('anon', 'public.user_plugin_settings', 'SELECT')
     or has_table_privilege('anon', 'public.user_plugin_settings', 'INSERT')
     or has_table_privilege('anon', 'public.user_plugin_settings', 'UPDATE')
     or has_table_privilege('anon', 'public.user_plugin_settings', 'DELETE') then
    raise exception 'VERIFY FAILED — anon holds a privilege on user_plugin_settings';
  end if;
  if has_table_privilege('authenticated', 'public.user_plugin_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.user_plugin_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.user_plugin_settings', 'DELETE') then
    raise exception 'VERIFY FAILED — a client role can write user_plugin_settings (writes go through /api/plugins only)';
  end if;
  if not has_table_privilege('authenticated', 'public.user_plugin_settings', 'SELECT') then
    raise exception 'VERIFY FAILED — the owner cannot read their own plugin settings';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'user_plugin_settings'
       and (qual is null or btrim(qual) = 'true')
  ) then
    raise exception 'VERIFY FAILED — a user_plugin_settings policy lets every row through (an always-true qualifier)';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'user_plugin_settings' and cmd <> 'SELECT'
  ) then
    raise exception 'VERIFY FAILED — user_plugin_settings has a client write policy';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.user_plugin_settings'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%cardinality%'
  ) then
    raise exception 'VERIFY FAILED — the disabled_tools length cap is missing';
  end if;
  raise notice 'VERIFY OK — user_plugin_settings: owner-select only, client writes revoked, length cap present.';
end
$$;

commit;
