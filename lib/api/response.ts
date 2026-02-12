/**
 * API Response Utilities
 * Provides safe, consistent API responses without exposing sensitive information
 */

import { NextResponse } from 'next/server';

export type ApiStatus = 'success' | 'error' | 'partial';

export interface ApiResponse<T = any> {
  status: ApiStatus;
  data?: T;
  error?: string;
  code?: string;
  timestamp?: string;
}

/**
 * Create a successful API response
 */
export function apiSuccess<T>(
  data: T,
  statusCode = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}

/**
 * Create an error API response
 * NEVER exposes error details to client in production
 */
export function apiError(
  error: unknown,
  statusCode = 500,
  publicMessage?: string
): NextResponse<ApiResponse> {
  // Determine the error message for logging
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log full error server-side for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error('[API Error]', {
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });
  }

  // Generic message for client (never expose internals)
  const clientMessage = publicMessage || getGenericErrorMessage(statusCode);

  return NextResponse.json(
    {
      status: 'error',
      error: clientMessage,
      code: getErrorCode(statusCode),
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}

/**
 * Create a partial success response
 * Used when some operations succeed and some fail
 */
export function apiPartial<T>(
  data: T,
  error: string,
  statusCode = 206
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      status: 'partial',
      data,
      error,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}

/**
 * Get generic error message based on status code
 */
function getGenericErrorMessage(statusCode: number): string {
  const messages: Record<number, string> = {
    400: 'Invalid request',
    401: 'Unauthorized',
    403: 'Access denied',
    404: 'Resource not found',
    409: 'Conflict',
    413: 'Request too large',
    429: 'Too many requests',
    500: 'Internal server error',
    502: 'Service unavailable',
    503: 'Service temporarily unavailable',
  };

  return messages[statusCode] || 'An error occurred';
}

/**
 * Get error code for response
 */
function getErrorCode(statusCode: number): string {
  const codes: Record<number, string> = {
    400: 'INVALID_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    429: 'RATE_LIMIT_EXCEEDED',
    500: 'INTERNAL_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
  };

  return codes[statusCode] || 'ERROR';
}

/**
 * Validate API authentication
 */
export async function requireAuth(request: Request): Promise<{ userId: string } | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    // Token would be validated here with session/JWT
    // For now, return a basic check
    const token = authHeader.slice(7);
    if (!token || token === 'undefined') {
      return null;
    }

    // In production, validate JWT and get user ID
    // This is a placeholder
    return { userId: `user_${Date.now()}` };
  } catch {
    return null;
  }
}

/**
 * Middleware for wrapping route handlers with error handling
 */
export async function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>,
  ...args: T
): Promise<NextResponse<ApiResponse>> {
  try {
    const result = await handler(...args);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
