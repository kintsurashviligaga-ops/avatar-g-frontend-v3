/**
 * Server-side provider mode configuration
 * Controls whether to use real API providers or mock implementations
 * 
 * SECURITY: This is server-side only. Client cannot override provider mode.
 */

export type ProviderMode = 'mock' | 'real';

/**
 * Get current provider mode from environment
 * Defaults to 'mock' for safety (no unexpected API costs)
 */
export function getProviderMode(): ProviderMode {
  const mode = process.env.PROVIDER_MODE?.toLowerCase();
  
  if (mode === 'real') {
    return 'real';
  }
  
  // Default to mock mode for safety
  return 'mock';
}

/**
 * Check if we're in mock mode
 */
export function isMockMode(): boolean {
  return getProviderMode() === 'mock';
}

/**
 * Check if we're in real mode
 */
export function isRealMode(): boolean {
  return getProviderMode() === 'real';
}

/**
 * Check if a specific provider should use real API
 * Falls back to mock if API key is missing
 */
export function shouldUseRealProvider(provider: 'stability' | 'replicate' | 'runway' | 'elevenlabs' | 'openrouter'): boolean {
  if (isMockMode()) {
    return false;
  }
  
  // In real mode, check if provider key is configured
  switch (provider) {
    case 'stability':
      return !!process.env.STABILITY_API_KEY;
    case 'replicate':
      return !!process.env.REPLICATE_API_TOKEN;
    case 'runway':
      return !!process.env.RUNWAY_API_KEY;
    case 'elevenlabs':
      return !!process.env.ELEVENLABS_API_KEY;
    case 'openrouter':
      return !!process.env.OPENROUTER_API_KEY;
    default:
      return false;
  }
}

/**
 * Get provider configuration for diagnostics
 * SAFE: Does not expose actual keys
 */
export function getProviderConfig() {
  const mode = getProviderMode();
  
  return {
    mode,
    providers: {
      stability: {
        enabled: shouldUseRealProvider('stability'),
        mode: shouldUseRealProvider('stability') ? 'real' : 'mock',
      },
      replicate: {
        enabled: shouldUseRealProvider('replicate'),
        mode: shouldUseRealProvider('replicate') ? 'real' : 'mock',
      },
      runway: {
        enabled: shouldUseRealProvider('runway'),
        mode: shouldUseRealProvider('runway') ? 'real' : 'mock',
      },
      elevenlabs: {
        enabled: shouldUseRealProvider('elevenlabs'),
        mode: shouldUseRealProvider('elevenlabs') ? 'real' : 'mock',
      },
      openrouter: {
        enabled: shouldUseRealProvider('openrouter'),
        mode: shouldUseRealProvider('openrouter') ? 'real' : 'mock',
      },
    },
  };
}

/**
 * Validate provider configuration
 * Returns warnings if real mode enabled but keys missing
 */
export function validateProviderConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const mode = getProviderMode();
  
  if (mode === 'real') {
    // Check if at least one provider is configured
    const hasAnyProvider = 
      !!process.env.STABILITY_API_KEY ||
      !!process.env.REPLICATE_API_TOKEN ||
      !!process.env.RUNWAY_API_KEY ||
      !!process.env.ELEVENLABS_API_KEY;
    
    if (!hasAnyProvider) {
      warnings.push(
        'PROVIDER_MODE is set to "real" but no provider API keys are configured. ' +
        'All requests will fail. Consider setting PROVIDER_MODE=mock or adding API keys.'
      );
    }
    
    // Check individual providers
    if (!process.env.STABILITY_API_KEY) {
      warnings.push('STABILITY_API_KEY not configured - avatar generation will fail');
    }
    if (!process.env.REPLICATE_API_TOKEN) {
      warnings.push('REPLICATE_API_TOKEN not configured - some features will fail');
    }
    if (!process.env.RUNWAY_API_KEY) {
      warnings.push('RUNWAY_API_KEY not configured - video generation will fail');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
