-- Avatar G - Onboarding Wizard fields on public.avatars
-- Created: 2026-05-17
--
-- The existing public.avatars table (001_avatar_builder_schema.sql) is
-- image-generation oriented (prompt, image_url, status, ...). The onboarding
-- wizard needs to store a user-chosen persona: name, personality, voice_id
-- and system_prompt. We extend the existing table additively so we never
-- replace or break image-generation data already present.

-- Allow rows created by the wizard (which have no prompt) to coexist with
-- generator rows (which do). Existing rows are untouched.
ALTER TABLE public.avatars
  ALTER COLUMN prompt DROP NOT NULL;

-- Persona columns (all nullable; the wizard fills name + personality + voice_id).
ALTER TABLE public.avatars
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.avatars
  ADD COLUMN IF NOT EXISTS personality TEXT;

ALTER TABLE public.avatars
  ADD COLUMN IF NOT EXISTS voice_id TEXT;

ALTER TABLE public.avatars
  ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Soft check on personality values written by the wizard (allow NULL for
-- pre-existing image-gen rows). Drop first so re-runs are safe.
ALTER TABLE public.avatars
  DROP CONSTRAINT IF EXISTS avatars_personality_check;
ALTER TABLE public.avatars
  ADD CONSTRAINT avatars_personality_check
  CHECK (personality IS NULL OR personality IN ('friendly','professional','funny','custom'));

-- A user can have many image-gen avatars, but only ONE persona row (the row
-- created by the wizard). Enforced via a partial unique index keyed on
-- user_id where name IS NOT NULL. Image-gen rows (name IS NULL) are exempt.
DROP INDEX IF EXISTS avatars_user_persona_unique_idx;
CREATE UNIQUE INDEX avatars_user_persona_unique_idx
  ON public.avatars (user_id)
  WHERE name IS NOT NULL;
