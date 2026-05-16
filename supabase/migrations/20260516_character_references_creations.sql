-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: character_references + user_creations
-- Adds character consistency system and output gallery
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. character_references ─────────────────────────────────────────────────
-- Stores named visual characters that users can reuse across generations
CREATE TABLE IF NOT EXISTS public.character_references (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  slug        TEXT NOT NULL CHECK (slug ~ '^[a-zA-Z0-9_-]+$'),
  image_url   TEXT NOT NULL,
  thumbnail_url TEXT,
  description TEXT,
  style_tags  TEXT[] DEFAULT '{}',
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS character_references_user_idx
  ON public.character_references(user_id, created_at DESC);

-- ─── 2. user_creations (output gallery) ──────────────────────────────────────
-- Persists every generated media item with metadata for the gallery
CREATE TABLE IF NOT EXISTS public.user_creations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id      UUID REFERENCES public.agent_g_tasks(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('image','video','audio','avatar','text','code')),
  service      TEXT NOT NULL,  -- 'image', 'music', 'voice', 'video', 'avatar' etc.
  title        TEXT,
  prompt       TEXT,
  url          TEXT,           -- direct media URL (external CDN or Supabase storage)
  thumbnail_url TEXT,
  duration_seconds FLOAT,      -- for audio/video
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  credits_used INTEGER NOT NULL DEFAULT 0,
  is_public    BOOLEAN NOT NULL DEFAULT false,
  share_token  TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_creations_user_kind_idx
  ON public.user_creations(user_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS user_creations_share_token_idx
  ON public.user_creations(share_token);
CREATE INDEX IF NOT EXISTS user_creations_task_idx
  ON public.user_creations(task_id) WHERE task_id IS NOT NULL;

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.character_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_creations       ENABLE ROW LEVEL SECURITY;

-- character_references: full CRUD for owner
CREATE POLICY "char_ref_owner_all" ON public.character_references
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_creations: owner can do everything
CREATE POLICY "creations_owner_all" ON public.user_creations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_creations: public share — anyone can SELECT if is_public = true
CREATE POLICY "creations_public_read" ON public.user_creations
  FOR SELECT USING (is_public = true);

-- ─── 4. Updated-at trigger for character_references ─────────────────────────
DROP TRIGGER IF EXISTS character_references_updated_at ON public.character_references;
CREATE TRIGGER character_references_updated_at
  BEFORE UPDATE ON public.character_references
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
