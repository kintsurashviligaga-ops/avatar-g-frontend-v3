import 'server-only';
import { z } from 'zod';

const coreEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_BASE_URL: z.string().url(),
  SENTRY_DSN: z.string().optional(),
  VERCEL_ANALYTICS_ID: z.string().optional(),
});

const billingEnvSchema = coreEnvSchema.extend({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
});

export type AppServerEnv = z.infer<typeof coreEnvSchema>;
export type BillingServerEnv = z.infer<typeof billingEnvSchema>;

export function parseServerEnv(): AppServerEnv {
  const parsed = coreEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error('Invalid server environment configuration');
  }

  return parsed.data;
}

export function isServerEnvValid(): boolean {
  return coreEnvSchema.safeParse(process.env).success;
}

export function parseBillingEnv(): BillingServerEnv {
  const parsed = billingEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error('Invalid billing environment configuration');
  }

  return parsed.data;
}

export function isBillingEnvValid(): boolean {
  return billingEnvSchema.safeParse(process.env).success;
}
