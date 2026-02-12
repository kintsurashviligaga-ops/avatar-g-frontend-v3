-- Avatar Builder Database Schema
-- Migration: 001_avatar_builder_schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- AVATARS TABLE
-- ============================================
CREATE TABLE public.avatars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Generation params
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    style_preset VARCHAR(100),
    body_type VARCHAR(50),
    pose VARCHAR(50),
    seed BIGINT,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
    progress INTEGER DEFAULT 0, -- 0-100
    error TEXT,
    
    -- Outputs
    image_url TEXT, -- main front view
    turnaround_urls TEXT[], -- array of side/back/3-4 views if generated
    thumbnail_url TEXT,
    
    -- Metadata
    provider VARCHAR(50), -- 'replicate', 'stability', etc.
    generation_time_ms INTEGER,
    cost_credits DECIMAL(10,4),
    is_favorite BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_avatars_user_id ON public.avatars(user_id);
CREATE INDEX idx_avatars_status ON public.avatars(status);
CREATE INDEX idx_avatars_created_at ON public.avatars(created_at DESC);

-- ============================================
-- WARDROBE ITEMS TABLE
-- ============================================
CREATE TABLE public.wardrobe_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Item details
    category VARCHAR(50) NOT NULL, -- 'top', 'bottom', 'shoes', 'glasses', 'hat', 'accessory'
    name VARCHAR(200),
    
    -- Storage
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    source_url TEXT, -- optional reference URL
    
    -- Metadata
    is_stock BOOLEAN DEFAULT false, -- true for built-in items
    tags TEXT[], -- style tags like 'casual', 'formal', 'sporty'
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_wardrobe_user_id ON public.wardrobe_items(user_id);
CREATE INDEX idx_wardrobe_category ON public.wardrobe_items(category);

-- ============================================
-- VOICE PROFILES TABLE
-- ============================================
CREATE TABLE public.voice_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Voice slot
    slot VARCHAR(1) NOT NULL CHECK (slot IN ('A', 'B', 'C')),
    name VARCHAR(100) NOT NULL,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, training, ready, failed
    progress INTEGER DEFAULT 0,
    error TEXT,
    
    -- Training data
    sample_urls TEXT[], -- array of voice sample file URLs
    consent_provided BOOLEAN NOT NULL DEFAULT false,
    consent_timestamp TIMESTAMPTZ,
    
    -- Provider data
    provider VARCHAR(50), -- 'elevenlabs', 'replicate', 'mock'
    model_ref TEXT, -- provider-specific model ID
    
    -- Metadata
    language VARCHAR(10), -- 'ka', 'en', 'ru'
    duration_seconds DECIMAL(10,2),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure only one voice per slot per user
    UNIQUE(user_id, slot)
);

-- Indexes
CREATE INDEX idx_voice_profiles_user_id ON public.voice_profiles(user_id);
CREATE INDEX idx_voice_profiles_status ON public.voice_profiles(status);

-- ============================================
-- TALK CLIPS TABLE
-- ============================================
CREATE TABLE public.talk_clips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    avatar_id UUID REFERENCES public.avatars(id) ON DELETE SET NULL,
    
    -- Input
    text TEXT NOT NULL,
    voice_slot VARCHAR(1) CHECK (voice_slot IN ('A', 'B', 'C', 'default')),
    language VARCHAR(10) NOT NULL, -- 'ka', 'en', 'ru'
    tone VARCHAR(50), -- 'neutral', 'calm', 'energetic', 'emotional'
    speed DECIMAL(3,2) DEFAULT 1.0, -- 0.5 - 2.0
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    error TEXT,
    
    -- Output
    audio_url TEXT,
    video_url TEXT, -- optional lip-synced video
    duration_seconds DECIMAL(10,2),
    
    -- Metadata
    provider VARCHAR(50),
    cost_credits DECIMAL(10,4),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_talk_clips_user_id ON public.talk_clips(user_id);
CREATE INDEX idx_talk_clips_avatar_id ON public.talk_clips(avatar_id);
CREATE INDEX idx_talk_clips_status ON public.talk_clips(status);

-- ============================================
-- JOBS TABLE (Universal async job tracker)
-- ============================================
CREATE TABLE public.jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Job type
    type VARCHAR(50) NOT NULL, -- 'generate_avatar', 'fit_outfit', 'train_voice', 'talk_clip'
    
    -- Input/Output
    input_json JSONB NOT NULL,
    output_json JSONB,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
    progress INTEGER DEFAULT 0, -- 0-100
    error TEXT,
    
    -- Related records
    related_id UUID, -- ID of related avatar, voice_profile, etc.
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    provider VARCHAR(50),
    retry_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX idx_jobs_type ON public.jobs(type);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_created_at ON public.jobs(created_at DESC);

-- ============================================
-- PRESETS TABLE (User-saved avatar presets)
-- ============================================
CREATE TABLE public.presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Preset details
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Saved configuration
    config_json JSONB NOT NULL, -- stores all avatar params + wardrobe selections
    
    -- Preview
    thumbnail_url TEXT,
    
    -- Metadata
    category VARCHAR(50), -- 'character', 'style', 'outfit'
    tags TEXT[],
    use_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_presets_user_id ON public.presets(user_id);
CREATE INDEX idx_presets_category ON public.presets(category);

-- ============================================
-- LIVE SESSIONS TABLE (For Live Creator Mode tracking)
-- ============================================
CREATE TABLE public.live_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Session details
    avatar_id UUID REFERENCES public.avatars(id) ON DELETE SET NULL,
    voice_slot VARCHAR(1), -- active voice during session
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, ended
    
    -- Stats
    duration_seconds INTEGER DEFAULT 0,
    character_switches INTEGER DEFAULT 0, -- how many times user switched voice/character
    
    -- Timestamps
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_live_sessions_user_id ON public.live_sessions(user_id);
CREATE INDEX idx_live_sessions_status ON public.live_sessions(status);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talk_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only access their own data

-- Avatars
CREATE POLICY "Users can view own avatars" ON public.avatars FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own avatars" ON public.avatars FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own avatars" ON public.avatars FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own avatars" ON public.avatars FOR DELETE USING (auth.uid() = user_id);

-- Wardrobe Items
CREATE POLICY "Users can view own wardrobe" ON public.wardrobe_items FOR SELECT USING (auth.uid() = user_id OR is_stock = true);
CREATE POLICY "Users can insert own wardrobe" ON public.wardrobe_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wardrobe" ON public.wardrobe_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wardrobe" ON public.wardrobe_items FOR DELETE USING (auth.uid() = user_id);

-- Voice Profiles
CREATE POLICY "Users can view own voices" ON public.voice_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own voices" ON public.voice_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own voices" ON public.voice_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own voices" ON public.voice_profiles FOR DELETE USING (auth.uid() = user_id);

-- Talk Clips
CREATE POLICY "Users can view own clips" ON public.talk_clips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clips" ON public.talk_clips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clips" ON public.talk_clips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clips" ON public.talk_clips FOR DELETE USING (auth.uid() = user_id);

-- Jobs
CREATE POLICY "Users can view own jobs" ON public.jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON public.jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own jobs" ON public.jobs FOR DELETE USING (auth.uid() = user_id);

-- Presets
CREATE POLICY "Users can view own presets" ON public.presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own presets" ON public.presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presets" ON public.presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own presets" ON public.presets FOR DELETE USING (auth.uid() = user_id);

-- Live Sessions
CREATE POLICY "Users can view own sessions" ON public.live_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.live_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.live_sessions FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_avatars_updated_at BEFORE UPDATE ON public.avatars FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_voice_profiles_updated_at BEFORE UPDATE ON public.voice_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_presets_updated_at BEFORE UPDATE ON public.presets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STORAGE BUCKETS (Create via Supabase Dashboard or API)
-- ============================================
-- Run these in Supabase SQL editor or via API:
-- 
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('wardrobe', 'wardrobe', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('voices', 'voices', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('talk-clips', 'talk-clips', true);
-- 
-- Storage Policies (users can upload to their own folders):
-- 
-- CREATE POLICY "Users can upload own avatars" ON storage.objects FOR INSERT WITH CHECK (
--   bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
-- );
-- 
-- CREATE POLICY "Users can upload own wardrobe" ON storage.objects FOR INSERT WITH CHECK (
--   bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = auth.uid()::text
-- );
-- 
-- CREATE POLICY "Users can upload own voices" ON storage.objects FOR INSERT WITH CHECK (
--   bucket_id = 'voices' AND (storage.foldername(name))[1] = auth.uid()::text
-- );
-- 
-- CREATE POLICY "Users can upload own talk-clips" ON storage.objects FOR INSERT WITH CHECK (
--   bucket_id = 'talk-clips' AND (storage.foldername(name))[1] = auth.uid()::text
-- );
