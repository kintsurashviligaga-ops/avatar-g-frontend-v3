/**
 * lib/image/artDirector/request.ts — the one request shape the Art Director routes accept. Pure (zod).
 * References are owner-checked storage paths, never URLs or inline bytes (14 data: URLs would break Vercel's 4.5 MB body).
 */
import { z } from 'zod';
import { ART_COUNTS, ART_RATIOS, ART_ROLES, ART_SIZES, MAX_REFERENCES, PERSON_ROLES, IDENTITY_SOFT_LIMIT, STYLE_PRESETS } from './spec';

const storagePath = z.string().min(1).max(400).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine((p) => !p.includes('..') && !p.includes('//'), 'Invalid storage path');

export const ArtRefSchema = z.object({
  path: storagePath,
  role: z.enum(ART_ROLES),
  note: z.string().max(200).optional(),
  locked: z.boolean().optional(),
}).strict();

export const ArtRequestSchema = z.object({
  v: z.literal(1),
  operation: z.enum(['generate', 'edit', 'mask_edit', 'extend', 'upscale', 'vary']),
  prompt: z.string().max(6000),
  references: z.array(ArtRefSchema).max(MAX_REFERENCES),
  /** The image to change (edit / mask_edit / extend / upscale / vary): a Library image path the caller owns. */
  basePath: storagePath.optional(),
  /** The brush (mask_edit): an uploaded PNG path. */
  maskPath: storagePath.optional(),
  /** Paste the original back outside the mask (default on). */
  keepRest: z.boolean().default(true),
  aspectRatio: z.enum(ART_RATIOS),
  size: z.enum(ART_SIZES),
  count: z.union([z.literal(ART_COUNTS[0]), z.literal(ART_COUNTS[1]), z.literal(ART_COUNTS[2])]),
  styleId: z.enum(STYLE_PRESETS.map((s) => s.id) as [string, ...string[]]).nullable().optional(),
  avoid: z.array(z.string().min(1).max(200)).max(10).default([]),
  seed: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
  locale: z.enum(['ka', 'en', 'ru']),
}).strict().superRefine((r, ctx) => {
  const needsBase = r.operation !== 'generate';
  if (needsBase && !r.basePath) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['basePath'], message: 'This operation needs the image to change' });
  if (!needsBase && r.basePath) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['basePath'], message: 'A new image has no base' });
  if (r.operation === 'mask_edit' && !r.maskPath) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maskPath'], message: 'Paint the area to change' });
  if (r.operation !== 'mask_edit' && r.maskPath) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maskPath'], message: 'A mask is only for a region edit' });
  if (['generate', 'edit', 'mask_edit'].includes(r.operation) && !r.prompt.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prompt'], message: 'Describe the picture or the change' });
  if (r.operation === 'upscale' && r.size === '1K') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['size'], message: 'Upscale goes to 2K or 4K' });
  if (['upscale', 'mask_edit', 'extend', 'edit'].includes(r.operation) && r.count !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['count'], message: 'An edit makes one image' });
  if (new Set(r.references.map((x) => x.path)).size !== r.references.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['references'], message: 'The same picture is attached twice' });
});
export type ArtRequest = z.infer<typeof ArtRequestSchema>;

/** Soft warnings the panel shows (never a refusal). */
export function artWarnings(r: Pick<ArtRequest, 'references'>): Array<'identity_limit'> {
  const people = r.references.filter((x) => PERSON_ROLES.includes(x.role)).length;
  return people > IDENTITY_SOFT_LIMIT ? ['identity_limit'] : [];
}
