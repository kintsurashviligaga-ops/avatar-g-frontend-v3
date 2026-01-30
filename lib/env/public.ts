/**
 * PUBLIC ENVIRONMENT VARIABLES
 * Accessible in both Client and Server Components
 * Only NEXT_PUBLIC_* variables allowed here
 */

// Public environment variable schema
const publicEnvSchema = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_FRONTEND_ORIGIN: process.env.NEXT_PUBLIC_FRONTEND_ORIGIN,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  // TODO: Migrate from NEXT_PUBLIC_API_URL to NEXT_PUBLIC_API_BASE_URL
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_PENTAGON_API_URL: process.env.NEXT_PUBLIC_PENTAGON_API_URL,
} as const;

export type PublicEnvKey = keyof typeof publicEnvSchema;

/**
 * Get a public environment variable (works in Client + Server)
 * @throws Error if variable is missing
 */
export function getPublicEnv<K extends PublicEnvKey>(key: K): string {
  const value = publicEnvSchema[key];
  
  if (!value || value.trim() === '') {
    throw new Error(`[ENV ERROR] Missing public environment variable: ${key}`);
  }
  
  return value;
}

/**
 * Optional: Validate all required public env vars at startup
 * Call this in client entry point or root layout
 */
export function validatePublicEnv(): void {
  const required: PublicEnvKey[] = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];
  
  const missing: string[] = [];
  
  for (const key of required) {
    const value = publicEnvSchema[key];
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `[ENV VALIDATION FAILED] Missing required public env vars:\n` +
      missing.map(k => `  - ${k}`).join('\n')
    );
  }
  
  // Warn about duplicate usage
  if (publicEnvSchema.NEXT_PUBLIC_API_URL && publicEnvSchema.NEXT_PUBLIC_API_BASE_URL) {
    console.warn(
      '[ENV WARNING] Both NEXT_PUBLIC_API_URL and NEXT_PUBLIC_API_BASE_URL are set. ' +
      'Consolidate to NEXT_PUBLIC_API_BASE_URL only.'
    );
  }
}
