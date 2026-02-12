-- Avatar G - Avatars Persistence Table
-- Migration: Create avatars table for user-created avatar persistence
-- Date: 2026-02-12

-- Create avatars table
CREATE TABLE IF NOT EXISTS avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  model_url TEXT,
  preview_image_url TEXT,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Indexes for fast queries
  CHECK (owner_id IS NOT NULL AND owner_id != '')
);

-- Create indexes
CREATE INDEX IF NOT EXISTS avatars_owner_id_idx ON avatars(owner_id);
CREATE INDEX IF NOT EXISTS avatars_created_at_idx ON avatars(created_at DESC);
CREATE INDEX IF NOT EXISTS avatars_owner_created_idx ON avatars(owner_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read/insert their own avatars
CREATE POLICY "Allow read own avatars" ON avatars
  FOR SELECT
  USING (auth.uid()::text = owner_id OR auth.uid() IS NULL);

CREATE POLICY "Allow insert own avatars" ON avatars
  FOR INSERT
  WITH CHECK (auth.uid()::text = owner_id OR auth.uid() IS NULL);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_avatars_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER avatars_updated_at_trigger
BEFORE UPDATE ON avatars
FOR EACH ROW
EXECUTE FUNCTION update_avatars_updated_at();
