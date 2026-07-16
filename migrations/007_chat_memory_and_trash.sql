-- Migration: 007_chat_memory_and_trash.sql
-- VECTOR 3 — cross-chat persistent user memory (user_profile_metadata)
-- VECTOR 8 — soft-delete / Trash Bin for chat_sessions (is_deleted + deleted_at)
-- Idempotent + RLS, matching the 006 conventions. Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── VECTOR 3: user_profile_metadata ─────────────────────────────────────────
-- One row per (user, key). `category` groups facts (e.g. 'personal_bio',
-- 'preferred_bot_name'). Upserted on conflict (user_id, key).
CREATE TABLE IF NOT EXISTS public.user_profile_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profile_metadata_user_key_uniq'
  ) THEN
    ALTER TABLE public.user_profile_metadata
      ADD CONSTRAINT user_profile_metadata_user_key_uniq UNIQUE (user_id, key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profile_metadata_user_id
  ON public.user_profile_metadata(user_id);

ALTER TABLE public.user_profile_metadata ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profile_metadata'
      AND policyname = 'Users manage own profile metadata'
  ) THEN
    CREATE POLICY "Users manage own profile metadata" ON public.user_profile_metadata
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── VECTOR 8: soft-delete columns on chat_sessions ──────────────────────────
-- ADD COLUMN IF NOT EXISTS is inherently idempotent.
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Fast "active vs trashed" listing per user.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_deleted
  ON public.chat_sessions(user_id, is_deleted, updated_at DESC);

-- Optional: a helper to permanently purge chats trashed for >30 days. The app also
-- purges on Trash-Bin open (best-effort), so this is only needed if you schedule it
-- via pg_cron: SELECT cron.schedule('purge-trashed-chats','0 3 * * *',$$SELECT public.purge_expired_trashed_chats()$$);
CREATE OR REPLACE FUNCTION public.purge_expired_trashed_chats()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.chat_sessions
  WHERE is_deleted = true
    AND deleted_at IS NOT NULL
    AND deleted_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
