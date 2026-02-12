/**
 * Music Generation Request Schema
 * Validates all incoming requests to /api/music/generate
 */

import { z } from 'zod';

export const MUSIC_GENERATION_CONSTRAINTS = {
  PROMPT_MIN: 5,
  PROMPT_MAX: 500,
  DURATION_MIN: 10,
  DURATION_MAX: 300,
  MAX_STYLE_TAGS: 5,
};

export const MusicGenerationRequestSchema = z.object({
  prompt: z.string()
    .min(MUSIC_GENERATION_CONSTRAINTS.PROMPT_MIN)
    .max(MUSIC_GENERATION_CONSTRAINTS.PROMPT_MAX)
    .trim(),
  lyrics: z.string().optional(),
  lyrics_mode: z.enum(['auto', 'custom', 'instrumental']).default('auto'),
  genre: z.string().max(50).optional(),
  mood: z.string().max(50).optional(),
  language: z.enum(['ka', 'en', 'ru', 'instrumental']).optional(),
  style_tags: z.array(z.string()).max(MUSIC_GENERATION_CONSTRAINTS.MAX_STYLE_TAGS).default([]),
  use_custom_vocals: z.boolean().default(false),
  voice_id: z.string().optional(),
  duration: z.number()
    .min(MUSIC_GENERATION_CONSTRAINTS.DURATION_MIN)
    .max(MUSIC_GENERATION_CONSTRAINTS.DURATION_MAX)
    .optional(),
});

export type MusicGenerationRequest = z.infer<typeof MusicGenerationRequestSchema>;
