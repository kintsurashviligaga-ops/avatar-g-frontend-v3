/**
 * Type-safe Environment Variable Schema
 *
 * Validates all required env vars at startup using @t3-oss/env-nextjs.
 * Import `env` from this file instead of `process.env` throughout the codebase
 * to get full TypeScript autocomplete and runtime validation.
 *
 * Any missing required var will throw at build time / server startup,
 * not silently at runtime when the feature is first used.
 */

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  /**
   * Server-only environment variables.
   * Never exposed to the client bundle.
   */
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Supabase
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    // Anthropic (primary AI provider)
    ANTHROPIC_API_KEY: z.string().optional(),

    // OpenAI
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_REALTIME_MODEL: z.string().default('gpt-4o-realtime-preview'),
    OPENAI_STT_MODEL: z.string().default('gpt-4o-mini-transcribe'),

    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // ElevenLabs
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().optional(),
    ELEVENLABS_GEORGIAN_VOICE_ID: z.string().optional(),

    // Vapi
    VAPI_API_KEY: z.string().optional(),
    VAPI_PHONE_NUMBER_ID: z.string().optional(),
    VAPI_WEBHOOK_SECRET: z.string().optional(),

    // Replicate
    REPLICATE_API_TOKEN: z.string().optional(),

    // Twilio
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

    // Telegram
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
    TELEGRAM_SETUP_SECRET: z.string().optional(),

    // WhatsApp
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

    // Upstash Redis
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Admin
    ADMIN_KEY: z.string().optional(),

    // Agent G
    AGENT_G_INTERNAL_SECRET: z.string().optional(),
    AGENT_G_MEMORY_ENABLED: z.string().default('false'),
    AGENT_G_VOICE_ENABLED: z.string().default('false'),
    AGENT_G_VOICE_MAX_SECONDS: z.string().default('45'),

    // CSRF
    CSRF_SECRET: z.string().optional(),

    // Cron
    CRON_SECRET: z.string().optional(),

    // Gemini
    GEMINI_API_KEY: z.string().optional(),

    // Site
    SITE_URL: z.string().url().optional(),
  },

  /**
   * Client-side environment variables.
   * Must be prefixed with NEXT_PUBLIC_.
   */
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_VAPI_PUBLIC_KEY: z.string().optional(),
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL,
    OPENAI_STT_MODEL: process.env.OPENAI_STT_MODEL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
    ELEVENLABS_GEORGIAN_VOICE_ID: process.env.ELEVENLABS_GEORGIAN_VOICE_ID,
    VAPI_API_KEY: process.env.VAPI_API_KEY,
    VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID,
    VAPI_WEBHOOK_SECRET: process.env.VAPI_WEBHOOK_SECRET,
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_SETUP_SECRET: process.env.TELEGRAM_SETUP_SECRET,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    ADMIN_KEY: process.env.ADMIN_KEY,
    AGENT_G_INTERNAL_SECRET: process.env.AGENT_G_INTERNAL_SECRET,
    AGENT_G_MEMORY_ENABLED: process.env.AGENT_G_MEMORY_ENABLED,
    AGENT_G_VOICE_ENABLED: process.env.AGENT_G_VOICE_ENABLED,
    AGENT_G_VOICE_MAX_SECONDS: process.env.AGENT_G_VOICE_MAX_SECONDS,
    CSRF_SECRET: process.env.CSRF_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SITE_URL: process.env.SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_VAPI_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === 'test',
});

// ─── Backward-compatible helpers ─────────────────────────────────────────────
// These shims keep existing files working while the codebase migrates to `env`.

/** Returns the raw process.env object — use `env` for type-safe access. */
export function getEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

/** Returns an array of warning messages for missing optional env vars. */
export function getEnvWarnings(): string[] {
  const warnings: string[] = [];
  const optionalKeys = [
    'STRIPE_WEBHOOK_SECRET',
    'UPSTASH_REDIS_REST_URL',
    'SENTRY_DSN',
    'ALLOWED_ORIGINS',
  ];
  for (const key of optionalKeys) {
    if (!process.env[key]) {
      warnings.push(`Optional env var ${key} is not set`);
    }
  }
  return warnings;
}

/** Returns true when Stripe is configured. */
export function isStripeEnabled(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE);
}
