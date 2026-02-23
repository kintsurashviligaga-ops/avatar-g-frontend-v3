import { z } from 'zod';

const StepIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/, 'stepId must be alphanumeric with _ or -');

export const WorkflowStepSchema = z.object({
  stepId: StepIdSchema,
  serviceSlug: z.string().min(1).max(80),
  inputMapping: z.record(z.string().min(1)).default({}),
  outputMapping: z.record(z.string().min(1)).default({}),
  tierRequirements: z
    .object({
      minPlan: z.enum(['FREE', 'PRO', 'PREMIUM', 'ENTERPRISE']).optional(),
    })
    .optional(),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0).max(5).default(0),
    backoffMs: z.number().int().min(0).max(120000).optional(),
  }),
  nextStepIds: z.array(StepIdSchema).optional(),
});

export const WorkflowDefinitionCreateSchema = z.object({
  name: z.string().min(2).max(120),
  status: z.enum(['draft', 'active', 'archived']).optional().default('draft'),
  steps: z.array(WorkflowStepSchema).min(1).max(100),
});

export const WorkflowDefinitionUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  steps: z.array(WorkflowStepSchema).min(1).max(100).optional(),
});

export const WorkflowRunStartSchema = z.object({
  triggerInput: z.record(z.unknown()).optional().default({}),
  idempotencyKey: z.string().min(1).max(160).optional(),
});

export type WorkflowDefinitionCreateInput = z.infer<typeof WorkflowDefinitionCreateSchema>;
export type WorkflowDefinitionUpdateInput = z.infer<typeof WorkflowDefinitionUpdateSchema>;
export type WorkflowRunStartInput = z.infer<typeof WorkflowRunStartSchema>;
