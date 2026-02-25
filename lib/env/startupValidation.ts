import 'server-only';
import { getEnvWarnings } from '@/lib/env/schema';

type StartupValidation = {
  warnings: string[];
};

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const OPTIONAL_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_BASE_URL',
  'BASE_URL',
  'ALLOWED_ORIGINS',
  'SENTRY_DSN',
  'VERCEL_ANALYTICS_ID',
] as const;

const globalState = globalThis as typeof globalThis & {
  __avatarEnvValidationLogged?: boolean;
};

function collectValidation(): StartupValidation {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  const optionalMissing = OPTIONAL_VARS.filter((key) => !process.env[key]);

  const warnings: string[] = [];

  if (missing.length > 0) {
    warnings.push(`Missing core env variables: ${missing.join(', ')}`);
  }

  if (optionalMissing.length > 0) {
    warnings.push(`Missing optional env variables: ${optionalMissing.join(', ')}`);
  }

  warnings.push(...getEnvWarnings());

  return { warnings };
}

export function logStartupEnvValidation() {
  if (globalState.__avatarEnvValidationLogged) {
    return;
  }

  globalState.__avatarEnvValidationLogged = true;

  const { warnings } = collectValidation();

  if (warnings.length === 0) {
    console.info('[env] startup validation passed');
  } else {
    warnings.forEach((warning) => {
      console.warn(`[env] ${warning}`);
    });
  }
}
