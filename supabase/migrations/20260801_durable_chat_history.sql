-- ============================================================================
-- supabase/migrations/20260801_durable_chat_history.sql
-- Durable, user-scoped chat history (sessions + messages) + Library read index.
-- ----------------------------------------------------------------------------
-- INTROSPECTED GROUND TRUTH (live project zwksnayknzggdcenqqxy, 2026-08-01):
--   public.chat_sessions  = id, user_id, created_at, is_deleted, deleted_at   -> 0 rows
--   public.chat_messages  = id, session_id, role, content, created_at         -> 0 rows
--   public.generation_jobs= full 20260523+20260627+20260704 shape             -> 286 rows
--   RLS verified ENFORCING on all three (anon SELECT generation_jobs -> 0 of 286;
--   anon INSERT chat_sessions / chat_messages -> 42501).
--
-- supabase/migrations/20260301_chat_sessions_messages.sql WAS NEVER APPLIED: a leaner
-- chat_sessions already existed, so its CREATE TABLE IF NOT EXISTS was a silent no-op.
-- Only migrations/007_chat_memory_and_trash.sql's two ALTERs (is_deleted, deleted_at)
-- landed -- and 007's own line 57 already noted the drift.
--
-- Consequence: lib/chat-history.ts writes session_id / title / updated_at / agent_id /
-- channel, none of which exist, so every createSession() and getConversations() returns
-- SQLSTATE 42703 and is swallowed by the fail-soft catch. Signed-in chat history has
-- ALWAYS been 100% localStorage. This migration ALTERS the live tables in place -- it
-- NEVER re-creates them -- so the code that is already deployed simply starts working.
--
-- IDEMPOTENT BY CONSTRUCTION: every statement is ADD COLUMN IF NOT EXISTS, a guarded
-- DO block, CREATE OR REPLACE, CREATE INDEX IF NOT EXISTS, or DROP ... IF EXISTS before
-- CREATE. Safe to run by hand any number of times. The DDL channels in this project are
-- unreliable (see the DELIVERY note at the bottom), so re-runnability is load-bearing.
-- ============================================================================

BEGIN;

-- ─── 0. shared updated_at trigger fn (20260301 never ran, so assume absent) ──
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $fn$;

-- ─── 1. chat_sessions: id -> session_id ─────────────────────────────────────
-- The whole app addresses this PK as `session_id`. The table holds 0 rows and the
-- ONLY foreign key pointing at it (chat_messages.session_id) follows a RENAME
-- automatically, so this is a zero-data-risk rename rather than a duplicate column.
-- Guarded both ways => re-running is a no-op.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'chat_sessions'
               AND column_name = 'id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'chat_sessions'
               AND column_name = 'session_id')
  THEN
    ALTER TABLE public.chat_sessions RENAME COLUMN id TO session_id;
  END IF;
END $do$;

-- ─── 2. chat_sessions: the columns the sidebar actually needs ───────────────
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS title      text;
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS agent_id   text NOT NULL DEFAULT 'agent-g';
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS channel    text NOT NULL DEFAULT 'web';
-- (is_deleted / deleted_at already landed via migration 007; re-asserted for isolation.)
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- updated_at with a ONE-SHOT backfill inside the guard, so a re-run never stomps
-- live activity timestamps back to created_at.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'chat_sessions'
                   AND column_name = 'updated_at')
  THEN
    ALTER TABLE public.chat_sessions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    UPDATE public.chat_sessions SET updated_at = created_at;
  END IF;
END $do$;

DROP TRIGGER IF EXISTS chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 3. chat_messages: metadata (media payloads) + user_id ──────────────────
-- metadata carries the generated-media payload of a bubble (image/video/audio URLs,
-- jobId, batch tiles). Without it a resumed conversation restores TEXT ONLY and every
-- picture the conversation produced is gone from the transcript.
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- user_id denormalised from the parent session. Required by app/api/account/export
-- and app/api/account/delete, which filter chat_messages by user_id today and 42703.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'chat_messages'
                   AND column_name = 'user_id')
  THEN
    ALTER TABLE public.chat_messages
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.chat_messages m
       SET user_id = s.user_id
      FROM public.chat_sessions s
     WHERE s.session_id = m.session_id;
  END IF;
END $do$;

-- DEFENSIVE (I could not read the live CHECK -- no pg_policies/pg_constraint access
-- without a Management token). lib/chat-history.saveMessage's signature allows 'system'.
-- Drops any role-related CHECK and re-asserts the superset. Idempotent.
DO $do$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.chat_messages'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.chat_messages DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_role_check CHECK (role IN ('system','user','assistant'));
END $do$;

-- ─── 4. keep the sidebar ordered by LAST ACTIVITY, not creation ─────────────
-- saveMessage() never touches the parent session, so without this the Today/Yesterday
-- grouping would bury a thread the user just replied to. SECURITY DEFINER so the bump
-- is not blocked by RLS when the write comes from the browser client.
CREATE OR REPLACE FUNCTION public.chat_messages_touch_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.chat_sessions
     SET updated_at = now()
   WHERE session_id = NEW.session_id;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS chat_messages_touch_session_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_session_trg
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_touch_session();

-- Fill chat_messages.user_id from the session so NO client change is required.
CREATE OR REPLACE FUNCTION public.chat_messages_fill_user_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT cs.user_id INTO NEW.user_id
      FROM public.chat_sessions cs
     WHERE cs.session_id = NEW.session_id;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS chat_messages_fill_user_id_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_fill_user_id_trg
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_fill_user_id();

-- ─── 5. indexes ─────────────────────────────────────────────────────────────
-- The history list: .eq(user_id).order(updated_at DESC).limit(50)
CREATE INDEX IF NOT EXISTS chat_sessions_user_updated_idx
  ON public.chat_sessions (user_id, updated_at DESC);
-- The same list once it filters out trashed chats (see the lib/chat-history.ts edit).
CREATE INDEX IF NOT EXISTS chat_sessions_user_active_updated_idx
  ON public.chat_sessions (user_id, updated_at DESC)
  WHERE is_deleted = false;
-- Trash bin: .eq(user_id).eq(is_deleted,true).order(deleted_at DESC)
CREATE INDEX IF NOT EXISTS chat_sessions_user_trashed_idx
  ON public.chat_sessions (user_id, deleted_at DESC)
  WHERE is_deleted = true;
-- Transcript load: .eq(session_id).order(created_at ASC)
CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON public.chat_messages (session_id, created_at);
-- GDPR export / account delete by user.
CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx
  ON public.chat_messages (user_id, created_at DESC);

-- Library read path: app/api/studio/library GET is
--   .eq(user_id).eq(status,'completed').order(created_at DESC).range(...)
-- The existing generation_jobs indexes both sort by updated_at, so this query adds a
-- Sort node today. Partial index => index-ordered scan. 286 rows, builds instantly.
CREATE INDEX IF NOT EXISTS generation_jobs_user_completed_created_idx
  ON public.generation_jobs (user_id, created_at DESC)
  WHERE status = 'completed';

-- ─── 6. RLS: owner-only, scoped to auth.uid() ───────────────────────────────
-- RLS is ALREADY enabled and enforcing on both tables (verified: anon INSERT -> 42501).
-- Re-asserted so this file stands alone, then the canonical policies are re-created by
-- name. DROP-then-CREATE (the 20260523_generation_jobs convention) rather than the
-- IF NOT EXISTS guard, so re-running actually re-asserts the definition instead of
-- leaving a stale one in place.
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Legacy names from supabase/migrations/20260301_chat_sessions_messages.sql. That file
-- never ran here, but drop them anyway so a later apply of 20260301 cannot layer a
-- second permissive policy on top (multiple permissive policies OR together).
DROP POLICY IF EXISTS "users_own_chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "users_own_chat_messages" ON public.chat_messages;

DROP POLICY IF EXISTS chat_sessions_owner_all ON public.chat_sessions;
CREATE POLICY chat_sessions_owner_all
  ON public.chat_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Messages are owned transitively through the session. WITH CHECK is spelled out
-- explicitly: it is what lets the BROWSER client's saveMessage() insert succeed.
DROP POLICY IF EXISTS chat_messages_owner_all ON public.chat_messages;
CREATE POLICY chat_messages_owner_all
  ON public.chat_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_sessions cs
                  WHERE cs.session_id = chat_messages.session_id
                    AND cs.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_sessions cs
                  WHERE cs.session_id = chat_messages.session_id
                    AND cs.user_id = auth.uid()));

-- Table-level grants are already present (an anon INSERT reached RLS rather than
-- "permission denied for table"), but GRANT is idempotent and cheap to re-assert.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;

COMMENT ON TABLE public.chat_sessions IS
  'Durable per-user chat threads. session_id is the PK the app addresses (renamed from id 2026-08-01). updated_at is bumped by chat_messages_touch_session_trg so the sidebar groups by last activity.';
COMMENT ON COLUMN public.chat_messages.metadata IS
  'Media payload of the bubble (generated image/video/audio URLs, jobId, batch tiles) so a resumed transcript restores pictures, not just text.';

COMMIT;

-- ─── 7. VERIFY (run these after; they mutate nothing) ───────────────────────
-- Expect exactly: agent_id, channel, created_at, deleted_at, is_deleted, session_id,
--                 title, updated_at, user_id
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'chat_sessions'
 ORDER BY column_name;

-- Expect: content, created_at, id, metadata, role, session_id, user_id
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'chat_messages'
 ORDER BY column_name;

-- Expect rowsecurity = true on both, and EXACTLY ONE policy per table. If any EXTRA
-- policy shows up here, read it before trusting the isolation -- multiple permissive
-- policies are OR'd, so a stray one can widen access. (I could not enumerate these
-- remotely: the Management API returns Unauthorized with the current access token.)
SELECT c.relname, c.relrowsecurity, p.policyname, p.cmd, p.roles, p.qual, p.with_check
  FROM pg_class c
  LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
 WHERE c.relname IN ('chat_sessions','chat_messages','generation_jobs')
 ORDER BY c.relname, p.policyname;

-- Expect the 5 chat indexes + generation_jobs_user_completed_created_idx.
SELECT tablename, indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename IN ('chat_sessions','chat_messages','generation_jobs')
 ORDER BY tablename, indexname;

-- ─── DELIVERY ───────────────────────────────────────────────────────────────
-- BOTH programmatic DDL channels are DEAD right now (probed live 2026-08-01):
--   * Management API  POST https://api.supabase.com/v1/projects/zwksnayknzggdcenqqxy
--                          /database/query  with SUPABASE_ACCESS_TOKEN -> {"message":"Unauthorized"}
--   * exec_sql RPC    POST $SUPABASE_URL/rest/v1/rpc/exec_sql          -> PGRST202 (function absent)
-- So POST /api/admin/run-migration and scripts/apply-*.mjs will BOTH 502 today.
-- => Paste this file into the Supabase dashboard SQL editor (project zwksnayknzggdcenqqxy).
-- To restore the scripted path: mint a Personal Access Token at
-- supabase.com/dashboard/account/tokens, set SUPABASE_ACCESS_TOKEN in .env.local AND in
-- Vercel, then `curl -X POST -H "x-admin-key: $MIGRATION_RUN_KEY" -H 'content-type:
-- application/json' -d '{"file":"20260801_durable_chat_history.sql"}'
-- https://myavatar.ge/api/admin/run-migration` works (next.config.js:128 already traces
-- ./supabase/migrations/** into that lambda).