-- Avatar G Platform - Core Tables Migration
-- Created: Feb 2026

-- ============================================
-- AVATARS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  preview_image_url TEXT,
  model_ref TEXT,
  metadata_json JSONB DEFAULT '{}',
  -- metadata can contain: style, prompt, scan_info, voice_profile, appearance
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS avatars_user_id_idx ON avatars(user_id);
CREATE INDEX IF NOT EXISTS avatars_created_at_idx ON avatars(created_at DESC);

-- Enable RLS for avatars
ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;
CREATE POLICY avatars_user_policy ON avatars
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- VOICE PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slot VARCHAR(1) NOT NULL, -- A, B, or C
  language TEXT DEFAULT 'ka', -- Georgian by default
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, ready, error
  model_ref TEXT,
  voice_characteristics JSONB DEFAULT '{}', -- pitch, tone, speed, accent
  training_samples_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, slot)
);

CREATE INDEX IF NOT EXISTS voice_profiles_user_id_idx ON voice_profiles(user_id);

ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY voice_profiles_user_policy ON voice_profiles
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRACKS TABLE (Music/Songs)
-- ============================================
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  prompt TEXT NOT NULL,
  lyrics TEXT,
  lyrics_mode VARCHAR(20) DEFAULT 'auto', -- auto, custom, instrumental
  
  -- Style & Parameters
  genre TEXT,
  mood TEXT,
  era TEXT,
  tempo TEXT,
  language TEXT DEFAULT 'ka',
  style_tags TEXT[] DEFAULT '{}',
  use_custom_vocals BOOLEAN DEFAULT FALSE,
  voice_slots JSONB DEFAULT '{}', -- { "A": {"name": "...", "enabled": true}, ... }
  
  -- Provider & Generation
  provider TEXT DEFAULT 'mock',
  status VARCHAR(50) DEFAULT 'pending', -- queued, processing, completed, error
  progress INTEGER DEFAULT 0, -- 0-100
  error TEXT,
  generation_time_ms INTEGER,
  cost_credits INTEGER DEFAULT 0,
  
  -- Assets
  audio_url TEXT,
  cover_url TEXT,
  waveform_data JSONB, -- { "peaks": [0.1, 0.2, ...], "duration": 180, "sample_rate": 44100 }
  
  -- Metadata
  duration_seconds INTEGER,
  bpm INTEGER,
  key TEXT,
  
  -- State
  is_favorite BOOLEAN DEFAULT FALSE,
  play_count INTEGER DEFAULT 0,
  
  -- Versioning
  parent_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  version_type VARCHAR(20), -- original, remix, extended, cover
  
  -- Project Association
  project_id UUID,
  
  -- Avatar Association
  avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tracks_user_id_idx ON tracks(user_id);
CREATE INDEX IF NOT EXISTS tracks_status_idx ON tracks(status);
CREATE INDEX IF NOT EXISTS tracks_created_at_idx ON tracks(created_at DESC);
CREATE INDEX IF NOT EXISTS tracks_avatar_id_idx ON tracks(avatar_id);
CREATE INDEX IF NOT EXISTS tracks_parent_track_id_idx ON tracks(parent_track_id);

ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tracks_user_policy ON tracks
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- VIDEO CLIPS TABLE (Videos/Reels)
-- ============================================
CREATE TABLE IF NOT EXISTS video_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  prompt TEXT,
  
  -- Associations
  avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  
  -- Video Configuration
  video_mode VARCHAR(50) DEFAULT 'avatar_performance', -- avatar_performance, image_animation, mixed
  avatar_action VARCHAR(50), -- singing, dancing, talking, static
  enable_lip_sync BOOLEAN DEFAULT FALSE,
  show_lyrics BOOLEAN DEFAULT FALSE,
  lyrics_style JSONB, -- { "color": "...", "font": "...", "position": "..." }
  
  -- Background Configuration
  background_type VARCHAR(50), -- generated, uploaded, gradient, solid
  background_asset_id UUID,
  background_config JSONB,
  
  -- Camera & Technical
  camera_template VARCHAR(100), -- dolly_in, pan, orbit, handheld, drone, zoom, etc
  camera_motion_intensity FLOAT DEFAULT 0.5, -- 0-1
  shot_type VARCHAR(50), -- wide, medium, close-up
  lighting_style VARCHAR(50), -- studio, cinematic, neon, noir, daylight
  aspect_ratio VARCHAR(10) DEFAULT '16:9', -- 16:9, 9:16, 1:1
  fps INTEGER DEFAULT 30,
  resolution VARCHAR(20) DEFAULT '1080p', -- 720p, 1080p, 4K
  
  -- Scenes (Timeline)
  scenes JSONB DEFAULT '[]', -- [{ id, type, asset_id, duration, effects, transitions, filters }]
  
  -- Generation & Rendering
  provider VARCHAR(50) DEFAULT 'mock',
  status VARCHAR(50) DEFAULT 'pending', -- queued, processing, completed, error
  progress INTEGER DEFAULT 0,
  error TEXT,
  render_logs TEXT,
  render_time_ms INTEGER,
  cost_credits INTEGER DEFAULT 0,
  
  -- Output Assets
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds FLOAT,
  file_size_mb INTEGER,
  
  -- Engagement
  is_favorite BOOLEAN DEFAULT FALSE,
  view_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS video_clips_user_id_idx ON video_clips(user_id);
CREATE INDEX IF NOT EXISTS video_clips_status_idx ON video_clips(status);
CREATE INDEX IF NOT EXISTS video_clips_created_at_idx ON video_clips(created_at DESC);
CREATE INDEX IF NOT EXISTS video_clips_avatar_id_idx ON video_clips(avatar_id);
CREATE INDEX IF NOT EXISTS video_clips_track_id_idx ON video_clips(track_id);

ALTER TABLE video_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY video_clips_user_policy ON video_clips
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- JOBS TABLE (Async Processing)
-- ============================================
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Job Type
  type VARCHAR(100) NOT NULL, -- generate_avatar, train_voice, generate_song, remix_song, extend_song, 
                               -- generate_cover, generate_video, animate_image, etc
  
  -- Input & Output
  input_json JSONB NOT NULL,
  output_json JSONB,
  
  -- Status Tracking
  status VARCHAR(50) DEFAULT 'queued', -- queued, processing, done, error
  progress INTEGER DEFAULT 0, -- 0-100
  error TEXT,
  
  -- Resource Associations
  avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  video_clip_id UUID REFERENCES video_clips(id) ON DELETE SET NULL,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_type_idx ON jobs(type);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at DESC);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_user_policy ON jobs
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- MEDIA ASSETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  type VARCHAR(50) NOT NULL, -- image, video, audio
  name TEXT NOT NULL,
  description TEXT,
  
  -- Asset URL & Metadata
  asset_url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size_bytes INTEGER,
  duration_seconds FLOAT, -- for video/audio
  
  -- Dimensions & Format
  width INTEGER, -- for images/videos
  height INTEGER,
  format VARCHAR(20), -- jpg, png, mp4, mp3, etc
  
  -- Tagging & Organization
  tags TEXT[] DEFAULT '{}',
  category VARCHAR(50), -- background, texture, effect, overlay, etc
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_assets_user_id_idx ON media_assets(user_id);
CREATE INDEX IF NOT EXISTS media_assets_type_idx ON media_assets(type);
CREATE INDEX IF NOT EXISTS media_assets_category_idx ON media_assets(category);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_assets_user_policy ON media_assets
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- PROJECTS TABLE (Organization)
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  
  -- Metadata
  status VARCHAR(50) DEFAULT 'active', -- active, archived, deleted
  metadata_json JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_user_policy ON projects
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRIGGER: Update updated_at timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER avatars_updated_at_trigger BEFORE UPDATE ON avatars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER voice_profiles_updated_at_trigger BEFORE UPDATE ON voice_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tracks_updated_at_trigger BEFORE UPDATE ON tracks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER video_clips_updated_at_trigger BEFORE UPDATE ON video_clips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER jobs_updated_at_trigger BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER media_assets_updated_at_trigger BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER projects_updated_at_trigger BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STORAGE BUCKETS & POLICIES
-- ============================================
-- Note: Run these via Supabase dashboard or with separate commands:
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('avatar-previews', 'avatar-previews', true),
--   ('voice-samples', 'voice-samples', false),
--   ('generated-audio', 'generated-audio', true),
--   ('covers', 'covers', true),
--   ('generated-video', 'generated-video', true),
--   ('source-images', 'source-images', false),
--   ('media-assets', 'media-assets', true),
--   ('talk-clips', 'talk-clips', true);
