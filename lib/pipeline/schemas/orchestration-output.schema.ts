// Master Prompt §4.1 / E.1 — Phase 1 director output. Exactly 5 scenes (30s @ 6s each),
// dual-mode (cinematic | b2b_commercial), with a B2B guard requiring marketing metadata.
import { z } from 'zod';
import { SceneConfigSchema } from './scene-config.schema';

export const OrchestrationOutputSchema = z
  .object({
    intent: z.enum(['cinematic', 'b2b_commercial']),
    masterTheme: z.string().min(5),
    globalMusicPrompt: z.string().min(5).describe('Single continuous 30s Udio score.'),
    scenes: z
      .array(SceneConfigSchema)
      .length(5)
      .refine((arr) => arr.every((s, i) => s.sceneNumber === i + 1), 'scenes must be numbered 1..5 in order'),
  })
  .superRefine((val, ctx) => {
    if (val.intent === 'b2b_commercial') {
      const hasMeta = val.scenes.some((s) => s.marketingMetadata);
      if (!hasMeta) ctx.addIssue({ code: 'custom', message: 'B2B requires marketingMetadata on at least one scene' });
    }
  });

export type OrchestrationOutput = z.infer<typeof OrchestrationOutputSchema>;
