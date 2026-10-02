/**
 * lib/research/rateLimits.ts — the research routes' per-ACCOUNT rate limits (lib/api/rate-limit.checkRateLimitByKey, keyed
 * on the verified userId AFTER the session check, so rotating IPs buys nothing). Kept in this module instead of the shared
 * RATE_LIMITS table so that table does not become a merge hot spot; the IP burst guards still come from RATE_LIMITS.
 *
 * These are brakes on request FLOODS (each start costs a database insert and a ledger call even when it is refused). The
 * limits that bound SPEND are lib/research/limits.ts: per-account concurrency and daily caps and the global kill switch.
 */
import type { RateLimitConfig } from '@/lib/api/rate-limit';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** Start attempts per account per hour (the daily task cap is far lower — this only bounds a script hammering the route). */
export const RESEARCH_START_USER: RateLimitConfig = { maxRequests: 12, windowMs: HOUR, keyPrefix: 'rl:research:start' };
/** List / read / refresh: the watcher polls every ~10 s per tab while a job is pending. */
export const RESEARCH_READ_USER: RateLimitConfig = { maxRequests: 120, windowMs: 60_000, keyPrefix: 'rl:research:read' };
export const RESEARCH_CANCEL_USER: RateLimitConfig = { maxRequests: 20, windowMs: HOUR, keyPrefix: 'rl:research:cancel' };
/** Questions about a finished report (a model call each): a daily allowance and a per-minute burst guard. */
export const RESEARCH_ASK_DAY_USER: RateLimitConfig = { maxRequests: 60, windowMs: DAY, keyPrefix: 'rl:research:ask:day' };
export const RESEARCH_ASK_MIN_USER: RateLimitConfig = { maxRequests: 8, windowMs: 60_000, keyPrefix: 'rl:research:ask:min' };
/** Connectors: adding / deleting documents. */
export const RESEARCH_FILES_USER: RateLimitConfig = { maxRequests: 40, windowMs: DAY, keyPrefix: 'rl:research:files' };
/** Source favicons (first-party proxy): one report shows up to a few dozen. */
export const RESEARCH_FAVICON_IP: RateLimitConfig = { maxRequests: 240, windowMs: 60_000, keyPrefix: 'rl:research:favicon' };
