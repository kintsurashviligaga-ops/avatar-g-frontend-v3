-- Music & Video Platform Extension
-- Migration: 002_music_video_schema

-- ============================================
-- TRACKS TABLE (Music/Songs)
-- ============================================
CREATE TABLE public.tracks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Track details
    title VARCHAR(200),
    description TEXT,
    prompt TEXT NOT NULL,
    lyrics TEXT,
    
    -- Style & configuration
    genre VARCHAR(100),
    mood VARCHAR(100),
    era VARCHAR(100),
    tempo VARCHAR(50),
    language VARCHAR(10), -- 'ka', 'en', 'ru', 'instrumental'
    style_tags TEXT[], -- array of style chips
    
    -- Generation config
    use_custom_vocals BOOLEAN DEFAULT false,
    voice_slots TEXT[], -- Array of voice slots used ['A', 'B', 'C']
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
    progress INTEGER DEFAULT 0,
    error TEXT,
    
    -- Outputs
    audio_url TEXT,
    cover_url TEXT,
    waveform_data JSONB,
    duration_seconds DECIMAL(10,2),
    
    -- Metadata
    provider VARCHAR(50),
    generation_time_ms INTEGER,
    cost_credits DECIMAL(10,4),
    is_favorite BOOLEAN DEFAULT false,
    play_count INTEGER DEFAULT 0,
    
    -- Versioning (for remix/extend)
    parent_track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
    version_type VARCHAR(50), -- 'original', 'remix', 'extended', 'cover'
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tracks_user_id ON public.tracks(user_id);
CREATE INDEX idx_tracks_status ON public.tracks(status);
CREATE INDEX idx_tracks_created_at ON public.tracks(created_at DESC);
CREATE INDEX idx_tracks_parent_id ON public.tracks(parent_track_id);
CREATE INDEX idx_tracks_genre ON public.tracks(genre);

-- ============================================
-- VIDEO CLIPS TABLE
-- ============================================
CREATE TABLE public.video_clips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Core references
    track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
    avatar_id UUID REFERENCES public.avatars(id) ON DELETE SET NULL,
    
    -- Video details
    title VARCHAR(200),
    description TEXT,
    
    -- Configuration
    video_mode VARCHAR(50) NOT NULL, -- 'avatar_performance', 'image_animation', 'mixed'
    
    -- Scene configuration
    scenes JSONB, -- Array of scenes: [{ type, asset_id, duration, effects }]
    
    -- Avatar settings (if avatar mode)
    avatar_action VARCHAR(50), -- 'singing', 'dancing', 'talking', 'static'
    enable_lip_sync BOOLEAN DEFAULT true,
    
    -- Background
    background_type VARCHAR(50), -- 'generated', 'uploaded', 'gradient', 'solid'
    background_asset_id UUID,
    background_config JSONB,
    
    -- Effects
    show_lyrics BOOLEAN DEFAULT false,
    lyrics_style JSONB,
    transitions JSONB,
    filters JSONB,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    error TEXT,
    render_logs TEXT,
    
    -- Output
    video_url TEXT,
    thumbnail_url TEXT,
    duration_seconds DECIMAL(10,2),
    resolution VARCHAR(20), -- '1080p', '720p', '4K'
    file_size_mb DECIMAL(10,2),
    
    -- Metadata
    provider VARCHAR(50),
    render_time_ms INTEGER,
    cost_credits DECIMAL(10,4),
    is_favorite BOOLEAN DEFAULT false,
    view_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_video_clips_user_id ON public.video_clips(user_id);
CREATE INDEX idx_video_clips_track_id ON public.video_clips(track_id);
CREATE INDEX idx_video_clips_avatar_id ON public.video_clips(avatar_id);
CREATE INDEX idx_video_clips_status ON public.video_clips(status);
CREATE INDEX idx_video_clips_created_at ON public.video_clips(created_at DESC);

-- ============================================
-- PROJECTS TABLE (Organize work)
-- ============================================
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Project details
    name VARCHAR(200) NOT NULL,
    description TEXT,
    color VARCHAR(20), -- hex color for visual organization
    
    -- Assets (references to tracks, avatars, videos)
    avatar_ids UUID[],
    track_ids UUID[],
    video_ids UUID[],
    
    -- Metadata
    is_archived BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_projects_created_at ON public.projects(created_at DESC);

-- ============================================
-- MEDIA ASSETS TABLE (Uploaded images for video)
-- ============================================
CREATE TABLE public.media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Asset details
    name VARCHAR(200),
    type VARCHAR(50) NOT NULL, -- 'image', 'video', 'audio'
    
    -- Storage
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    
    -- Metadata
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    width INTEGER,
    height INTEGER,
    duration_seconds DECIMAL(10,2), -- for video/audio
    
    -- Tags
    tags TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_media_assets_user_id ON public.media_assets(user_id);
CREATE INDEX idx_media_assets_type ON public.media_assets(type);

-- ============================================
-- UPDATE JOBS TABLE (add new job types)
-- ============================================

-- Add new job types to existing jobs table
ALTER TABLE public.jobs 
    DROP CONSTRAINT IF EXISTS jobs_type_check;

ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_type_check 
    CHECK (type IN (
        'generate_avatar',
        'fit_outfit',
        'train_voice',
        'talk_clip',
        'generate_track',
        'remix_track',
        'extend_track',
        'generate_video',
        'generate_cover',
        'analyze_face'
    ));

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Tracks policies
CREATE POLICY "Users can view own tracks" ON public.tracks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tracks" ON public.tracks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tracks" ON public.tracks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tracks" ON public.tracks FOR DELETE USING (auth.uid() = user_id);

-- Video clips policies
CREATE POLICY "Users can view own videos" ON public.video_clips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own videos" ON public.video_clips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own videos" ON public.video_clips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own videos" ON public.video_clips FOR DELETE USING (auth.uid() = user_id);

-- Projects policies
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Media assets policies
CREATE POLICY "Users can view own assets" ON public.media_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assets" ON public.media_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assets" ON public.media_assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own assets" ON public.media_assets FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at triggers
CREATE TRIGGER update_tracks_updated_at BEFORE UPDATE ON public.tracks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_clips_updated_at BEFORE UPDATE ON public.video_clips 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STORAGE BUCKETS (Create via Supabase Dashboard)
-- ============================================

-- INSERT INTO storage.buckets (id, name, public) VALUES 
--   ('generated-audio', 'generated-audio', true),
--   ('covers', 'covers', true),
--   ('video-clips', 'video-clips', true),
--   ('media-assets', 'media-assets', false);

-- ============================================
-- FUNCTIONS FOR CLEANUP
-- ============================================

-- Function to clean up old jobs
CREATE OR REPLACE FUNCTION cleanup_old_jobs()
RETURNS void AS $$
BEGIN
    DELETE FROM public.jobs
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND status IN ('completed', 'failed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update play count
CREATE OR REPLACE FUNCTION increment_track_play_count(track_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.tracks
    SET play_count = play_count + 1
    WHERE id = track_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update video view count
CREATE OR REPLACE FUNCTION increment_video_view_count(video_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.video_clips
    SET view_count = view_count + 1
    WHERE id = video_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
