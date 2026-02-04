/**
 * SERVER-ONLY ENVIRONMENT VARIABLES
 * CRITICAL: This import prevents accidental client usage
 * Will throw build error if imported in Client Components
 */
import 'server-only';

// Server-only environment variable schema
const serverEnvSchema = {
  // Supabase (Server)
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  
  // AI Services
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ELEVENLABS_VOICE: process.env.ELEVENLABS_VOICE,
  
  // CORS / Security
  FRONTEND_ORIGINS: process.env.FRONTEND_ORIGINS,
  FRONTEND_ORIGIN_REGEX: process.env.FRONTEND_ORIGIN_REGEX,
  CORS_ALLOW_CREDENTIALS: process.env.CORS_ALLOW_CREDENTIALS,
  
  // Build flags
  FORCE_REBUILD: process.env.FORCE_REBUILD,
  
  // Cloudflare R2
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ENDPOINT: process.env.R2_ENDPOINT,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  
  // Cloudflare API
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
} as const;

export type ServerEnvKey = keyof typeof serverEnvSchema;

/**
 * Get a server-only environment variable
 * CANNOT be used in Client Components (build will fail)
 * @throws Error if variable is missing
 */
export function getServerEnv<K extends ServerEnvKey>(key: K): string {
  const value = serverEnvSchema[key];
  
  if (!value || value.trim() === '') {
    throw new Error(`[ENV ERROR] Missing server environment variable: ${key}`);
  }
  
  return value;
}

/**
 * Validate all required server env vars at startup
 * CALL THIS IN: app/layout.tsx (Server Component) or middleware
 * @throws Error if any required variable is missing
 */
export function validateServerEnv(): void {
  const required: ServerEnvKey[] = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_API_TOKEN',
  ];
  
  const missing: string[] = [];
  
  for (const key of required) {
    const value = serverEnvSchema[key];
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `[SERVER ENV VALIDATION FAILED] Missing required server env vars:\n` +
      missing.map(k => `  - ${k}`).join('\n') +
      `\n\nEnsure these are set in Vercel Dashboard > Project Settings > Environment Variables`
    );
  }
  
  console.log('✅ Server environment variables validated');
}

/**
 * Check if running in build/CI environment (optional helper)
 */
export function isBuildTime(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}
