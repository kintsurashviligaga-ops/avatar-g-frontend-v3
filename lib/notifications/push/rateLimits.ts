/**
 * lib/notifications/push/rateLimits.ts — the push routes' per-ACCOUNT limits (checkRateLimitByKey on the verified userId,
 * after the session check, so rotating IPs buys nothing). The IP burst guards still come from RATE_LIMITS. Kept here, not
 * in the shared RATE_LIMITS table, so that table does not become a merge hot spot (the lib/research/rateLimits pattern).
 */
import type { RateLimitConfig } from '@/lib/api/rate-limit';

/**
 * Subscribe / unsubscribe. The card re-registers the device each time it mounts (so a shared browser follows whoever is
 * signed in), so this is sized for page views, not for button presses.
 */
export const PUSH_SUBSCRIBE_USER: RateLimitConfig = { maxRequests: 60, windowMs: 60 * 60_000, keyPrefix: 'rl:push:sub' };
/** "Send a test notification": each press is one push per device. A few to try it out, not a way to spam a phone. */
export const PUSH_TEST_USER: RateLimitConfig = { maxRequests: 5, windowMs: 10 * 60_000, keyPrefix: 'rl:push:test' };
