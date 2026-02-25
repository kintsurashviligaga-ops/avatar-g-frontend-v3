-- Wave 1: Avatar Builder assets + profile linkage
-- Created: 2026-02-24

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.avatar_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_goal TEXT NOT NULL CHECK (avatar_goal IN ('personal', 'business', 'team')),
  avatar_type TEXT NOT NULL CHECK (avatar_type IN ('scan', 'studio', 'stylized', 'fast')),
  input_method TEXT NOT NULL CHECK (input_method IN ('3d_upload', 'phone_scan', 'photo_set', 'video_capture', 'selfie_pack', 'text_to_avatar')),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('none', 'processing', 'ready', 'failed')),
  input_urls TEXT[] NOT NULL DEFAULT '{}',
  model_glb_url TEXT,
  poster_url TEXT,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS avatar_assets_user_id_idx ON public.avatar_assets(user_id);
CREATE INDEX IF NOT EXISTS avatar_assets_status_idx ON public.avatar_assets(status);
CREATE INDEX IF NOT EXISTS avatar_assets_created_at_idx ON public.avatar_assets(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    CREATE TABLE public.profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS core_avatar_id UUID REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avatar_status TEXT NOT NULL DEFAULT 'none' CHECK (avatar_status IN ('none', 'processing', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.avatar_assets_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS avatar_assets_set_updated_at ON public.avatar_assets;
CREATE TRIGGER avatar_assets_set_updated_at
  BEFORE UPDATE ON public.avatar_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.avatar_assets_set_updated_at();

ALTER TABLE public.avatar_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avatar_assets_select_own" ON public.avatar_assets;
CREATE POLICY "avatar_assets_select_own"
  ON public.avatar_assets
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "avatar_assets_insert_own" ON public.avatar_assets;
CREATE POLICY "avatar_assets_insert_own"
  ON public.avatar_assets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "avatar_assets_update_own" ON public.avatar_assets;
CREATE POLICY "avatar_assets_update_own"
  ON public.avatar_assets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "avatar_assets_delete_own" ON public.avatar_assets;
CREATE POLICY "avatar_assets_delete_own"
  ON public.avatar_assets
  FOR DELETE
  USING (auth.uid() = user_id);
