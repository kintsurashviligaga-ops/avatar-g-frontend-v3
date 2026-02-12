/**
 * Input Validation Schemas using Zod
 * Provides runtime validation for all API inputs
 */

import { z } from 'zod';

// Common constraints
export const CONSTRAINTS = {
  PROMPT_MAX_LENGTH: 2000,
  PROMPT_MIN_LENGTH: 3,
  DURATION_MAX_SECONDS: 120,
  DURATION_MIN_SECONDS: 1,
  WIDTH_MAX_PIXELS: 4096,
  WIDTH_MIN_PIXELS: 256,
  HEIGHT_MAX_PIXELS: 4096,
  HEIGHT_MIN_PIXELS: 256,
  BATCH_SIZE_MAX: 50,
  BATCH_SIZE_MIN: 1,
  SEED_MIN: 0,
  SEED_MAX: 2147483647,
  MESSAGE_MAX_LENGTH: 5000,
  MESSAGE_MIN_LENGTH: 1,
  PARAM_MAX_LENGTH: 100,
  LIMIT_MAX: 100,
  LIMIT_MIN: 1,
  OFFSET_MAX: 10000,
} as const;

// Chat/Message Validation
export const ChatMessageSchema = z.object({
  message: z.string()
    .min(CONSTRAINTS.MESSAGE_MIN_LENGTH, 'Message too short')
    .max(CONSTRAINTS.MESSAGE_MAX_LENGTH, 'Message too long')
    .trim(),
  language: z.string().max(10).optional().default('en'),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(4096).optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// Image Generation Validation
export const ImageGenerationSchema = z.object({
  prompt: z.string()
    .min(CONSTRAINTS.PROMPT_MIN_LENGTH, 'Prompt too short')
    .max(CONSTRAINTS.PROMPT_MAX_LENGTH, 'Prompt too long')
    .trim(),
  negativePrompt: z.string()
    .max(CONSTRAINTS.PROMPT_MAX_LENGTH)
    .optional(),
  width: z.number()
    .min(CONSTRAINTS.WIDTH_MIN_PIXELS, 'Width too small')
    .max(CONSTRAINTS.WIDTH_MAX_PIXELS, 'Width too large')
    .optional()
    .default(1024),
  height: z.number()
    .min(CONSTRAINTS.HEIGHT_MIN_PIXELS, 'Height too small')
    .max(CONSTRAINTS.HEIGHT_MAX_PIXELS, 'Height too large')
    .optional()
    .default(1024),
  steps: z.number()
    .min(1)
    .max(150)
    .optional()
    .default(30),
  guidanceScale: z.number()
    .min(1)
    .max(20)
    .optional()
    .default(7.5),
  seed: z.number()
    .min(CONSTRAINTS.SEED_MIN)
    .max(CONSTRAINTS.SEED_MAX)
    .optional(),
  stylePreset: z.string()
    .max(CONSTRAINTS.PARAM_MAX_LENGTH)
    .optional(),
  provider: z.enum(['stability', 'replicate', 'mock']).optional(),
});

export type ImageGeneration = z.infer<typeof ImageGenerationSchema>;

// Video Generation Validation
export const VideoGenerationSchema = z.object({
  prompt: z.string()
    .min(CONSTRAINTS.PROMPT_MIN_LENGTH)
    .max(CONSTRAINTS.PROMPT_MAX_LENGTH)
    .trim(),
  duration: z.number()
    .min(CONSTRAINTS.DURATION_MIN_SECONDS)
    .max(CONSTRAINTS.DURATION_MAX_SECONDS)
    .optional()
    .default(4),
  width: z.number()
    .min(CONSTRAINTS.WIDTH_MIN_PIXELS)
    .max(CONSTRAINTS.WIDTH_MAX_PIXELS)
    .optional()
    .default(1280),
  height: z.number()
    .min(CONSTRAINTS.HEIGHT_MIN_PIXELS)
    .max(CONSTRAINTS.HEIGHT_MAX_PIXELS)
    .optional()
    .default(720),
  fps: z.number()
    .min(1)
    .max(60)
    .optional()
    .default(24),
  format: z.enum(['mp4', 'webm']).optional().default('mp4'),
  provider: z.enum(['runway', 'replicate', 'mock']).optional(),
});

export type VideoGeneration = z.infer<typeof VideoGenerationSchema>;

// Avatar Generation Validation
export const AvatarGenerationSchema = z.object({
  prompt: z.string()
    .min(CONSTRAINTS.PROMPT_MIN_LENGTH)
    .max(CONSTRAINTS.PROMPT_MAX_LENGTH)
    .trim(),
  stylePreset: z.string()
    .max(CONSTRAINTS.PARAM_MAX_LENGTH)
    .optional(),
  bodyType: z.string()
    .max(CONSTRAINTS.PARAM_MAX_LENGTH)
    .optional(),
  pose: z.string()
    .max(CONSTRAINTS.PARAM_MAX_LENGTH)
    .optional(),
  generateTurnaround: z.boolean().optional().default(false),
  seed: z.number()
    .min(CONSTRAINTS.SEED_MIN)
    .max(CONSTRAINTS.SEED_MAX)
    .optional(),
});

export type AvatarGeneration = z.infer<typeof AvatarGenerationSchema>;

// Music Generation Validation
export const MusicGenerationSchema = z.object({
  prompt: z.string()
    .min(CONSTRAINTS.PROMPT_MIN_LENGTH)
    .max(CONSTRAINTS.PROMPT_MAX_LENGTH)
    .trim(),
  duration: z.number()
    .min(5)
    .max(300)
    .optional()
    .default(30),
  temperature: z.number()
    .min(0)
    .max(2)
    .optional(),
  genre: z.string()
    .max(CONSTRAINTS.PARAM_MAX_LENGTH)
    .optional(),
  seed: z.number()
    .min(CONSTRAINTS.SEED_MIN)
    .max(CONSTRAINTS.SEED_MAX)
    .optional(),
});

export type MusicGeneration = z.infer<typeof MusicGenerationSchema>;

// Music Track Job Request (full payload)
export const MusicTrackRequestSchema = z.object({
  prompt: z.string()
    .min(CONSTRAINTS.PROMPT_MIN_LENGTH)
    .max(CONSTRAINTS.PROMPT_MAX_LENGTH)
    .trim(),
  lyrics: z.string().max(CONSTRAINTS.PROMPT_MAX_LENGTH).optional(),
  lyrics_mode: z.enum(['auto', 'custom', 'instrumental']).optional().default('auto'),
  genre: z.string().max(CONSTRAINTS.PARAM_MAX_LENGTH).optional(),
  mood: z.string().max(CONSTRAINTS.PARAM_MAX_LENGTH).optional(),
  language: z.enum(['ka', 'en', 'ru', 'instrumental']).optional().default('ka'),
  style_tags: z.array(z.string().max(CONSTRAINTS.PARAM_MAX_LENGTH)).optional().default([]),
  use_custom_vocals: z.boolean().optional().default(false),
  voice_slots: z.array(z.enum(['A', 'B', 'C'])).optional().default(['A']),
});

export type MusicTrackRequest = z.infer<typeof MusicTrackRequestSchema>;

// Video Job Request
export const VideoJobRequestSchema = z.object({
  avatar_id: z.string().uuid(),
  track_id: z.string().uuid().optional(),
  prompt: z.string().max(CONSTRAINTS.PROMPT_MAX_LENGTH).optional(),
  title: z.string().max(CONSTRAINTS.PARAM_MAX_LENGTH).optional(),
  video_mode: z.enum(['avatar_performance', 'image_animation', 'mixed']).optional().default('avatar_performance'),
  avatar_action: z.string().max(CONSTRAINTS.PARAM_MAX_LENGTH).optional(),
  enable_lip_sync: z.boolean().optional().default(false),
  camera_template: z.string().max(CONSTRAINTS.PARAM_MAX_LENGTH).optional().default('static'),
  lighting_style: z.string().max(CONSTRAINTS.PARAM_MAX_LENGTH).optional().default('studio'),
  resolution: z.enum(['720p', '1080p', '4K']).optional().default('1080p'),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9'),
});

export type VideoJobRequest = z.infer<typeof VideoJobRequestSchema>;

// Voice Train Job Request
export const VoiceTrainRequestSchema = z.object({
  voice_profile_id: z.string().uuid(),
});

export type VoiceTrainRequest = z.infer<typeof VoiceTrainRequestSchema>;

// Legacy Avatar Generate Request
export const LegacyAvatarGenerateSchema = z.object({
  imageBase64: z.string().max(10_000_000).optional(),
  prompt: z.string().max(CONSTRAINTS.PROMPT_MAX_LENGTH).optional(),
  style: z.record(z.unknown()).optional(),
  fashion: z.record(z.unknown()).optional(),
});

export type LegacyAvatarGenerate = z.infer<typeof LegacyAvatarGenerateSchema>;

// Legacy Music Generate Request
export const LegacyMusicGenerateSchema = z.object({
  prompt: z.string().min(CONSTRAINTS.PROMPT_MIN_LENGTH).max(CONSTRAINTS.PROMPT_MAX_LENGTH).trim(),
  duration: z.number().min(5).max(300).optional().default(30),
  vocals: z.boolean().optional().default(true),
  genre: z.string().max(CONSTRAINTS.PARAM_MAX_LENGTH).optional().default('electronic'),
  _identity: z.object({
    voiceId: z.string().optional()
  }).optional()
});

export type LegacyMusicGenerate = z.infer<typeof LegacyMusicGenerateSchema>;

// Legacy Video Generate Request
export const LegacyVideoGenerateSchema = z.object({
  prompt: z.string().min(CONSTRAINTS.PROMPT_MIN_LENGTH).max(CONSTRAINTS.PROMPT_MAX_LENGTH).trim(),
  duration: z.number().min(CONSTRAINTS.DURATION_MIN_SECONDS).max(CONSTRAINTS.DURATION_MAX_SECONDS).optional().default(4),
  avatarActing: z.boolean().optional().default(true),
  _identity: z.object({
    avatarId: z.string().optional(),
    voiceId: z.string().optional()
  }).optional()
});

export type LegacyVideoGenerate = z.infer<typeof LegacyVideoGenerateSchema>;

// List Query Validation
export const ListQuerySchema = z.object({
  limit: z.number()
    .min(CONSTRAINTS.LIMIT_MIN)
    .max(CONSTRAINTS.LIMIT_MAX)
    .optional()
    .default(20),
  offset: z.number()
    .min(0)
    .max(CONSTRAINTS.OFFSET_MAX)
    .optional()
    .default(0),
  sort: z.enum(['created_at', 'updated_at', 'title', 'name']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string()
    .max(CONSTRAINTS.PARAM_MAX_LENGTH)
    .optional(),
  filter: z.string()
    .max(CONSTRAINTS.PARAM_MAX_LENGTH)
    .optional(),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;

// Generic Text Input Validation
export const TextInputSchema = z.object({
  text: z.string()
    .min(1)
    .max(CONSTRAINTS.MESSAGE_MAX_LENGTH)
    .trim(),
});

export type TextInput = z.infer<typeof TextInputSchema>;

// Batch Operation Validation
export const BatchOperationSchema = z.object({
  operations: z.array(z.object({
    id: z.string(),
    action: z.enum(['create', 'update', 'delete']),
    data: z.unknown().optional(),
  }))
    .min(1)
    .max(CONSTRAINTS.BATCH_SIZE_MAX),
});

export type BatchOperation = z.infer<typeof BatchOperationSchema>;

// Job Enqueue Request
export const JobEnqueueRequestSchema = z.object({
  type: z.enum([
    'generate_avatar',
    'generate_track',
    'generate_video',
    'train_voice',
    'talk_clip'
  ]),
  payload: z.record(z.unknown()).default({}),
  related_id: z.string().uuid().optional(),
});

export type JobEnqueueRequest = z.infer<typeof JobEnqueueRequestSchema>;

/**
 * Safe validation wrapper that returns either validated data or error
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; details?: string[] } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      return {
        success: false,
        error: 'Validation failed',
        details,
      };
    }
    return {
      success: false,
      error: 'Unknown validation error',
    };
  }
}
