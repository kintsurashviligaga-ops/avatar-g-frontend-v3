-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 20260802_support_live_chat.sql — SUPPORT LIVE CHAT (support_chats + support_messages)
--
-- Apply BY HAND in the Supabase SQL Editor. The Management API / CLI DDL channels in this project
-- are dead (same note as 20260706_pricing_config.sql), so this file is written to be pasted, and
-- re-pasted, safely: every statement is idempotent and a second run is a no-op.
--
-- ⚠️⚠️ READ BEFORE YOU RENAME ANYTHING — THE TABLE IS NOT CALLED `messages` ⚠️⚠️
-- The brief asked for `support_chats` + `messages`. **`public.messages` ALREADY EXISTS.**
--   · defined at supabase/migrations/20260228200002_projects_conversations.sql:108 with
--     `conversation_id uuid NOT NULL REFERENCES public.conversations(id)`;
--   · written live by app/api/agents/chat/route.ts:57;
--   · ALREADY in the realtime publication (20260228200003_realtime_enable.sql).
-- Consequences of obeying the brief literally, all three of which are silent:
--   1. `CREATE TABLE IF NOT EXISTS public.messages (...)` NO-OPS against the existing table. You get
--      no error and no new columns. This is exactly how 20260301_chat_sessions_messages.sql was lost.
--   2. Every support insert then fails: `conversation_id` is NOT NULL with an unsatisfiable FK, and
--      there is no chat_id column.
--   3. A widget subscribing to Realtime table `messages` would receive OTHER USERS' agent-chat rows.
-- Therefore: `public.support_messages`. Non-negotiable. Do not "fix" the name back.
--
-- SHAPE OF THE FEATURE
--   support_chats     — one row per support conversation, owned by an auth.users id.
--   support_messages  — the transcript. sender is 'user' or 'admin'.
--   A partial UNIQUE index enforces AT MOST ONE non-closed chat per user. That is what lets every
--   user-facing API route address "my chat" WITHOUT ever accepting a chat id from the client — the
--   single cheapest defence against IDOR and chat-id enumeration.
--   An AFTER INSERT trigger on support_messages bumps the parent's last_message_at / preview and the
--   unread counters, so the admin inbox sorts by real activity with no N+1 and no client arithmetic.
--
-- RLS POSTURE (deliberate, and tighter than "user may read/write their own")
--   authenticated gets SELECT ONLY, scoped to their own rows. There is NO insert/update policy and
--   NO insert/update GRANT for users. Reason: lib/api/rate-limit.ts lives in the API layer and is
--   unreachable from a browser `supabase.from().insert()`, so a direct-insert path would be an
--   unrate-limited spam faucet on a public widget (the same hole app/api/upload/sign/route.ts had).
--   Reads stay direct because Realtime postgres_changes needs a SELECT policy to deliver rows.
--   The service role bypasses RLS — that is how every admin route in this repo reads and writes.
--   Postgres knows nothing about the ADMIN_EMAILS allowlist, so there is deliberately NO admin policy.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── shared updated_at trigger fn (already exists repo-wide; re-asserted so this file stands alone) ──
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── PARENT ────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_chats (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  subject             text CHECK (subject IS NULL OR char_length(subject) <= 200),
  -- Denormalised so the inbox list is ONE query. Maintained by the trigger below, never by the app.
  last_message_at     timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  last_sender         text CHECK (last_sender IS NULL OR last_sender IN ('user', 'admin')),
  message_count       integer NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  unread_for_admin    integer NOT NULL DEFAULT 0 CHECK (unread_for_admin >= 0),
  unread_for_user     integer NOT NULL DEFAULT 0 CHECK (unread_for_user >= 0),
  -- Audit: WHICH admin closed it. The credits feature was criticised for dropping the actor; do not
  -- repeat that here. Email, not uuid, because admin identity in this project IS an email allowlist.
  closed_at           timestamptz,
  closed_by_email     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Additive re-run safety: if an earlier partial version of this table exists, top it up.
ALTER TABLE public.support_chats ADD COLUMN IF NOT EXISTS subject              text;
ALTER TABLE public.support_chats ADD COLUMN IF NOT EXISTS last_message_preview text;
ALTER TABLE public.support_chats ADD COLUMN IF NOT EXISTS last_sender          text;
ALTER TABLE public.support_chats ADD COLUMN IF NOT EXISTS message_count        integer NOT NULL DEFAULT 0;
ALTER TABLE public.support_chats ADD COLUMN IF NOT EXISTS unread_for_admin     integer NOT NULL DEFAULT 0;
ALTER TABLE public.support_chats ADD COLUMN IF NOT EXISTS unread_for_user      integer NOT NULL DEFAULT 0;
ALTER TABLE public.support_chats ADD COLUMN IF NOT EXISTS closed_at            timestamptz;
ALTER TABLE public.support_chats ADD COLUMN IF NOT EXISTS closed_by_email      text;

COMMENT ON TABLE  public.support_chats IS
  'Support live chat conversations. One non-closed chat per user (enforced by support_chats_one_open_per_user). Writes are SERVICE-ROLE ONLY; authenticated users get SELECT on their own rows so Realtime can deliver.';
COMMENT ON COLUMN public.support_chats.unread_for_admin IS
  'Messages from the user the support side has not opened. Reset by the admin transcript route.';
COMMENT ON COLUMN public.support_chats.unread_for_user  IS
  'Admin replies the user has not seen. Drives the launcher badge. Reset by POST /api/support/chat/read.';

-- ── CHILD ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id      uuid NOT NULL REFERENCES public.support_chats(id) ON DELETE CASCADE,
  sender       text NOT NULL CHECK (sender IN ('user', 'admin')),
  -- HARD length ceiling at the DB, not only in zod. An unbounded text column on a public widget is a
  -- storage/egress DoS: 4000 chars is ~8x the longest realistic support message.
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- WHO actually wrote it. author_id is the auth user for 'user' rows AND for admin rows (admins are
  -- real accounts); author_email additionally pins the admin actor for the audit trail.
  author_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email text,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS author_id    uuid;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS author_email text;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS read_at      timestamptz;

COMMENT ON TABLE public.support_messages IS
  'Support transcript. NOT public.messages — that name is taken by the agent-chat table (20260228200002) and is already in the realtime publication. Body is plain text and MUST be rendered as text (no HTML, no markdown, no linkify).';

-- ── INDEXES — each one is written against the exact query it serves ────────────────────────────────
-- Admin inbox, default view: open queue newest-activity-first.
CREATE INDEX IF NOT EXISTS support_chats_open_activity_idx
  ON public.support_chats (last_message_at DESC)
  WHERE status <> 'closed';

-- Admin inbox with an explicit status filter (?status=closed / all).
CREATE INDEX IF NOT EXISTS support_chats_status_activity_idx
  ON public.support_chats (status, last_message_at DESC);

-- Polling delta: GET /api/admin/support/chats?since=<iso>.
CREATE INDEX IF NOT EXISTS support_chats_updated_idx
  ON public.support_chats (updated_at DESC);

-- "My chat" resolution for every user-facing route, and the user's own history list.
CREATE INDEX IF NOT EXISTS support_chats_user_activity_idx
  ON public.support_chats (user_id, last_message_at DESC);

-- THE IDOR GUARD. At most one live chat per user ⇒ the user API never needs a client-supplied id.
CREATE UNIQUE INDEX IF NOT EXISTS support_chats_one_open_per_user
  ON public.support_chats (user_id)
  WHERE status <> 'closed';

-- Unread badge count for the admin tab (partial: tiny index, hot query every 15s).
CREATE INDEX IF NOT EXISTS support_chats_admin_unread_idx
  ON public.support_chats (last_message_at DESC)
  WHERE unread_for_admin > 0 AND status <> 'closed';

-- Transcript fetch, ascending, and the `?after=<iso>` polling-fallback tail.
CREATE INDEX IF NOT EXISTS support_messages_chat_created_idx
  ON public.support_messages (chat_id, created_at ASC);

-- ── TRIGGERS ──────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'support_chats_set_updated_at') THEN
    CREATE TRIGGER support_chats_set_updated_at
      BEFORE UPDATE ON public.support_chats
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Parent bump. Deliberately does NOT touch `status`: auto-reopening a closed chat would collide with
-- support_chats_one_open_per_user the moment the user already had a newer chat. Reopening is an
-- explicit admin PATCH, and a user writing after a close gets a NEW chat from the API.
CREATE OR REPLACE FUNCTION public.support_touch_chat()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_chats
     SET last_message_at      = NEW.created_at,
         last_message_preview = left(NEW.body, 140),
         last_sender          = NEW.sender,
         message_count        = message_count + 1,
         unread_for_admin     = unread_for_admin + CASE WHEN NEW.sender = 'user'  THEN 1 ELSE 0 END,
         unread_for_user      = unread_for_user  + CASE WHEN NEW.sender = 'admin' THEN 1 ELSE 0 END,
         updated_at           = now()
   WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'support_messages_touch_chat') THEN
    CREATE TRIGGER support_messages_touch_chat
      AFTER INSERT ON public.support_messages
      FOR EACH ROW EXECUTE FUNCTION public.support_touch_chat();
  END IF;
END $$;

-- ── RLS ───────────────────────────────────────────────────────────────────────────────────────────
-- House style: DROP-then-CREATE named policies. `IF NOT EXISTS` guards leave a stale definition in
-- place, and multiple permissive policies OR together — which is how a tightening silently fails.
ALTER TABLE public.support_chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_chats_owner_select ON public.support_chats;
CREATE POLICY support_chats_owner_select ON public.support_chats
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS support_messages_owner_select ON public.support_messages;
CREATE POLICY support_messages_owner_select ON public.support_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_chats sc
     WHERE sc.id = support_messages.chat_id
       AND sc.user_id = auth.uid()
  ));

-- NO INSERT/UPDATE/DELETE policy and NO such grant, on purpose (see header). All writes go through
-- the rate-limited, authenticated API routes using the service-role client.
REVOKE ALL ON public.support_chats    FROM anon, authenticated;
REVOKE ALL ON public.support_messages FROM anon, authenticated;
GRANT SELECT ON public.support_chats    TO authenticated;
GRANT SELECT ON public.support_messages TO authenticated;

-- ── REALTIME ──────────────────────────────────────────────────────────────────────────────────────
-- GUARDED add. The unguarded `alter publication ... add table` idiom in
-- 20260228300002_business_realtime.sql throws on re-run and breaks the whole paste.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_chats;
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY — run this block after the paste. It RAISES on anything missing, so a silent no-op
-- (the 20260301 failure mode) cannot go unnoticed. It writes nothing.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_missing text := '';
  v_cols    int;
  v_pol     int;
  v_idx     int;
  v_pub     int;
  v_trg     int;
BEGIN
  IF to_regclass('public.support_chats')    IS NULL THEN v_missing := v_missing || 'support_chats '; END IF;
  IF to_regclass('public.support_messages') IS NULL THEN v_missing := v_missing || 'support_messages '; END IF;
  IF v_missing <> '' THEN RAISE EXCEPTION 'VERIFY FAILED — missing table(s): %', v_missing; END IF;

  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'support_chats'
     AND column_name IN ('id','user_id','status','subject','last_message_at','last_message_preview',
                         'last_sender','message_count','unread_for_admin','unread_for_user',
                         'closed_at','closed_by_email','created_at','updated_at');
  IF v_cols <> 14 THEN RAISE EXCEPTION 'VERIFY FAILED — support_chats has % of 14 expected columns', v_cols; END IF;

  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'support_messages'
     AND column_name IN ('id','chat_id','sender','body','author_id','author_email','read_at','created_at');
  IF v_cols <> 8 THEN RAISE EXCEPTION 'VERIFY FAILED — support_messages has % of 8 expected columns', v_cols; END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_chats'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_messages'::regclass) THEN
    RAISE EXCEPTION 'VERIFY FAILED — RLS is not enabled on both support tables';
  END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('support_chats','support_messages');
  IF v_pol <> 2 THEN
    RAISE EXCEPTION 'VERIFY FAILED — expected exactly 2 policies (owner SELECT on each), found %. A stray permissive policy ORs itself in and widens access.', v_pol;
  END IF;

  SELECT count(*) INTO v_idx FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN ('support_chats_open_activity_idx','support_chats_status_activity_idx',
                       'support_chats_updated_idx','support_chats_user_activity_idx',
                       'support_chats_one_open_per_user','support_chats_admin_unread_idx',
                       'support_messages_chat_created_idx');
  IF v_idx <> 7 THEN RAISE EXCEPTION 'VERIFY FAILED — % of 7 expected indexes present', v_idx; END IF;

  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgname IN ('support_chats_set_updated_at','support_messages_touch_chat');
  IF v_trg <> 2 THEN RAISE EXCEPTION 'VERIFY FAILED — % of 2 expected triggers present', v_trg; END IF;

  SELECT count(*) INTO v_pub FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename IN ('support_chats','support_messages');
  IF v_pub <> 2 THEN RAISE EXCEPTION 'VERIFY FAILED — support tables in realtime publication: % of 2', v_pub; END IF;

  RAISE NOTICE 'VERIFY OK — support_chats + support_messages: columns, RLS (2 owner-SELECT policies, no write policy), 7 indexes, 2 triggers, realtime publication.';
  RAISE NOTICE 'REMINDER: public.messages is the UNRELATED agent-chat table. Nothing here touches it.';
END $$;

-- Optional sanity probe, run as a NORMAL signed-in user (not service role), expected: 0 rows / error.
--   select count(*) from public.support_chats;                  -- 0 unless you own a chat
--   insert into public.support_messages(chat_id,sender,body)    -- must FAIL: no insert policy/grant
--     values (gen_random_uuid(),'admin','x');