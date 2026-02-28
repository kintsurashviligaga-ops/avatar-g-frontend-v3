-- supabase/migrations/20260228400003_profiles_phone.sql
-- Add phone columns to existing profiles table

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_e164'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone_e164 text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_verified'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone_verified boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_verified_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone_verified_at timestamptz;
  END IF;
END $$;
