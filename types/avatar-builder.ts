// Core types for Avatar Builder Platform
// Matches Supabase schema

// ============================================
// DATABASE TYPES
// ============================================

export type AvatarStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type VoiceStatus = 'pending' | 'training' | 'ready' | 'failed';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type JobType = 'generate_avatar' | 'fit_outfit' | 'train_voice' | 'talk_clip';

export type VoiceSlot = 'A' | 'B' | 'C';
export type Language = 'ka' | 'en' | 'ru';
export type WardrobeCategory = 'top' | 'bottom' | 'shoes' | 'glasses' | 'hat' | 'accessory';
export type PresetCategory = 'character' | 'style' | 'outfit';

export interface Avatar {
  id: string;
  user_id: string;
  prompt: string;
  negative_prompt?: string;
  style_preset?: string;
  body_type?: string;
  pose?: string;
  seed?: number;
  status: AvatarStatus;
  progress: number;
  error?: string;
  image_url?: string;
  turnaround_urls?: string[];
  thumbnail_url?: string;
  provider?: string;
  generation_time_ms?: number;
  cost_credits?: number;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface WardrobeItem {
  id: string;
  user_id: string;
  category: WardrobeCategory;
  name?: string;
  image_url: string;
  thumbnail_url?: string;
  source_url?: string;
  is_stock: boolean;
  tags?: string[];
  created_at: string;
}

export interface VoiceProfile {
  id: string;
  user_id: string;
  slot: VoiceSlot;
  name: string;
  status: VoiceStatus;
  progress: number;
  error?: string;
  sample_urls?: string[];
  consent_provided: boolean;
  consent_timestamp?: string;
  provider?: string;
  model_ref?: string;
  language?: Language;
  duration_seconds?: number;
  created_at: string;
  updated_at: string;
}

export interface TalkClip {
  id: string;
  user_id: string;
  avatar_id?: string;
  text: string;
  voice_slot?: VoiceSlot | 'default';
  language: Language;
  tone?: string;
  speed: number;
  status: JobStatus;
  error?: string;
  audio_url?: string;
  video_url?: string;
  duration_seconds?: number;
  provider?: string;
  cost_credits?: number;
  created_at: string;
}

export interface Job {
  id: string;
  user_id: string;
  type: JobType;
  input_json: Record<string, any>;
  output_json?: Record<string, any>;
  status: JobStatus;
  progress: number;
  error?: string;
  related_id?: string;
  created_at: string;
  updated_at: string;
  provider?: string;
  retry_count: number;
}

export interface Preset {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  config_json: PresetConfig;
  thumbnail_url?: string;
  category?: PresetCategory;
  tags?: string[];
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface LiveSession {
  id: string;
  user_id: string;
  avatar_id?: string;
  voice_slot?: VoiceSlot;
  status: 'active' | 'ended';
  duration_seconds: number;
  character_switches: number;
  started_at: string;
  ended_at?: string;
}

// ============================================
// CONFIGURATION TYPES
// ============================================

export interface PresetConfig {
  // Identity
  prompt: string;
  negative_prompt?: string;
  style_preset?: string;
  body_type?: string;
  pose?: string;
  age?: number;
  presentation?: string;
  skin_tone?: string;
  
  // Hair & Face
  hair_style?: string;
  hair_color?: string;
  eye_color?: string;
  expression?: string;
  
  // Outfit
  outfit_bundle?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
  eyewear?: string;
  headwear?: string;
  accessories?: string[];
  
  // Wardrobe items (IDs)
  wardrobe_items?: string[];
  
  // Visual
  colorway?: string;
  lighting?: string;
  background?: string;
  
  // Advanced
  seed?: number;
  guidance_scale?: number;
  num_inference_steps?: number;
  enable_turnaround?: boolean;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface GenerateAvatarRequest {
  prompt: string;
  negative_prompt?: string;
  style_preset?: string;
  body_type?: string;
  pose?: string;
  seed?: number;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  enable_turnaround?: boolean;
  reference_image?: string; // base64 or URL
}

export interface GenerateAvatarResponse {
  job_id: string;
  avatar_id: string;
  status: AvatarStatus;
}

export interface FitOutfitRequest {
  avatar_id: string;
  wardrobe_item_id: string;
  position?: { x: number; y: number };
  scale?: number;
}

export interface FitOutfitResponse {
  job_id: string;
  updated_avatar_id: string;
  status: JobStatus;
}

export interface UploadVoiceRequest {
  slot: VoiceSlot;
  name: string;
  language: Language;
  consent_provided: boolean;
  samples: File[] | string[]; // Files or base64
}

export interface TrainVoiceRequest {
  voice_profile_id: string;
}

export interface TrainVoiceResponse {
  job_id: string;
  voice_profile_id: string;
  status: VoiceStatus;
}

export interface GenerateTalkClipRequest {
  avatar_id?: string;
  text: string;
  voice_slot?: VoiceSlot | 'default';
  language: Language;
  tone?: 'neutral' | 'calm' | 'energetic' | 'emotional';
  speed?: number;
  enable_video?: boolean;
}

export interface GenerateTalkClipResponse {
  job_id: string;
  talk_clip_id: string;
  status: JobStatus;
}

export interface JobStatusResponse {
  id: string;
  status: JobStatus;
  progress: number;
  error?: string;
  output?: Record<string, any>;
}

// ============================================
// PROVIDER TYPES
// ============================================

export type ProviderName = 'replicate' | 'stability' | 'openai' | 'elevenlabs' | 'd-id' | 'heygen' | 'mock';

export interface ProviderConfig {
  name: ProviderName;
  api_key?: string;
  endpoint?: string;
  model?: string;
}

export interface AvatarGenerationResult {
  image_url: string;
  turnaround_urls?: string[];
  generation_time_ms: number;
  metadata?: Record<string, any>;
}

export interface VoiceTrainingResult {
  model_ref: string;
  status: VoiceStatus;
  metadata?: Record<string, any>;
}

export interface TalkClipResult {
  audio_url: string;
  video_url?: string;
  duration_seconds: number;
  metadata?: Record<string, any>;
}

// ============================================
// UI STATE TYPES
// ============================================

export type AvatarBuilderMode = 'beginner' | 'advanced';
export type AvatarBuilderStep = 'identity' | 'design' | 'wardrobe' | 'voice' | 'live';
export type AvatarBuilderView = 'create' | 'gallery';

export interface AvatarBuilderState {
  mode: AvatarBuilderMode;
  step: AvatarBuilderStep;
  view: AvatarBuilderView;
  config: PresetConfig;
  selectedAvatar?: Avatar;
  selectedPreset?: Preset;
  generatingAvatar: boolean;
  jobId?: string;
  jobProgress: number;
  referenceImage?: string;
  faceScanData?: FaceScanData;
}

export interface FaceScanData {
  image: string;
  features?: {
    face_shape?: string;
    eye_distance?: number;
    nose_width?: number;
    mouth_width?: number;
    jawline?: string;
  };
}

export interface WardrobeState {
  items: WardrobeItem[];
  selectedCategory?: WardrobeCategory;
  selectedItem?: WardrobeItem;
  uploadingItem: boolean;
  applyingOutfit: boolean;
}

export interface VoiceLabState {
  profiles: VoiceProfile[];
  selectedSlot?: VoiceSlot;
  uploadingSample: boolean;
  trainingVoice: boolean;
  previewText: string;
  previewLanguage: Language;
  playingPreview: boolean;
}

export interface TalkingAvatarState {
  text: string;
  selectedVoice: VoiceSlot | 'default';
  language: Language;
  tone: string;
  speed: number;
  generating: boolean;
  currentClip?: TalkClip;
  playing: boolean;
}

export interface LiveCreatorState {
  isLive: boolean;
  cameraEnabled: boolean;
  micEnabled: boolean;
  currentVoice: VoiceSlot;
  faceTrackingActive: boolean;
  latencyMode: 'low' | 'normal';
  characterSwitches: number;
  sessionId?: string;
  error?: string;
}

// ============================================
// UTILITY TYPES
// ============================================

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}
