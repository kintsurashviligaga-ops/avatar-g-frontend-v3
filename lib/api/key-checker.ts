/**
 * API Key Availability Checker
 * Provides safe methods to check if API keys are configured
 * WITHOUT exposing the actual keys to client-side JavaScript
 */

export interface KeyAvailabilityStatus {
  stability: boolean;
  openai: boolean;
  replicate: boolean;
  runway: boolean;
  elevenlabs: boolean;
  r2: boolean;
}

/**
 * Check if critical API keys are configured (server-side only)
 * Returns only boolean status, never the actual key values
 */
export function getAvailableKeys(): KeyAvailabilityStatus {
  return {
    stability: !!process.env.STABILITY_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    replicate: !!process.env.REPLICATE_API_TOKEN,
    runway: !!process.env.RUNWAY_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    r2: !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME),
  };
}

/**
 * Check if a specific key is available
 */
export function isKeyAvailable(keyName: keyof KeyAvailabilityStatus): boolean {
  return getAvailableKeys()[keyName];
}

/**
 * Get a safe error message for missing API key
 * Safe to display to users (no secret exposure)
 */
export function getMissingKeyError(service: string): string {
  return `The ${service} service is not currently available. Please configure the required API keys in your environment.`;
}

/**
 * Validate that a specific service is available before attempting to use it
 * Throws a safe error if not available
 */
export function requireKey(service: string, keyName: keyof KeyAvailabilityStatus): void {
  if (!isKeyAvailable(keyName)) {
    throw new Error(getMissingKeyError(service));
  }
}
