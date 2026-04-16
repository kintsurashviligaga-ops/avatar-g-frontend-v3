/**
 * Composable API Route Middleware
 *
 * Provides a fluent builder for Next.js App Router route handlers.
 * Each step wraps the next, so the chain executes in declaration order.
 *
 * Usage:
 *   export const POST = compose()
 *     .withRateLimit(RATE_LIMITS.WRITE)
 *     .withAuth()
 *     .withCsrf()
 *     .handle(async (req, ctx) => {
 *       // ctx.auth is typed AuthContext
 *       return apiSuccess({ ok: true });
 *     });
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, type RateLimitConfig, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getAuthContext, type AuthContext } from '@/lib/security/apiGuard';
import { verifyCsrfToken, requiresCsrf } from '@/lib/security/csrf';

export interface RouteContext {
  auth: AuthContext | null;
  requestId: string;
}

type RouteHandler<C extends RouteContext = RouteContext> = (
  req: NextRequest,
  ctx: C
) => Promise<NextResponse> | NextResponse;

interface ComposedRouteOptions {
  rateLimit?: RateLimitConfig;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  csrf?: boolean;
}

class RouteComposer<C extends RouteContext = RouteContext> {
  private options: ComposedRouteOptions;

  constructor(options: ComposedRouteOptions = {}) {
    this.options = options;
  }

  withRateLimit(config: RateLimitConfig = RATE_LIMITS.READ): RouteComposer<C> {
    return new RouteComposer({ ...this.options, rateLimit: config });
  }

  withAuth(): RouteComposer<C & { auth: AuthContext }> {
    return new RouteComposer({ ...this.options, requireAuth: true }) as RouteComposer<C & { auth: AuthContext }>;
  }

  withAdmin(): RouteComposer<C & { auth: AuthContext }> {
    return new RouteComposer({ ...this.options, requireAuth: true, requireAdmin: true }) as RouteComposer<C & { auth: AuthContext }>;
  }

  withCsrf(): RouteComposer<C> {
    return new RouteComposer({ ...this.options, csrf: true });
  }

  handle(handler: RouteHandler<C>): (req: NextRequest) => Promise<NextResponse> {
    const opts = this.options;

    return async (req: NextRequest): Promise<NextResponse> => {
      const requestId = crypto.randomUUID();
      const ctx: RouteContext = { auth: null, requestId };

      // 1. Rate limiting
      if (opts.rateLimit) {
        const limited = await checkRateLimit(req, opts.rateLimit);
        if (limited) return limited;
      }

      // 2. CSRF verification for mutations
      if (opts.csrf && requiresCsrf(req.method)) {
        if (!verifyCsrfToken(req)) {
          return NextResponse.json(
            { error: 'Invalid CSRF token', code: 'CSRF_INVALID' },
            { status: 403 }
          );
        }
      }

      // 3. Authentication
      if (opts.requireAuth) {
        const auth = await getAuthContext();
        if (!auth) {
          return NextResponse.json(
            { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
            { status: 401 }
          );
        }
        ctx.auth = auth;

        // 4. Admin role check
        if (opts.requireAdmin && auth.role !== 'admin') {
          return NextResponse.json(
            { error: 'Forbidden', code: 'ADMIN_REQUIRED' },
            { status: 403 }
          );
        }
      }

      try {
        const response = await handler(req, ctx as C);
        response.headers.set('x-request-id', requestId);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        const status = (err as { statusCode?: number }).statusCode ?? 500;

        return NextResponse.json(
          { error: message, code: 'INTERNAL_ERROR', requestId },
          { status, headers: { 'x-request-id': requestId } }
        );
      }
    };
  }
}

/** Create a new route composer. */
export function compose(): RouteComposer {
  return new RouteComposer();
}
