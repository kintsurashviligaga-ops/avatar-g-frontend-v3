/**
 * lib/api/guard.ts
 * =================
 * Unified API entry-point guard. Replaces the ad-hoc combinations of
 * rate-limit + auth + budget checks that previously diverged across
 * /api/chat/orchestrate, /api/orbit/agent, /api/ai, /api/replicate/*.
 *
 * Usage:
 *   const gate = await applyApiGuards(req, { limit: RATE_LIMITS.WRITE });
 *   if (gate.response) return gate.response;
 *   const { auth, budgetRemaining } = gate;
 *
 * Always returns either a NextResponse (rejection) or an AuthGate carrying
 * the resolved AuthContext (which may be null for anonymous-allowed routes).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  RATE_LIMITS,
  type RateLimitConfig,
} from '@/lib/api/rate-limit';
import {
  getAuthContext,
  checkDailyBudget,
  type AuthContext,
} from '@/lib/security/apiGuard';

export interface ApiGuardOptions {
  /** Rate-limit bucket. Defaults to RATE_LIMITS.WRITE. */
  limit?: RateLimitConfig;
  /** When true, an unauthenticated caller gets a 401 instead of being allowed through. */
  requireAuth?: boolean;
  /** When true, skip the daily AI budget check (e.g. for free polling endpoints). */
  skipBudget?: boolean;
  /** Friendly label used in budget-rejection payloads. */
  label?: string;
}

export interface ApiGuardResult {
  /** Non-null when the request must be rejected — return it as-is. */
  response: NextResponse | null;
  /** Resolved auth context, or null when route allows anonymous access. */
  auth: AuthContext | null;
  /** Remaining daily AI requests for the user, or null when unbounded/anonymous. */
  budgetRemaining: number | null;
}

const DEFAULT_OPTIONS: Required<Pick<ApiGuardOptions, 'limit' | 'requireAuth' | 'skipBudget'>> = {
  limit: RATE_LIMITS.WRITE,
  requireAuth: false,
  skipBudget: false,
};

export async function applyApiGuards(
  req: NextRequest,
  options: ApiGuardOptions = {},
): Promise<ApiGuardResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const rateLimitError = await checkRateLimit(req, opts.limit);
  if (rateLimitError) {
    return { response: rateLimitError, auth: null, budgetRemaining: null };
  }

  const auth = await getAuthContext();

  if (!auth && opts.requireAuth) {
    return {
      response: NextResponse.json(
        {
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        },
        { status: 401 },
      ),
      auth: null,
      budgetRemaining: null,
    };
  }

  if (!auth || opts.skipBudget) {
    return { response: null, auth, budgetRemaining: null };
  }

  const budget = checkDailyBudget(auth.userId);
  if (!budget.allowed) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'DAILY_BUDGET_EXCEEDED',
            message: `Daily limit of ${budget.limit} requests reached. Resets in 24h.`,
            label: opts.label,
          },
        },
        { status: 429 },
      ),
      auth,
      budgetRemaining: 0,
    };
  }

  return { response: null, auth, budgetRemaining: budget.remaining };
}
