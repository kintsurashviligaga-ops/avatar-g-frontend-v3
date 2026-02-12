// Comprehensive Avatar G Platform Types - Database Models

import type { Database } from './supabase';

// ============================================
// LANGUAGE & ENUMS
// ============================================
export type Language = 'ka' | 'en' | 'ru';
export type VoiceSlot = 'A' | 'B' | 'C';
export type JobStatus = 'queued' | 'processing' | 'done' | 'error';
export type JobType =
  | 'generate_avatar'
  | 'train_voice'
  | 'generate_song'
  | 'remix_song'
  | 'extend_song'
  | 'generate_cover'
  | 'generate_video'
  | 'animate_image'
  | 'generate_talk_clip';

// ============================================
// AVATAR TYPES
// ============================================
export interface Avatar {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  preview_image_url?: string;
  model_ref?: string;
  metadata_json?: AvatarMetadata;
  created_at: string;
  updated_at: string;
}

export interface AvatarMetadata {
  style?: string;
  prompt?: string;
  scan_info?: {
    scanning_date?: string;
    scan_method?: 'ai_generated' | 'photo_scan' | 'live_capture';
  };
  voice_profile?: {
    slot?: VoiceSlot;
    model_ref?: string;
  };
  appearance?: Record<string, string>;
  [key: string]: any;
}

// ============================================
// VOICE PROFILE TYPES
// ============================================
export interface VoiceProfile {
  id: string;
  user_id: string;
  name: string;
  slot: VoiceSlot;
  language: Language;
  status: 'pending' | 'processing' | 'ready' | 'error';
  model_ref?: string;
  voice_characteristics?: VoiceCharacteristics;
  training_samples_count: number;
  created_at: string;
  updated_at: string;
}

export interface VoiceCharacteristics {
  pitch?: number; // 0-1 range
  tone?: string; // warm, bright, dark, neutral
  speed?: number; // 0-1 range
  accent?: string;
  [key: string]: any;
}

// ============================================
// TRACK (MUSIC/SONG) TYPES
// ============================================
export type TrackStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'error';
export type LyricsMode = 'auto' | 'custom' | 'instrumental';
export type VersionType = 'original' | 'remix' | 'extended' | 'cover';

export interface Track {
  id: string;
  user_id: string;
  title?: string;
  description?: string;
  prompt: string;
  lyrics?: string;
  lyrics_mode: LyricsMode;
  
  // Style & Parameters
  genre?: string;
  mood?: string;
  era?: string;
  tempo?: string;
  language: Language | 'instrumental';
  style_tags: string[];
  use_custom_vocals: boolean;
  voice_slots?: Record<VoiceSlot, VoiceSlotConfig>;
  
  // Provider & Generation
  provider: string;
  status: TrackStatus;
  progress: number;
  error?: string;
  generation_time_ms?: number;
  cost_credits?: number;
  
  // Assets
  audio_url?: string;
  cover_url?: string;
  waveform_data?: WaveformData;
  
  // Metadata
  duration_seconds?: number;
  bpm?: number;
  key?: string;
  
  // State
  is_favorite: boolean;
  play_count: number;
  
  // Versioning
  parent_track_id?: string;
  version_type?: VersionType;
  
  // Organization
  project_id?: string;
  avatar_id?: string;
  
  created_at: string;
  updated_at: string;
}

export interface VoiceSlotConfig {
  name: string;
  enabled: boolean;
  voice_profile_id?: string;
}

export interface WaveformData {
  peaks: number[];
  duration: number;
  sample_rate: number;
}

// ============================================
// VIDEO CLIP TYPES
// ============================================
export type VideoMode = 'avatar_performance' | 'image_animation' | 'mixed';
export type AvatarAction = 'singing' | 'dancing' | 'talking' | 'static';
export type BackgroundType = 'generated' | 'uploaded' | 'gradient' | 'solid';
export type Resolution = '720p' | '1080p' | '4K';
export type AspectRatio = '16:9' | '9:16' | '1:1';
export type CameraTemplate =
  | 'dolly_in'
  | 'dolly_out'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'orbit'
  | 'handheld'
  | 'drone'
  | 'zoom'
  | 'rack_focus'
  | 'static';
export type LightingStyle = 'studio' | 'cinematic' | 'neon' | 'noir' | 'daylight';

export interface VideoClip {
  id: string;
  user_id: string;
  title?: string;
  description?: string;
  prompt?: string;
  
  // Associations
  avatar_id?: string;
  track_id?: string;
  
  // Configuration
  video_mode: VideoMode;
  avatar_action?: AvatarAction;
  enable_lip_sync: boolean;
  show_lyrics: boolean;
  lyrics_style?: LyricsStyleConfig;
  
  // Background
  background_type?: BackgroundType;
  background_asset_id?: string;
  background_config?: Record<string, any>;
  
  // Camera & Technical
  camera_template: CameraTemplate;
  camera_motion_intensity: number;
  shot_type?: 'wide' | 'medium' | 'close-up';
  lighting_style: LightingStyle;
  aspect_ratio: AspectRatio;
  fps: number;
  resolution: Resolution;
  
  // Timeline
  scenes: VideoScene[];
  
  // Generation
  provider: string;
  status: JobStatus;
  progress: number;
  error?: string;
  render_logs?: string;
  render_time_ms?: number;
  cost_credits?: number;
  
  // Output
  video_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  file_size_mb?: number;
  
  // Engagement
  is_favorite: boolean;
  view_count: number;
  
  created_at: string;
  updated_at: string;
}

export interface LyricsStyleConfig {
  color?: string;
  font?: string;
  position?: 'top' | 'bottom' | 'center';
  animation?: 'fade' | 'slide' | 'typewriter';
  [key: string]: any;
}

export interface VideoScene {
  id: string;
  type: 'avatar' | 'image' | 'text';
  asset_id?: string;
  duration: number;
  effects?: VideoEffect[];
  transitions?: TransitionConfig;
  filters?: FilterConfig;
}

export interface VideoEffect {
  id: string;
  type: string;
  params: Record<string, any>;
}

export interface TransitionConfig {
  type?: string;
  duration?: number;
}

export interface FilterConfig {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  [key: string]: any;
}

// ============================================
// JOB TYPES
// ============================================
export interface Job {
  id: string;
  user_id: string;
  type: JobType;
  input_json: Record<string, any>;
  output_json?: Record<string, any>;
  status: JobStatus;
  progress: number;
  error?: string;
  avatar_id?: string;
  track_id?: string;
  video_clip_id?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// MEDIA ASSET TYPES
// ============================================
export type MediaAssetType = 'image' | 'video' | 'audio';
export type MediaCategory =
  | 'background'
  | 'texture'
  | 'effect'
  | 'overlay'
  | 'other';

export interface MediaAsset {
  id: string;
  user_id: string;
  type: MediaAssetType;
  name: string;
  description?: string;
  asset_url: string;
  thumbnail_url?: string;
  file_size_bytes?: number;
  duration_seconds?: number;
  width?: number;
  height?: number;
  format?: string;
  tags: string[];
  category?: MediaCategory;
  created_at: string;
  updated_at: string;
}

// ============================================
// PROJECT TYPES
// ============================================
export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  cover_image_url?: string;
  status: 'active' | 'archived' | 'deleted';
  metadata_json?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

// Avatar Requests
export interface SaveAvatarRequest {
  title: string;
  description?: string;
  preview_image_url?: string;
  metadata: AvatarMetadata;
}

export interface SaveAvatarResponse {
  avatar: Avatar;
}

// Track/Music Requests
export interface GenerateTrackRequest {
  prompt: string;
  lyrics?: string;
  lyrics_mode?: LyricsMode;
  genre?: string;
  mood?: string;
  era?: string;
  tempo?: string;
  language?: Language | 'instrumental';
  style_tags?: string[];
  use_custom_vocals?: boolean;
  voice_slots?: Record<VoiceSlot, string>;
  avatar_id?: string;
  project_id?: string;
}

export interface RemixTrackRequest {
  track_id: string;
  new_prompt?: string;
  keep_beat?: boolean;
  keep_vocals?: boolean;
}

export interface ExtendTrackRequest {
  track_id: string;
  target_duration_seconds: number;
}

// Video Requests
export interface GenerateVideoRequest {
  title?: string;
  prompt?: string;
  avatar_id: string;
  track_id: string;
  video_mode: VideoMode;
  avatar_action?: AvatarAction;
  enable_lip_sync?: boolean;
  camera_template?: CameraTemplate;
  resolution?: Resolution;
  aspect_ratio?: AspectRatio;
  background_type?: BackgroundType;
  background_image_url?: string;
}

export interface AnimateImageRequest {
  image_url: string;
  track_id?: string;
  camera_template?: CameraTemplate;
  duration_seconds?: number;
  resolution?: Resolution;
}

// Voice Training Request
export interface TrainVoiceRequest {
  slot: VoiceSlot;
  language: Language;
  name: string;
  // sample audio file upload handled separately
}

// Job Poll Request
export interface JobPollResponse {
  job: Job;
  resource?: Track | VideoClip | Avatar;
}

// ============================================
// MUSIC STUDIO STYLE PRESET
// ============================================
export interface MusicStylePreset {
  id: string;
  name: string;
  genre: string;
  mood: string;
  era: string;
  tempo: string;
  style_tags: string[];
  description?: string;
}

export const DEFAULT_MUSIC_PRESETS: MusicStylePreset[] = [
  {
    id: 'georgian-pop',
    name: 'Georgian Pop',
    genre: 'pop',
    mood: 'energetic',
    era: 'modern',
    tempo: 'upbeat',
    style_tags: ['georgian', 'vocal', 'modern'],
    description: 'Modern Georgian pop with contemporary production'
  },
  {
    id: 'georgian-hiphop',
    name: 'Georgian Hip-Hop',
    genre: 'hip-hop',
    mood: 'urban',
    era: 'modern',
    tempo: 'steady',
    style_tags: ['georgian', 'rap', 'urban'],
    description: 'Georgian hip-hop with urban beats'
  },
  {
    id: 'georgian-acoustic',
    name: 'Georgian Acoustic',
    genre: 'acoustic',
    mood: 'emotional',
    era: 'timeless',
    tempo: 'slow',
    style_tags: ['georgian', 'acoustic', 'ballad'],
    description: 'Acoustic Georgian ballads with traditional elements'
  },
  {
    id: 'georgian-electronic',
    name: 'Georgian Electronic',
    genre: 'electronic',
    mood: 'uplifting',
    era: 'futuristic',
    tempo: 'fast',
    style_tags: ['georgian', 'electronic', 'synth'],
    description: 'Electronic music with Georgian vocal samples'
  }
];

// ============================================
// REELS PRESETS
// ============================================
export interface ReelPreset {
  id: string;
  name_key: string; // i18n key
  duration: number; // in seconds
  aspect_ratio: AspectRatio;
  template_type: 'business_ad' | 'cinematic' | 'minimal_clean' | 'noir_premium';
  description_key: string;
}

export const REELS_PRESETS: ReelPreset[] = [
  {
    id: 'tiktok-5s',
    name_key: 'reels.tiktok_5s',
    duration: 5,
    aspect_ratio: '9:16',
    template_type: 'minimal_clean',
    description_key: 'reels.tiktok_5s_desc'
  },
  {
    id: 'reels-15s',
    name_key: 'reels.instagram_15s',
    duration: 15,
    aspect_ratio: '9:16',
    template_type: 'cinematic',
    description_key: 'reels.instagram_15s_desc'
  },
  {
    id: 'youtube-shorts-30s',
    name_key: 'reels.youtube_30s',
    duration: 30,
    aspect_ratio: '9:16',
    template_type: 'business_ad',
    description_key: 'reels.youtube_30s_desc'
  },
  {
    id: 'youtube-horizontal-16',
    name_key: 'reels.youtube_horizontal',
    duration: 60,
    aspect_ratio: '16:9',
    template_type: 'cinematic',
    description_key: 'reels.youtube_horizontal_desc'
  },
  {
    id: 'square-ad-1x1',
    name_key: 'reels.square_ad',
    duration: 15,
    aspect_ratio: '1:1',
    template_type: 'noir_premium',
    description_key: 'reels.square_ad_desc'
  }
];
