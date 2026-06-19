// Master Prompt §4.1 / E.1 — canonical Scene schema. Single source of truth for the
// shape every downstream agent (Nano Banana, ElevenLabs, LTX2) consumes.
import { z } from 'zod';

export const MarketingMetadataSchema = z
  .object({
    overlayText: z.string().optional(),
    priceTag: z.string().optional(),
    cta: z.string().optional(),
    website: z.string().optional(),
  })
  .strict();

export const SceneConfigSchema = z.object({
  sceneNumber: z.number().int().min(1).max(5),
  cinematicPrompt: z.string().min(20).describe('Lens, camera motion, lighting.'),
  dialogueScript: z.string().max(150).describe('~6 seconds of spoken dialogue.'),
  foleySfxDescription: z.string().min(3),
  marketingMetadata: MarketingMetadataSchema.optional(),
});

export type MarketingMetadata = z.infer<typeof MarketingMetadataSchema>;
export type SceneConfig = z.infer<typeof SceneConfigSchema>;
