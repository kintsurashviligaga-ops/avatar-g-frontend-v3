import 'server-only';

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
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_AUTH_REDIRECT_URL: process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL,
  NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED: process.env.NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
  STRIPE_PRICE_PREMIUM: process.env.STRIPE_PRICE_PREMIUM,
  STRIPE_PRICE_ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  STABILITY_API_KEY: process.env.STABILITY_API_KEY,
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
  RUNWAY_API_KEY: process.env.RUNWAY_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
  STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
  STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
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
