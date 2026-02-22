/**
 * Environment Variable Validator
 * Validates required env vars per feature without exposing secret values
 */

export type EnvScope = 'public' | 'server';
export type EnvStatus = 'present' | 'missing' | 'empty';

export interface EnvVar {
  name: string;
  scope: EnvScope;
  required: boolean;
  usedBy: string[];
  status?: EnvStatus;
  prefix?: string; // e.g., "sk-", "r8_" for validation
  length?: number; // for existence check without exposing value
}

/**
 * Complete registry of all environment variables used in Avatar G
 */
export const ENV_REGISTRY: Record<string, EnvVar> = {
  // Core Supabase (REQUIRED)
  NEXT_PUBLIC_SUPABASE_URL: {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    scope: 'public',
    required: true,
    usedBy: ['all API routes', 'client auth', 'database'],
  },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    scope: 'public',
    required: true,
    usedBy: ['client auth', 'RLS policies'],
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    scope: 'server',
    required: true,
    usedBy: ['all API routes', 'server-side DB queries', 'bypass RLS'],
  },

  // AI Provider Keys (OPTIONAL - can use mock mode)
  REPLICATE_API_TOKEN: {
    name: 'REPLICATE_API_TOKEN',
    scope: 'server',
    required: false,
    usedBy: ['music generation', 'video generation', 'image effects'],
    prefix: 'r8_',
  },
  STABILITY_API_KEY: {
    name: 'STABILITY_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['avatar generation', 'cover art', 'image effects'],
    prefix: 'sk-',
  },
  RUNWAY_API_KEY: {
    name: 'RUNWAY_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['video generation', 'advanced video effects'],
  },
  ELEVENLABS_API_KEY: {
    name: 'ELEVENLABS_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['voice synthesis', 'voice cloning'],
  },
  OPENROUTER_API_KEY: {
    name: 'OPENROUTER_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['AI chat', 'lyrics generation'],
    prefix: 'sk-or-',
  },
  OPENAI_API_KEY: {
    name: 'OPENAI_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['AI chat fallback', 'text generation'],
    prefix: 'sk-',
  },
  XAI_API_KEY: {
    name: 'XAI_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['AI chat fallback'],
  },
  DEEPSEEK_API_KEY: {
    name: 'DEEPSEEK_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['AI chat fallback'],
  },
  GROQ_API_KEY: {
    name: 'GROQ_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['speech-to-text', 'audio transcription'],
  },
  GOOGLE_TTS_API_KEY: {
    name: 'GOOGLE_TTS_API_KEY',
    scope: 'server',
    required: false,
    usedBy: ['text-to-speech'],
  },

  // Cloudflare R2 Storage (OPTIONAL)
  R2_ACCOUNT_ID: {
    name: 'R2_ACCOUNT_ID',
    scope: 'server',
    required: false,
    usedBy: ['R2 storage', 'asset uploads'],
  },
  R2_ACCESS_KEY_ID: {
    name: 'R2_ACCESS_KEY_ID',
    scope: 'server',
    required: false,
    usedBy: ['R2 storage authentication'],
  },
  R2_SECRET_ACCESS_KEY: {
    name: 'R2_SECRET_ACCESS_KEY',
    scope: 'server',
    required: false,
    usedBy: ['R2 storage authentication'],
  },
  R2_BUCKET_NAME: {
    name: 'R2_BUCKET_NAME',
    scope: 'server',
    required: false,
    usedBy: ['R2 storage bucket selection'],
  },

  // Additional Storage (Generic S3)
  STORAGE_ENDPOINT: {
    name: 'STORAGE_ENDPOINT',
    scope: 'server',
    required: false,
    usedBy: ['S3-compatible storage', 'generic uploads'],
  },
  STORAGE_ACCESS_KEY: {
    name: 'STORAGE_ACCESS_KEY',
    scope: 'server',
    required: false,
    usedBy: ['S3 authentication'],
  },
  STORAGE_SECRET_KEY: {
    name: 'STORAGE_SECRET_KEY',
    scope: 'server',
    required: false,
    usedBy: ['S3 authentication'],
  },
  STORAGE_BUCKET: {
    name: 'STORAGE_BUCKET',
    scope: 'server',
    required: false,
    usedBy: ['S3 bucket selection'],
  },

  // Feature Flags & Config
  NEXT_PUBLIC_FRONTEND_ORIGIN: {
    name: 'NEXT_PUBLIC_FRONTEND_ORIGIN',
    scope: 'public',
    required: false,
    usedBy: ['OpenRouter API referer', 'CORS headers'],
  },
  NEXT_PUBLIC_BACKEND_URL: {
    name: 'NEXT_PUBLIC_BACKEND_URL',
    scope: 'public',
    required: false,
    usedBy: ['cross-domain API base URL', 'backend health checks'],
  },
  NEXT_PUBLIC_MOCK_MODE: {
    name: 'NEXT_PUBLIC_MOCK_MODE',
    scope: 'public',
    required: false,
    usedBy: ['DEPRECATED: use PROVIDER_MODE instead', 'development mode'],
  },
  PROVIDER_MODE: {
    name: 'PROVIDER_MODE',
    scope: 'server',
    required: false,
    usedBy: ['provider selection', 'mock vs real mode'],
  },
  APP_ENV: {
    name: 'APP_ENV',
    scope: 'server',
    required: false,
    usedBy: ['environment detection'],
  },
  NODE_ENV: {
    name: 'NODE_ENV',
    scope: 'server',
    required: true,
    usedBy: ['Next.js runtime'],
  },
};

/**
 * Check environment variable status without exposing value
 */
export function checkEnvVar(name: string): {
  status: EnvStatus;
  length?: number;
  prefix?: string;
  hasCorrectPrefix?: boolean;
} {
  const value = process.env[name];
  const config = ENV_REGISTRY[name];

  if (!value) {
    return { status: 'missing' };
  }

  if (value.trim() === '') {
    return { status: 'empty' };
  }

  const result = {
    status: 'present' as EnvStatus,
    length: value.length,
  };

  // Validate prefix if specified
  if (config?.prefix) {
    const hasCorrectPrefix = value.startsWith(config.prefix);
    return {
      ...result,
      prefix: config.prefix,
      hasCorrectPrefix,
    };
  }

  return result;
}

/**
 * Validate all environment variables
 */
export function validateEnvironment() {
  const results: Record<string, ReturnType<typeof checkEnvVar>> = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [name, config] of Object.entries(ENV_REGISTRY)) {
    const check = checkEnvVar(name);
    results[name] = check;

    if (config.required && check.status !== 'present') {
      errors.push(
        `REQUIRED: ${name} is ${check.status}. Used by: ${config.usedBy.join(', ')}`
      );
    }

    if (!config.required && check.status !== 'present') {
      warnings.push(
        `OPTIONAL: ${name} is ${check.status}. Feature may use mock/fallback. Used by: ${config.usedBy.join(', ')}`
      );
    }

    if (check.hasCorrectPrefix === false) {
      errors.push(
        `INVALID: ${name} does not start with expected prefix "${check.prefix}"`
      );
    }
  }

  return {
    results,
    errors,
    warnings,
    isValid: errors.length === 0,
    summary: {
      total: Object.keys(ENV_REGISTRY).length,
      present: Object.values(results).filter((r) => r.status === 'present').length,
      missing: Object.values(results).filter((r) => r.status === 'missing').length,
      empty: Object.values(results).filter((r) => r.status === 'empty').length,
    },
  };
}

/**
 * Get provider availability status
 */
export function getProviderStatus() {
  return {
    stability: {
      available: !!process.env.STABILITY_API_KEY,
      mode: process.env.STABILITY_API_KEY ? 'real' : 'mock',
    },
    replicate: {
      available: !!process.env.REPLICATE_API_TOKEN,
      mode: process.env.REPLICATE_API_TOKEN ? 'real' : 'mock',
    },
    runway: {
      available: !!process.env.RUNWAY_API_KEY,
      mode: process.env.RUNWAY_API_KEY ? 'real' : 'mock',
    },
    elevenlabs: {
      available: !!process.env.ELEVENLABS_API_KEY,
      mode: process.env.ELEVENLABS_API_KEY ? 'real' : 'mock',
    },
    openrouter: {
      available: !!process.env.OPENROUTER_API_KEY,
      mode: process.env.OPENROUTER_API_KEY ? 'real' : 'fallback',
    },
    r2Storage: {
      available: !!(
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY
      ),
      mode: process.env.R2_ACCOUNT_ID ? 'real' : 'supabase-storage',
    },
  };
}

/**
 * Feature-specific validation
 */
export function validateFeature(feature: 'avatar' | 'music' | 'video' | 'voice') {
  const validation = validateEnvironment();

  switch (feature) {
    case 'avatar':
      const avatarReady =
        (validation.results.STABILITY_API_KEY?.status === 'present' ||
          validation.results.REPLICATE_API_TOKEN?.status === 'present' ||
          process.env.NEXT_PUBLIC_MOCK_MODE === 'true') &&
        validation.results.NEXT_PUBLIC_SUPABASE_URL?.status === 'present';

      return {
        ready: avatarReady,
        message: avatarReady
          ? 'Avatar generation ready'
          : 'Missing: Supabase or (STABILITY_API_KEY / REPLICATE_API_TOKEN / MOCK_MODE)',
      };

    case 'music':
      const musicReady =
        (validation.results.REPLICATE_API_TOKEN?.status === 'present' ||
          process.env.NEXT_PUBLIC_MOCK_MODE === 'true') &&
        validation.results.NEXT_PUBLIC_SUPABASE_URL?.status === 'present';

      return {
        ready: musicReady,
        message: musicReady
          ? 'Music generation ready'
          : 'Missing: Supabase or (REPLICATE_API_TOKEN / MOCK_MODE)',
      };

    case 'video':
      const videoReady =
        (validation.results.RUNWAY_API_KEY?.status === 'present' ||
          validation.results.REPLICATE_API_TOKEN?.status === 'present' ||
          process.env.NEXT_PUBLIC_MOCK_MODE === 'true') &&
        validation.results.NEXT_PUBLIC_SUPABASE_URL?.status === 'present';

      return {
        ready: videoReady,
        message: videoReady
          ? 'Video generation ready'
          : 'Missing: Supabase or (RUNWAY_API_KEY / REPLICATE_API_TOKEN / MOCK_MODE)',
      };

    case 'voice':
      const voiceReady =
        validation.results.ELEVENLABS_API_KEY?.status === 'present' ||
        process.env.NEXT_PUBLIC_MOCK_MODE === 'true';

      return {
        ready: voiceReady,
        message: voiceReady
          ? 'Voice synthesis ready'
          : 'Missing: ELEVENLABS_API_KEY (mock mode available)',
      };

    default:
      return { ready: false, message: 'Unknown feature' };
  }
}

/**
 * Safe environment report for diagnostics (NO SECRET VALUES)
 */
export function getEnvironmentReport() {
  const validation = validateEnvironment();
  const providers = getProviderStatus();

  return {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    mockMode: process.env.NEXT_PUBLIC_MOCK_MODE === 'true',
    validation,
    providers,
    features: {
      avatar: validateFeature('avatar'),
      music: validateFeature('music'),
      video: validateFeature('video'),
      voice: validateFeature('voice'),
    },
  };
}
