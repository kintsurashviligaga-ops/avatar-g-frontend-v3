// Music Generation Provider Interfaces

import type {
  MusicGenerationResult,
  CoverArtResult,
  LyricsMode,
  Language,
  VoiceSlot
} from '@/types/music-video';

// ============================================
// MUSIC GENERATION PROVIDER
// ============================================

export interface MusicProviderInput {
  prompt: string;
  lyrics?: string;
  lyrics_mode?: LyricsMode;
  genre?: string;
  mood?: string;
  era?: string;
  tempo?: string;
  language?: Language | 'instrumental';
  style_tags?: string[];
  duration?: number; // target duration in seconds
  seed?: number;
}

export interface IMusicProvider {
  name: string;
  generate(input: MusicProviderInput): Promise<MusicGenerationResult>;
  extend?(track_url: string, from_timestamp: number, target_duration: number): Promise<MusicGenerationResult>;
  remix?(track_url: string, new_prompt: string, keep_vocals: boolean): Promise<MusicGenerationResult>;
  isAvailable(): boolean;
}

// ============================================
// VOCAL PROVIDER (For custom singing voice)
// ============================================

export interface VocalProviderInput {
  audio_url: string; // instrumental track
  lyrics: string;
  voice_model_refs: string[]; // trained voice model IDs
  language: Language;
  duet_mode?: boolean;
  harmony_mix?: number; // 0-1, how much to blend voices
}

export interface VocalResult {
  audio_url: string;
  duration_seconds: number;
  metadata?: Record<string, any>;
}

export interface IVocalProvider {
  name: string;
  addVocals(input: VocalProviderInput): Promise<VocalResult>;
  isAvailable(): boolean;
}

// ============================================
// COVER ART GENERATION PROVIDER
// ============================================

export interface CoverArtInput {
  prompt: string;
  style?: string;
  album_mood?: string;
  width?: number;
  height?: number;
}

export interface ICoverArtProvider {
  name: string;
  generateCover(input: CoverArtInput): Promise<CoverArtResult>;
  isAvailable(): boolean;
}

// ============================================
// AUDIO PROCESSING PROVIDER
// ============================================

export interface AudioMixInput {
  tracks: Array<{
    url: string;
    volume: number; // 0-1
    start_time?: number; // seconds
  }>;
  output_format?: 'mp3' | 'wav' | 'flac';
}

export interface AudioMixResult {
  audio_url: string;
  duration_seconds: number;
}

export interface IAudioProcessor {
  name: string;
  mixTracks(input: AudioMixInput): Promise<AudioMixResult>;
  extractWaveform(audio_url: string): Promise<number[]>;
  trimAudio(audio_url: string, start: number, end: number): Promise<string>;
  fadeInOut(audio_url: string, fade_in: number, fade_out: number): Promise<string>;
  isAvailable(): boolean;
}

// ============================================
// VIDEO GENERATION PROVIDER
// ============================================

export interface VideoGenerationInput {
  audio_url: string;
  duration_seconds: number;
  
  // Scenes
  scenes: Array<{
    type: 'avatar' | 'image';
    asset_url: string; // avatar image or uploaded image
    start_time: number;
    duration: number;
    effects?: Array<{
      type: string;
      params: Record<string, any>;
    }>;
  }>;
  
  // Avatar specific
  avatar_action?: 'singing' | 'dancing' | 'talking';
  enable_lip_sync?: boolean;
  
  // Background
  background?: {
    type: 'solid' | 'gradient' | 'image';
    config: Record<string, any>;
  };
  
  // Text/Lyrics
  subtitles?: Array<{
    text: string;
    start_time: number;
    end_time: number;
  }>;
  
  // Output settings
  resolution: '720p' | '1080p' | '4K';
  fps?: number;
  bitrate?: string;
}

export interface VideoGenerationResult {
  video_url: string;
  thumbnail_url?: string;
  duration_seconds: number;
  file_size_mb: number;
  resolution: string;
  render_time_ms: number;
}

export interface IVideoProvider {
  name: string;
  generateVideo(input: VideoGenerationInput): Promise<VideoGenerationResult>;
  isAvailable(): boolean;
}

// ============================================
// IMAGE ANIMATION PROVIDER
// ============================================

export interface ImageAnimationInput {
  image_url: string;
  animation_type: 'subtle' | 'zoom' | 'pan' | 'beat_sync';
  duration: number;
  beat_timestamps?: number[]; // for beat_sync animations
  intensity?: number; // 0-1
}

export interface ImageAnimationResult {
  video_url: string;
  duration_seconds: number;
}

export interface IImageAnimationProvider {
  name: string;
  animateImage(input: ImageAnimationInput): Promise<ImageAnimationResult>;
  isAvailable(): boolean;
}
