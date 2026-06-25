-- Avatar G — notifications table (PHASE 3 Task 3)
-- =================================================
-- A simple per-user notification feed for the top-bar bell. Additive + idempotent
-- (IF NOT EXISTS). RLS: a user sees + mutates ONLY their own rows; inserts come
-- from the service role (server) or the user themselves.
--
-- Apply with `supabase db push` or paste into the Supabase dashboard SQL editor.

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,              -- 'video' | 'music' | 'image' | 'credits_low' | 'payment'
  message     TEXT NOT NULL,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Owner-only read.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Owner-only update (mark read).
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Owner-only insert (the client can file its own completion notices; the service
-- role bypasses RLS for server-side events like payment success).
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
CREATE POLICY notifications_insert_own ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.notifications IS 'Per-user top-bar notification feed (video/music/image done · credits low · payment).';
