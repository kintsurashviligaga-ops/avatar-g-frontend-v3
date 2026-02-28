-- Migration: Avatar storage buckets + RLS
-- Creates the three private buckets the wizard + pipeline need.
-- If you are running Supabase locally, run:  supabase db reset

-- ─────────── 1. Buckets ────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatar-uploads',  'avatar-uploads',  false),
  ('avatar-outputs',  'avatar-outputs',  false),
  ('avatar-posters',  'avatar-posters',  false)
ON CONFLICT (id) DO NOTHING;

-- ─────────── 2. RLS policies ───────────────────────────
-- Users may only interact with objects under their own user-id folder.

-- avatar-uploads: owner can insert & select
CREATE POLICY "avatar-uploads: user insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatar-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatar-uploads: user select own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatar-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- avatar-outputs: owner can select (pipeline writes via service role)
CREATE POLICY "avatar-outputs: user select own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatar-outputs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- avatar-posters: owner can select (pipeline writes via service role)
CREATE POLICY "avatar-posters: user select own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatar-posters'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
