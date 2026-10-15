/**
 * lib/music/studio/contracts.ts — what a Music Studio v1 request is, and the plan a quote binds.
 *
 * The request is the user's own words and choices, validated and nothing more: no translation, no inferred style, no
 * engine pick. The plan adds what the server decided (model, transport, price seconds) and is what the quote token
 * signs, so the run renders exactly what was quoted.
 */
import { z } from 'zod';
import { MusicError } from './errors';

export const MUSIC_KIND = 'music-studio-v1';
export const LANGS = ['ka', 'en', 'ru'] as const;
export const MODES = ['instrumental', 'song'] as const;
export const TEMPOS = ['slow', 'medium', 'fast'] as const;
export const VOCALS = ['auto', 'female', 'male', 'duet'] as const;

export type MusicLang = typeof LANGS[number];

const text = (max: number) => z.string().max(max).refine((s) => s.trim().length > 0, 'Text is empty');
// A style word is a short label, not a second prompt: letters (any script), digits, spaces and a few separators.
const label = z.string().max(60).regex(/^[\p{L}\p{N} &/'+-]*$/u, 'Use letters, digits and spaces only');

export const MusicRequestSchema = z.object({
  v: z.literal(1),
  prompt: text(2000),
  mode: z.enum(MODES),
  lyrics: z.string().max(3000).optional(),
  lyricsLanguage: z.enum(LANGS).optional(),
  genre: label.optional(),
  mood: label.optional(),
  tempo: z.enum(TEMPOS).optional(),
  bpm: z.number().int().min(40).max(220).optional(),
  vocalGender: z.enum(VOCALS).optional(),
  modelId: z.string().min(1).max(100),
  durationSec: z.number().int().min(5).max(600),
  locale: z.enum(LANGS),
  /** Regenerate: the earlier Music Studio job whose settings this one reuses (must be the caller's). */
  parentJobId: z.string().uuid().optional(),
}).strict().superRefine((r, ctx) => {
  if (r.mode === 'instrumental' && r.lyrics?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lyrics'], message: 'An instrumental has no lyrics' });
  }
  if (r.mode === 'instrumental' && r.vocalGender && r.vocalGender !== 'auto') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vocalGender'], message: 'An instrumental has no singer' });
  }
  if (r.lyricsLanguage && !r.lyrics?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lyricsLanguage'], message: 'A lyrics language needs lyrics' });
  }
});
export type MusicRequest = z.infer<typeof MusicRequestSchema>;

export const MusicPlanSchema = z.object({
  v: z.literal(1),
  kind: z.literal(MUSIC_KIND),
  request: MusicRequestSchema,
  transport: z.enum(['vertex', 'gemini_api']),
  /** The seconds the price tier is computed from (= request.durationSec, the model's fixed output length). */
  billedSec: z.number().int().positive(),
}).strict();
export type MusicPlan = z.infer<typeof MusicPlanSchema>;

export interface MusicOutput {
  bytes: Buffer;
  mime: string;
  providerRequestId: string | null;
  /** The text part Lyria returns next to the audio (a caption / lyrics sheet), if any. Never shown as fact. */
  caption: string | null;
}

export interface AudioQc {
  durationSec: number;
  codec: string | null;
  sampleRate: number | null;
  channels: number | null;
  maxVolumeDb: number | null;
  meanVolumeDb: number | null;
}

export interface SavedTrack {
  bucket: string;
  path: string;
  url: string;
  mime: string;
  bytes: number;
  digest: string;
  qc: AudioQc;
}

export function parseMusicRequest(value: unknown): MusicRequest {
  const r = MusicRequestSchema.safeParse(value);
  if (!r.success) throw new MusicError('validation_failed', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  return r.data;
}

export function parseMusicPlan(value: unknown): MusicPlan {
  const r = MusicPlanSchema.safeParse(value);
  if (!r.success) throw new MusicError('quote_invalid', 'The quoted plan is invalid.', 400);
  return r.data;
}
