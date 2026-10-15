import { z } from 'zod';
import { ImageError } from './errors';

export const IMAGE_KIND = 'image-studio-v1';
export const REFERENCE_ROLES = [
  'subject', 'character', 'face', 'clothing', 'pose', 'style', 'composition', 'product', 'background', 'color',
] as const;
export const OPERATIONS = [
  'generate', 'edit', 'replace_object', 'remove_object', 'replace_background', 'extend',
  'enhance', 'character_variation', 'product_scene', 'composite',
] as const;
export const ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export const RESOLUTIONS = ['1K', '2K', '4K'] as const;

// Stable owner-resolved references only. Signed URL possession is not ownership.
export const AssetRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upload'), path: z.string().min(1).max(400).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
    .refine(p => !p.includes('..') && !p.includes('//'), 'Invalid storage path') }).strict(),
  z.object({ kind: z.literal('result'), id: z.string().uuid() }).strict(),
]);
export const ReferenceSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  role: z.enum(REFERENCE_ROLES),
  asset: AssetRefSchema,
}).strict();
const text = (max: number) => z.string().max(max).refine(s => s.trim().length > 0, 'Text is empty');
// No transforms, trims, inferred styles or language translation.
export const ImageRequestSchema = z.object({
  v: z.literal(1),
  operation: z.enum(OPERATIONS),
  originalPrompt: text(8000),
  instructions: z.array(text(1000)).max(12),
  references: z.array(ReferenceSchema).max(4),
  modelId: z.string().min(1).max(100),
  aspectRatio: z.enum(ASPECTS),
  resolution: z.enum(RESOLUTIONS),
  count: z.number().int().min(1).max(4),
  locale: z.enum(['ka', 'en', 'ru']),
  parentJobId: z.string().uuid().optional(),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.references.map(x => x.id)).size !== r.references.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['references'], message: 'Reference IDs must be unique' });
  }
  if (r.operation !== 'generate' && r.references.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['references'], message: 'This operation needs a source image' });
  }
  if (r.operation === 'character_variation' && !r.references.some(x => ['character', 'face', 'subject'].includes(x.role))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['references'], message: 'Select the character reference' });
  }
  if (r.operation === 'product_scene' && !r.references.some(x => x.role === 'product')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['references'], message: 'Select the product reference' });
  }
});
export type ImageRequest = z.infer<typeof ImageRequestSchema>;
export type ImageReference = z.infer<typeof ReferenceSchema>;
export type ImageAssetRef = z.infer<typeof AssetRefSchema>;
export type ImageOperation = ImageRequest['operation'];
export type ImageTransport = 'vertex' | 'gemini_api';
export const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ManifestSchema = z.object({
  id: z.string(), role: z.enum(REFERENCE_ROLES), digest: DigestSchema,
  width: z.number().int().positive(), height: z.number().int().positive(),
  mime: z.literal('image/png'), bytes: z.number().int().positive(),
}).strict();
export const ImagePlanSchema = z.object({
  v: z.literal(1), kind: z.literal(IMAGE_KIND), request: ImageRequestSchema,
  transport: z.enum(['vertex', 'gemini_api']),
  references: z.array(ManifestSchema).max(4),
}).strict();
export type ImagePlan = z.infer<typeof ImagePlanSchema>;
export type ReferenceManifest = z.infer<typeof ManifestSchema>;
export type PreparedReference = ReferenceManifest & { data: Buffer };
export interface ImageOutput {
  bytes: Buffer;
  mime: string;
  providerRequestId: string | null;
  usage: Record<string, number> | null;
}
export interface SavedImage {
  path: string; url: string; width: number; height: number; bytes: number; mime: 'image/png'; digest: string;
}
export function parseImageRequest(value: unknown): ImageRequest {
  const r = ImageRequestSchema.safeParse(value);
  if (!r.success) throw new ImageError('validation_failed', r.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; '), 400);
  return r.data;
}
export function parseImagePlan(value: unknown): ImagePlan {
  const r = ImagePlanSchema.safeParse(value);
  if (!r.success) throw new ImageError('quote_invalid', 'The quoted plan is invalid.', 400);
  if (r.data.references.length !== r.data.request.references.length || r.data.references.some((ref, i) =>
    ref.id !== r.data.request.references[i]?.id || ref.role !== r.data.request.references[i]?.role)) {
    throw new ImageError('quote_changed', 'The reference mapping differs from the quoted request.', 409);
  }
  return r.data;
}
