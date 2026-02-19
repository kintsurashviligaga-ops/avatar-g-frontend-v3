import 'server-only';

type StartupValidation = {
  missing: string[];
  optionalMissing: string[];
};

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_SITE_URL',
] as const;

const OPTIONAL_VARS = ['STRIPE_WEBHOOK_SECRET'] as const;

const globalState = globalThis as typeof globalThis & {
  __avatarEnvValidationLogged?: boolean;
};

function collectValidation(): StartupValidation {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  const optionalMissing = OPTIONAL_VARS.filter((key) => !process.env[key]);

  return { missing: [...missing], optionalMissing: [...optionalMissing] };
}

export function logStartupEnvValidation() {
  if (globalState.__avatarEnvValidationLogged) {
    return;
  }

  globalState.__avatarEnvValidationLogged = true;

  const { missing, optionalMissing } = collectValidation();

  if (missing.length === 0) {
    console.info('[env] startup validation passed');
  } else {
    console.warn(`[env] missing required variables: ${missing.join(', ')}`);
  }

  if (optionalMissing.length > 0) {
    console.info(`[env] missing optional variables: ${optionalMissing.join(', ')}`);
  }
}
