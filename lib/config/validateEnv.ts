/**
 * Global Environment Validator
 * /lib/config/validateEnv.ts
 * 
 * Ensures all required environment variables are present at runtime.
 * Throws structured error if validation fails.
 * NEVER allows undefined values to crash the app silently.
 */

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Required environment variables for production
 */
const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_BASE_URL',
];

/**
 * Optional but recommended variables
 */
const OPTIONAL_VARS = [
  'ALLOWED_ORIGINS',
  'SENTRY_DSN',
  'VERCEL_ANALYTICS_ID',
];

/**
 * Validate environment variables
 * @throws {Error} If critical variables are missing
 */
export function validateEnvironment(): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    missing: [],
    errors: [],
    warnings: [],
  };

  // Check required variables
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      result.missing.push(varName);
      result.valid = false;
    }
  }

  // Check optional variables
  for (const varName of OPTIONAL_VARS) {
    if (!process.env[varName]) {
      result.warnings.push(`Optional variable not set: ${varName}`);
    }
  }

  // Validate BASE_URL format
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl && !baseUrl.startsWith('http')) {
    result.errors.push('NEXT_PUBLIC_BASE_URL must start with http:// or https://');
    result.valid = false;
  }

  // Validate Supabase URL format
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.includes('supabase.co')) {
    result.errors.push('NEXT_PUBLIC_SUPABASE_URL appears invalid');
    result.valid = false;
  }

  // Validate Stripe key format
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && !stripeKey.startsWith('sk_')) {
    result.errors.push('STRIPE_SECRET_KEY must start with sk_');
    result.valid = false;
  }

  return result;
}

/**
 * Get environment variable safely with fallback
 */
export function getEnv(key: string, required = false, fallback?: string): string {
  const value = process.env[key] || fallback;

  if (required && !value) {
    throw new Error(
      `Critical environment variable missing: ${key}\n` +
      `Please set in Vercel dashboard or .env.local`
    );
  }

  return value || '';
}

/**
 * Check if all required env vars are present
 */
export function isEnvironmentValid(): boolean {
  const result = validateEnvironment();
  return result.valid && result.missing.length === 0;
}

/**
 * Get validation report as JSON
 */
export function getEnvReport() {
  const validation = validateEnvironment();
  return {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    valid: validation.valid,
    missingVars: validation.missing,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

/**
 * Assert environment is valid - throw if not
 */
export function assertEnvironmentValid() {
  const result = validateEnvironment();

  if (!result.valid) {
    const errorMessage = [
      '❌ ENVIRONMENT VALIDATION FAILED',
      '',
      'Missing required variables:',
      ...result.missing.map(v => `  - ${v}`),
      ...(result.errors.length > 0 ? ['', 'Errors:', ...result.errors.map(e => `  - ${e}`)] : []),
    ].join('\n');

    throw new Error(errorMessage);
  }

  return true;
}
