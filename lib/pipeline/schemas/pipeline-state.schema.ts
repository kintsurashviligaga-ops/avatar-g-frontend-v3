// Master Prompt §E.1 — durable snapshot persisted to Redis after each transition so a
// crashed worker resumes exactly where it stopped (§8 rationale).
import { z } from 'zod';
import { OrchestrationOutputSchema } from './orchestration-output.schema';

export const SceneAssetSchema = z.object({
  sceneNumber: z.number(),
  imageUrl: z.string().url().nullable(),
  videoUrl: z.string().url().nullable(),
  audioUrl: z.string().url().nullable(),
  sfxUrl: z.string().url().nullable(),
});

export const PipelineStateSnapshotSchema = z.object({
  jobId: z.string().uuid(),
  userId: z.string().uuid(),
  state: z.string(),
  orchestration: OrchestrationOutputSchema.optional(),
  assets: z.array(SceneAssetSchema).optional(),
  musicUrl: z.string().url().optional(),
  finalUrl: z.string().url().optional(),
  retryCounts: z.record(z.number()).default({}),
});

export type SceneAsset = z.infer<typeof SceneAssetSchema>;
export type PipelineStateSnapshot = z.infer<typeof PipelineStateSnapshotSchema>;
