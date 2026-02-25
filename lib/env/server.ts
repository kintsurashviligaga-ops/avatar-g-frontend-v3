import 'server-only';
import { getEnv } from '@/lib/env/schema';

export type ServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_AUTH_REDIRECT_URL?: string;
  NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_PREMIUM?: string;
  STRIPE_PRICE_ENTERPRISE?: string;
  OPENAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GROQ_API_KEY?: string;
  STABILITY_API_KEY?: string;
  REPLICATE_API_TOKEN?: string;
  RUNWAY_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  STORAGE_ENDPOINT?: string;
  STORAGE_ACCESS_KEY?: string;
  STORAGE_SECRET_KEY?: string;
  STORAGE_BUCKET?: string;
};

const serverEnv: ServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: getEnv().NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: getEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: getEnv().NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_AUTH_REDIRECT_URL: getEnv().NEXT_PUBLIC_AUTH_REDIRECT_URL,
  NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED: getEnv().NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED,
  SUPABASE_SERVICE_ROLE_KEY: getEnv().SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: getEnv().SUPABASE_URL,
  STRIPE_SECRET_KEY: getEnv().STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: getEnv().STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO: getEnv().STRIPE_PRICE_PRO,
  STRIPE_PRICE_PREMIUM: getEnv().STRIPE_PRICE_PREMIUM,
  STRIPE_PRICE_ENTERPRISE: getEnv().STRIPE_PRICE_ENTERPRISE,
  OPENAI_API_KEY: getEnv().OPENAI_API_KEY,
  OPENROUTER_API_KEY: getEnv().OPENROUTER_API_KEY,
  DEEPSEEK_API_KEY: getEnv().DEEPSEEK_API_KEY,
  GROQ_API_KEY: getEnv().GROQ_API_KEY,
  STABILITY_API_KEY: getEnv().STABILITY_API_KEY,
  REPLICATE_API_TOKEN: getEnv().REPLICATE_API_TOKEN,
  RUNWAY_API_KEY: getEnv().RUNWAY_API_KEY,
  ELEVENLABS_API_KEY: getEnv().ELEVENLABS_API_KEY,
  R2_ACCOUNT_ID: getEnv().R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: getEnv().R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: getEnv().R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: getEnv().R2_BUCKET_NAME,
  STORAGE_ENDPOINT: getEnv().STORAGE_ENDPOINT,
  STORAGE_ACCESS_KEY: getEnv().STORAGE_ACCESS_KEY,
  STORAGE_SECRET_KEY: getEnv().STORAGE_SECRET_KEY,
  STORAGE_BUCKET: getEnv().STORAGE_BUCKET,
};

export function getServerEnv(required: Array<keyof ServerEnv> = []): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('Server env accessed on the client');
  }

  if (required.length > 0) {
    const missing = required.filter((key) => !serverEnv[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required server env vars: ${missing.join(', ')}`);
    }
  }

  return serverEnv;
}
