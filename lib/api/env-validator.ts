/**
 * Environment Variable Validator
 * Runs on application startup to ensure all required env vars are configured
 * Prevents silent failures from missing configuration
 */

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checkedAt: string;
}

/**
 * Validate required environment variables
 * Call this in your layout.tsx or root file
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Critical - App cannot run without these
  const REQUIRED = [
    { name: 'NEXT_PUBLIC_SUPABASE_URL', scope: 'public', description: 'Supabase URL' },
    { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', scope: 'public', description: 'Supabase Anon Key' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', scope: 'server', description: 'Supabase Service Role Key' },
  ];

  // Optional but recommended
  const RECOMMENDED = [
    { name: 'NEXT_PUBLIC_API_URL', scope: 'public', description: 'Frontend API URL' },
    { name: 'NEXT_PUBLIC_PENTAGON_API_URL', scope: 'public', description: 'Pentagon API URL (if used)' },
    { name: 'OPENAI_API_KEY', scope: 'server', description: 'OpenAI API Key (for chat)' },
    { name: 'STABILITY_API_KEY', scope: 'server', description: 'Stability AI Key (for avatar generation)' },
    { name: 'REPLICATE_API_TOKEN', scope: 'server', description: 'Replicate API Token' },
    { name: 'RUNWAY_API_KEY', scope: 'server', description: 'Runway API Key' },
    { name: 'ELEVENLABS_API_KEY', scope: 'server', description: 'ElevenLabs API Key' },
    { name: 'R2_ACCESS_KEY_ID', scope: 'server', description: 'R2 Access Key ID' },
    { name: 'R2_SECRET_ACCESS_KEY', scope: 'server', description: 'R2 Secret Access Key' },
    { name: 'R2_BUCKET_NAME', scope: 'server', description: 'R2 Bucket Name' },
    { name: 'R2_ENDPOINT', scope: 'server', description: 'R2 Endpoint' },
    { name: 'R2_ACCOUNT_ID', scope: 'server', description: 'R2 Account ID' },
  ];

  // Check required - only fail in production
  for (const env of REQUIRED) {
    if (!process.env[env.name]) {
      const msg = `${env.name} is missing (${env.description})`;
      if (process.env.NODE_ENV === 'production') {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  // Check recommended - warn if missing
  for (const env of RECOMMENDED) {
    if (!process.env[env.name]) {
      warnings.push(`${env.name} is not configured (${env.description}). Some features may be unavailable.`);
    }
  }

  // Check for exposed secrets in frontend
  const FRONTEND_VARS = Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_'));
  for (const varName of FRONTEND_VARS) {
    const value = process.env[varName] || '';
    // Check for common secret patterns
    if (
      value.includes('sk-') || // OpenAI pattern
      value.includes('r8_') || // Replicate pattern
      value.includes('Bearer') ||
      value.includes('secret') ||
      value.includes('password')
    ) {
      errors.push(`SECURITY: ${varName} appears to contain a secret and should not be NEXT_PUBLIC_!`);
    }
  }

  // Validate some constraints
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('https://')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be HTTPS');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Log validation results
 */
export function logValidationResults(result: EnvValidationResult): void {
  if (result.errors.length > 0) {
    console.error('❌ Environment Validation FAILED:');
    result.errors.forEach(err => console.error(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Environment Warnings:');
    result.warnings.forEach(warn => console.warn(`  - ${warn}`));
  }

  if (result.valid && result.warnings.length === 0) {
    console.log('✅ Environment variables validated successfully');
  }
}

/**
 * Throw error if validation fails
 * Use in server components or layout
 */
export function requireValidEnvironment(stage: 'development' | 'production' | 'auto' = 'auto'): void {
  const stage_to_check = stage === 'auto' ? (process.env.NODE_ENV as 'development' | 'production') : stage;

  // Only enforce in production
  if (stage_to_check === 'production') {
    const result = validateEnvironment();

    if (!result.valid) {
      logValidationResults(result);
      throw new Error(
        'Environment validation failed. Missing required configuration:\n' +
        result.errors.map(e => `  - ${e}`).join('\n')
      );
    }
  }
}
