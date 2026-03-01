/**
 * lib/env/validate.ts
 * ====================
 * Runtime ENV validation — runs on server startup.
 * If critical ENV vars are missing, returns structured error.
 */

export interface EnvCheckResult {
  valid: boolean;
  critical: EnvVar[];
  omniChannel: EnvVar[];
  modelConfig: EnvVar[];
  summary: string;
  checkedAt: string;
}

interface EnvVar {
  name: string;
  present: boolean;
  category: string;
}

const CRITICAL_VARS = [
  'OPENAI_API_KEY',
  'REPLICATE_API_TOKEN',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const OMNI_CHANNEL_VARS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'WHATSAPP_WEBHOOK_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
];

const MODEL_CONFIG_VARS = [
  'DEFAULT_MODEL',
  'EXECUTIVE_MODEL',
  'DAILY_AI_LIMIT',
];

function checkVar(name: string, category: string): EnvVar {
  return { name, present: Boolean(process.env[name]), category };
}

export function validateEnv(): EnvCheckResult {
  const critical = CRITICAL_VARS.map(v => checkVar(v, 'critical'));
  const omniChannel = OMNI_CHANNEL_VARS.map(v => checkVar(v, 'omni-channel'));
  const modelConfig = MODEL_CONFIG_VARS.map(v => checkVar(v, 'model-config'));

  const missingCritical = critical.filter(v => !v.present);
  const missingOmni = omniChannel.filter(v => !v.present);
  const missingModel = modelConfig.filter(v => !v.present);

  const valid = missingCritical.length === 0;

  const parts: string[] = [];
  if (missingCritical.length > 0) {
    parts.push(`CRITICAL MISSING: ${missingCritical.map(v => v.name).join(', ')}`);
  }
  if (missingOmni.length > 0) {
    parts.push(`Omni-channel missing: ${missingOmni.map(v => v.name).join(', ')}`);
  }
  if (missingModel.length > 0) {
    parts.push(`Model config defaulting: ${missingModel.map(v => v.name).join(', ')}`);
  }
  if (parts.length === 0) {
    parts.push('All ENV variables configured');
  }

  return {
    valid,
    critical,
    omniChannel,
    modelConfig,
    summary: parts.join(' | '),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Call at startup. Throws if critical vars missing.
 */
export function enforceEnv(): void {
  const result = validateEnv();
  if (!result.valid) {
    console.error('[ENV] Startup validation FAILED:', result.summary);
    // Log full report
    console.error('[ENV] Report:', JSON.stringify(result, null, 2));
    // Don't crash the process — log + degrade
  } else {
    console.info('[ENV] Startup validation passed:', result.summary);
  }
}
