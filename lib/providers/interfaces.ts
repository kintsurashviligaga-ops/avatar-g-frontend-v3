// Provider Adapter Interfaces
// Abstract layer for all AI/Media providers

import type {
  AvatarGenerationResult,
  TalkClipResult,
  VoiceTrainingResult,
  Language
} from '@/types/avatar-builder';

// Re-export types for provider implementations
export type {
  AvatarGenerationResult,
  TalkClipResult,
  VoiceTrainingResult,
  Language
};// ============================================
// AVATAR GENERATION PROVIDER
// ============================================

export interface AvatarProviderInput {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  style_preset?: string;
  reference_image?: string; // URL or base64
  enable_turnaround?: boolean;
}

export interface IAvatarProvider {
  name: string;
  generate(input: AvatarProviderInput): Promise<AvatarGenerationResult>;
  imageToImage?(input: AvatarProviderInput & { init_image: string }): Promise<AvatarGenerationResult>;
  isAvailable(): boolean;
}

// ============================================
// OUTFIT FITTING PROVIDER
// ============================================

export interface OutfitFittingInput {
  base_image: string; // URL or base64
  outfit_image: string; // URL or base64
  category?: string;
  position?: { x: number; y: number };
  scale?: number;
}

export interface OutfitFittingResult {
  image_url: string;
  generation_time_ms: number;
  metadata?: Record<string, unknown>;
}

export interface IOutfitFittingProvider {
  name: string;
  fitOutfit(input: OutfitFittingInput): Promise<OutfitFittingResult>;
  isAvailable(): boolean;
}

// ============================================
// VOICE CLONING/TTS PROVIDER
// ============================================

export interface VoiceTrainingInput {
  name: string;
  language: Language;
  sample_urls: string[];
  user_id: string;
}

export interface VoiceSynthesisInput {
  text: string;
  voice_model_ref?: string; // provider-specific reference
  language: Language;
  speed?: number;
  tone?: string;
}

export interface VoiceSynthesisResult {
  audio_url: string;
  duration_seconds: number;
  metadata?: Record<string, unknown>;
}

export interface IVoiceProvider {
  name: string;
  trainVoice(input: VoiceTrainingInput): Promise<VoiceTrainingResult>;
  synthesize(input: VoiceSynthesisInput): Promise<VoiceSynthesisResult>;
  isAvailable(): boolean;
}

// ============================================
// TALKING AVATAR (LIP SYNC) PROVIDER
// ============================================

export interface TalkingAvatarInput {
  avatar_image: string; // URL or base64
  audio_url: string;
  duration_seconds?: number;
}

export interface ITalkingAvatarProvider {
  name: string;
  generateVideo(input: TalkingAvatarInput): Promise<TalkClipResult>;
  isAvailable(): boolean;
}

// ============================================
// FACE ANALYSIS PROVIDER
// ============================================

export interface FaceAnalysisInput {
  image: string; // URL or base64
}

export interface FaceAnalysisResult {
  detected: boolean;
  features?: {
    face_shape?: string;
    age_estimate?: number;
    gender?: string;
    ethnicity?: string;
    landmarks?: Array<{ x: number; y: number }>;
  };
  description?: string; // natural language description for prompt
}

export interface IFaceAnalysisProvider {
  name: string;
  analyze(input: FaceAnalysisInput): Promise<FaceAnalysisResult>;
  isAvailable(): boolean;
}

// ============================================
// PROVIDER FACTORY
// ============================================

export interface ProviderFactory {
  getAvatarProvider(): IAvatarProvider;
  getOutfitFittingProvider(): IOutfitFittingProvider;
  getVoiceProvider(): IVoiceProvider;
  getTalkingAvatarProvider(): ITalkingAvatarProvider;
  getFaceAnalysisProvider(): IFaceAnalysisProvider;
}
