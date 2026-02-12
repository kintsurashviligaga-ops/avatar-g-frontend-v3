// Extended types for Music & Video Platform

import type { Language, VoiceSlot, JobStatus } from './avatar-builder';

// ============================================
// MUSIC/TRACK TYPES
// ============================================

export type TrackStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type VersionType = 'original' | 'remix' | 'extended' | 'cover';
export type LyricsMode = 'auto' | 'custom' | 'instrumental';

export interface Track {
  id: string;
  user_id: string;
  title?: string;
  description?: string;
  prompt: string;
  lyrics?: string;
  genre?: string;
  mood?: string;
  era?: string;
  tempo?: string;
  language?: Language | 'instrumental';
  style_tags?: string[];
  use_custom_vocals: boolean;
  voice_slots?: VoiceSlot[];
  status: TrackStatus;
  progress: number;
  error?: string;
  audio_url?: string;
  cover_url?: string;
  waveform_data?: WaveformData;
  duration_seconds?: number;
  provider?: string;
  generation_time_ms?: number;
  cost_credits?: number;
  is_favorite: boolean;
  play_count: number;
  parent_track_id?: string;
  version_type?: VersionType;
  created_at: string;
  updated_at: string;
}

export interface WaveformData {
  peaks: number[]; // Array of amplitude values
  duration: number;
  sample_rate: number;
}

// ============================================
// VIDEO TYPES
// ============================================

export type VideoMode = 'avatar_performance' | 'image_animation' | 'mixed';
export type AvatarAction = 'singing' | 'dancing' | 'talking' | 'static';
export type BackgroundType = 'generated' | 'uploaded' | 'gradient' | 'solid';
export type Resolution = '720p' | '1080p' | '4K';

export interface VideoClip {
  id: string;
  user_id: string;
  track_id?: string;
  avatar_id?: string;
  title?: string;
  description?: string;
  video_mode: VideoMode;
  scenes?: VideoScene[];
  avatar_action?: AvatarAction;
  enable_lip_sync: boolean;
  background_type?: BackgroundType;
  background_asset_id?: string;
  background_config?: BackgroundConfig;
  show_lyrics: boolean;
  lyrics_style?: LyricsStyle;
  transitions?: TransitionConfig;
  filters?: FilterConfig;
  status: JobStatus;
  progress: number;
  error?: string;
  render_logs?: string;
  video_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  resolution?: Resolution;
  file_size_mb?: number;
  provider?: string;
  render_time_ms?: number;
  cost_credits?: number;
  is_favorite: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface VideoScene {
  id: string;
  type: 'avatar' | 'image' | 'text';
  asset_id?: string; // avatar_id or media_asset_id
  duration: number; // seconds
  start_time: number;
  effects?: SceneEffect[];
  transition_in?: TransitionType;
  transition_out?: TransitionType;
}

export interface SceneEffect {
  type: 'zoom' | 'pan' | 'fade' | 'blur' | 'glow' | 'beat_sync';
  intensity: number; // 0-1
  params?: Record<string, any>;
}

export type TransitionType = 'fade' | 'slide' | 'zoom' | 'dissolve' | 'wipe' | 'none';

export interface TransitionConfig {
  default: TransitionType;
  duration: number; // seconds
}

export interface FilterConfig {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  vignette?: number;
  film_grain?: number;
}

export interface BackgroundConfig {
  color?: string;
  gradient?: GradientConfig;
  image_url?: string;
  animation?: 'static' | 'slow_pan' | 'zoom' | 'pulse';
}

export interface GradientConfig {
  colors: string[];
  angle: number;
  animated: boolean;
}

export interface LyricsStyle {
  font_family: string;
  font_size: number;
  color: string;
  stroke_color?: string;
  stroke_width?: number;
  position: 'top' | 'center' | 'bottom';
  animation: 'fade' | 'slide' | 'bounce' | 'none';
  background_opacity: number;
}

// ============================================
// PROJECT TYPES
// ============================================

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  color?: string;
  avatar_ids?: string[];
  track_ids?: string[];
  video_ids?: string[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// MEDIA ASSET TYPES
// ============================================

export type MediaAssetType = 'image' | 'video' | 'audio';

export interface MediaAsset {
  id: string;
  user_id: string;
  name?: string;
  type: MediaAssetType;
  file_url: string;
  thumbnail_url?: string;
  file_size_bytes?: number;
  mime_type?: string;
  width?: number;
  height?: number;
  duration_seconds?: number;
  tags?: string[];
  created_at: string;
}

// ============================================
// API REQUEST/RESPONSE TYPES (Music)
// ============================================

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
  voice_slots?: VoiceSlot[];
  generate_cover?: boolean;
}

export interface GenerateTrackResponse {
  job_id: string;
  track_id: string;
  status: TrackStatus;
}

export interface RemixTrackRequest {
  track_id: string;
  new_prompt: string;
  keep_vocals?: boolean;
  style_tags?: string[];
}

export interface ExtendTrackRequest {
  track_id: string;
  extend_from_timestamp: number; // seconds
  additional_prompt?: string;
  target_duration: number; // seconds
}

export interface GenerateCoverRequest {
  track_id?: string;
  prompt?: string;
  style?: string;
}

// ============================================
// API REQUEST/RESPONSE TYPES (Video)
// ============================================

export interface GenerateVideoRequest {
  track_id?: string;
  avatar_id?: string;
  video_mode: VideoMode;
  title?: string;
  scenes?: VideoScene[];
  avatar_action?: AvatarAction;
  enable_lip_sync?: boolean;
  background_type?: BackgroundType;
  background_config?: BackgroundConfig;
  show_lyrics?: boolean;
  lyrics_style?: LyricsStyle;
  resolution?: Resolution;
  transitions?: TransitionConfig;
  filters?: FilterConfig;
}

export interface GenerateVideoResponse {
  job_id: string;
  video_id: string;
  status: JobStatus;
}

export interface AnimateImageRequest {
  media_asset_id: string;
  animation_type: 'subtle' | 'zoom' | 'pan' | 'beat_sync';
  intensity: number;
  duration: number;
}

// ============================================
// UI STATE TYPES
// ============================================

export interface MusicStudioState {
  mode: 'create' | 'library';
  activeTab: 'generate' | 'lyrics' | 'style' | 'voice';
  
  // Generation config
  prompt: string;
  lyrics: string;
  lyricsMode: LyricsMode;
  genre?: string;
  mood?: string;
  era?: string;
  tempo?: string;
  language: Language | 'instrumental';
  styleTags: string[];
  
  // Voice config
  useCustomVocals: boolean;
  selectedVoiceSlots: VoiceSlot[];
  duetMode: boolean;
  
  // Generation state
  generating: boolean;
  jobId?: string;
  progress: number;
  
  // Generated tracks
  variations: Track[];
  selectedTrack?: Track;
  
  // Player state
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

export interface VideoStudioState {
  mode: 'create' | 'library';
  step: 'select_assets' | 'configure' | 'preview' | 'render';
  
  // Selected assets
  selectedTrack?: Track;
  selectedAvatar?: string;
  selectedImages: MediaAsset[];
  
  // Video config
  videoMode: VideoMode;
  scenes: VideoScene[];
  avatarAction: AvatarAction;
  enableLipSync: boolean;
  backgroundType: BackgroundType;
  backgroundConfig?: BackgroundConfig;
  showLyrics: boolean;
  lyricsStyle?: LyricsStyle;
  resolution: Resolution;
  
  // Generation state
  rendering: boolean;
  jobId?: string;
  progress: number;
  renderLogs: string[];
  
  // Preview
  previewUrl?: string;
  generatedVideo?: VideoClip;
}

export interface LibraryState {
  filter: 'all' | 'avatars' | 'tracks' | 'videos';
  sortBy: 'recent' | 'name' | 'favorite';
  searchQuery: string;
  selectedProject?: Project;
  
  // Data
  avatars: any[];
  tracks: Track[];
  videos: VideoClip[];
  projects: Project[];
  
  // Loading
  loading: boolean;
  error?: string;
}

// ============================================
// STYLE PRESETS
// ============================================

export interface MusicStylePreset {
  id: string;
  name: string;
  description: string;
  genre: string;
  mood: string;
  era?: string;
  tempo?: string;
  style_tags: string[];
  example_prompt?: string;
}

export interface VideoStylePreset {
  id: string;
  name: string;
  description: string;
  video_mode: VideoMode;
  background_type: BackgroundType;
  transitions: TransitionConfig;
  filters: FilterConfig;
  lyrics_style?: LyricsStyle;
}

// ============================================
// PROVIDER TYPES (Music)
// ============================================

export interface MusicGenerationResult {
  audio_url: string;
  duration_seconds: number;
  waveform_data?: WaveformData;
  metadata?: Record<string, any>;
}

export interface CoverArtResult {
  image_url: string;
  metadata?: Record<string, any>;
}

// ============================================
// VIDEO RENDERING TYPES
// ============================================

export interface VideoRenderConfig {
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  codec: string;
  format: string;
}

export interface RenderProgress {
  stage: 'setup' | 'audio_processing' | 'frame_generation' | 'video_encoding' | 'finalizing';
  progress: number; // 0-100
  currentFrame?: number;
  totalFrames?: number;
  estimatedTimeRemaining?: number; // seconds
}
