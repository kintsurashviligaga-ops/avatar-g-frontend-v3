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

export type EnvValidationProfile = 'core' | 'stripe' | 'all';

/**
 * Required environment variables for production
 */
const CORE_REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_AUTH_REDIRECT_URL',
  'NEXT_PUBLIC_BASE_URL',
];

const STRIPE_REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
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
export function validateEnvironment(profile: EnvValidationProfile = 'core'): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    missing: [],
    errors: [],
    warnings: [],
  };

  const requiredVars =
    profile === 'stripe'
      ? STRIPE_REQUIRED_VARS
      : profile === 'all'
      ? [...CORE_REQUIRED_VARS, ...STRIPE_REQUIRED_VARS]
      : CORE_REQUIRED_VARS;

  // Check required variables
  for (const varName of requiredVars) {
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && !siteUrl.startsWith('http')) {
    result.errors.push('NEXT_PUBLIC_SITE_URL must start with http:// or https://');
    result.valid = false;
  }

  const authRedirectUrl = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL;
  if (authRedirectUrl && !authRedirectUrl.startsWith('http')) {
    result.errors.push('NEXT_PUBLIC_AUTH_REDIRECT_URL must start with http:// or https://');
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
  if ((profile === 'stripe' || profile === 'all') && stripeKey && !stripeKey.startsWith('sk_')) {
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
  const result = validateEnvironment('core');
  return result.valid && result.missing.length === 0;
}

/**
 * Get validation report as JSON
 */
export function getEnvReport() {
  const validation = validateEnvironment('core');
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
  const result = validateEnvironment('core');

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
