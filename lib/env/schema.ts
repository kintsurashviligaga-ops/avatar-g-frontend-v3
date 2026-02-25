import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_URL: z.string().optional(),

  NEXT_PUBLIC_BACKEND_URL: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().optional(),
  BASE_URL: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  ENABLE_STRIPE: z.string().optional(),

  ALLOWED_ORIGINS: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  VERCEL_ANALYTICS_ID: z.string().optional(),

  NEXT_PUBLIC_AUTH_REDIRECT_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED: z.string().optional(),
  NEXT_PUBLIC_FRONTEND_ORIGIN: z.string().optional(),
  NEXT_PUBLIC_PENTAGON_API_URL: z.string().optional(),
  NEXT_PUBLIC_MOCK_MODE: z.string().optional(),

  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_PREMIUM: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  STABILITY_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  RUNWAY_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}

export function getBaseUrl(env: AppEnv = getEnv()): string {
  return (
    env.NEXT_PUBLIC_BASE_URL ||
    env.BASE_URL ||
    env.NEXT_PUBLIC_SITE_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  );
}

export function getAllowedOrigins(env: AppEnv = getEnv()): string[] {
  const configured = env.ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

export function isStripeEnabled(env: AppEnv = getEnv()): boolean {
  if (env.ENABLE_STRIPE === 'true') {
    return true;
  }

  return Boolean(
    env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET || env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}

export function getStripeEnv(options?: { required?: boolean }) {
  const env = getEnv();
  const stripe = {
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  };

  if (options?.required) {
    const missing = Object.entries(stripe)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(
        `Stripe is not fully configured. Missing variables: ${missing.join(', ')}`
      );
    }
  }

  return stripe;
}

export function getEnvWarnings(env: AppEnv = getEnv()): string[] {
  const warnings: string[] = [];

  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    warnings.push('NEXT_PUBLIC_SUPABASE_URL is not configured. Some DB-backed pages may be limited.');
  }

  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    warnings.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured. Auth-dependent features may fail.');
  }

  if (!env.NEXT_PUBLIC_BASE_URL && !env.BASE_URL && !env.NEXT_PUBLIC_SITE_URL && !env.NEXT_PUBLIC_APP_URL) {
    warnings.push('Base URL is not configured. Defaulting to http://localhost:3000.');
  }

  if (!env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN is not configured. Production error tracing is disabled.');
  }

  if (!env.VERCEL_ANALYTICS_ID) {
    warnings.push('VERCEL_ANALYTICS_ID is not configured. Analytics telemetry is disabled.');
  }

  if (!env.ALLOWED_ORIGINS) {
    warnings.push('ALLOWED_ORIGINS is not configured. Using localhost defaults.');
  }

  return warnings;
}
