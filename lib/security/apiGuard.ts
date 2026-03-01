/**
 * API Security Guard — Centralized auth + rate-limiting for AI endpoints.
 * Enforces:
 * 1. JWT validation via Supabase auth token
 * 2. User ID + org_id extraction for scoping
 * 3. Per-user daily AI token budget cap
 * 4. Request size limits
 */

import { createRouteHandlerClient } from '@/lib/supabase/server';

export interface AuthContext {
  userId: string;
  email: string;
  orgId: string | null;
  role: string;
}

const MAX_REQUEST_BODY = 512_000; // 512KB max
const DAILY_AI_LIMIT = Number(process.env.DAILY_AI_LIMIT || '500');

// In-memory daily usage tracker (resets on redeploy — use DB for persistence)
const dailyUsage = new Map<string, { count: number; resetAt: number }>();

/**
 * Validate the current request's auth context.
 * Returns the authenticated user context or null.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    return {
      userId: user.id,
      email: user.email || '',
      orgId: (user.user_metadata?.org_id as string) || null,
      role: (user.user_metadata?.role as string) || 'user',
    };
  } catch {
    return null;
  }
}

/**
 * Require authentication — returns context or throws.
 */
export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new SecurityError('Unauthorized', 401);
  return ctx;
}

/**
 * Check if user is within daily AI request budget.
 */
export function checkDailyBudget(userId: string): { allowed: boolean; remaining: number; limit: number } {
  const now = Date.now();
  const entry = dailyUsage.get(userId);
  const dayMs = 24 * 60 * 60 * 1000;

  if (!entry || now >= entry.resetAt) {
    dailyUsage.set(userId, { count: 1, resetAt: now + dayMs });
    return { allowed: true, remaining: DAILY_AI_LIMIT - 1, limit: DAILY_AI_LIMIT };
  }

  entry.count += 1;
  const allowed = entry.count <= DAILY_AI_LIMIT;
  return { allowed, remaining: Math.max(0, DAILY_AI_LIMIT - entry.count), limit: DAILY_AI_LIMIT };
}

/**
 * Validate request body size.
 */
export function validateRequestSize(contentLength: number | null): void {
  if (contentLength && contentLength > MAX_REQUEST_BODY) {
    throw new SecurityError('Request too large', 413);
  }
}

/**
 * Sanitize user input — strip dangerous patterns from AI prompts.
 */
export function sanitizePrompt(input: string): string {
  let clean = input;
  // Remove system prompt injection attempts
  const injectionPatterns = [
    /\bignore\s+(all\s+)?previous\s+instructions?\b/gi,
    /\bsystem\s*:\s*/gi,
    /\b(jailbreak|DAN|bypass|override)\s+(mode|prompt|filter|safety)\b/gi,
    /\[\s*SYSTEM\s*\]/gi,
    /```system\b/gi,
  ];
  for (const pattern of injectionPatterns) {
    clean = clean.replace(pattern, '[filtered]');
  }
  // Limit length
  return clean.slice(0, 32_000);
}

export class SecurityError extends Error {
  constructor(message: string, public statusCode: number = 403) {
    super(message);
    this.name = 'SecurityError';
  }
}
