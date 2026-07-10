-- =============================================================================
-- MIGRATIONS_TO_APPLY_avatars_bucket.sql  —  paste-ready storage config (A1-F3)
-- =============================================================================
-- WHY THIS FILE EXISTS: profile-photo upload (POST /api/profile/avatar) uploads via
-- the SERVICE ROLE to a public storage bucket named `avatars` and writes the public
-- URL to profiles.avatar_url. If that bucket does not exist (or isn't public) in a
-- given project, every upload 500s and the header/profile photo silently never
-- sticks — the exact "Change photo does nothing" symptom. The app is now fail-soft
-- (it reverts the optimistic preview and shows a toast), but the photo can't persist
-- until this bucket exists.
--
-- The Supabase Management/DDL channel is dead in this env (PAT 401, no DB password),
-- so apply this BY HAND — do NOT let an agent run it against prod.
--
-- HOW TO APPLY (1 minute, no CLI):
--   1. Supabase dashboard -> project zwksnayknzggdcenqqxy -> SQL Editor -> New query
--   2. Paste this ENTIRE file, Run.
--   3. Idempotent (upsert): safe to run more than once; drops/deletes NOTHING.
--
-- Verify after running:
--   select id, name, public from storage.buckets where id = 'avatars';
--   -- expect one row: avatars | avatars | true
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1/1 · storage bucket `avatars` (public read).
--   • public = true  -> the returned public URL (…/object/public/avatars/…) is
--     served by the storage CDN without any per-object SELECT policy.
--   • Uploads use the SERVICE ROLE (the API route is the gate), which bypasses RLS,
--     so no per-user INSERT/UPDATE policy is required for the current flow.
--   • The route stores objects at avatars/{userId}/avatar-<ts>.<ext> and cache-busts
--     the URL with ?v=<ts>, so no stale-avatar policy work is needed either.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- OPTIONAL (belt-and-suspenders): explicit anonymous read policy on this bucket's
-- objects. A public bucket already serves reads via the public URL, so this is only
-- needed if bucket-level public serving is ever disabled. Safe + idempotent.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_public_read'
  ) then
    create policy "avatars_public_read"
      on storage.objects for select
      using (bucket_id = 'avatars');
  end if;
end $$;
