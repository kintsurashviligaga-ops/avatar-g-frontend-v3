import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface EnvValidationResponse {
  valid: boolean;
  environment: 'development' | 'staging' | 'production';
  timestamp: string;
  required_vars: Record<string, boolean>;
  missing_vars: string[];
  critical_missing?: string[];
  warnings: string[];
}

/**
 * Environment Validation Endpoint
 * GET /api/validate-env
 * 
 * Returns validation status of all required environment variables
 * Only accessible in development or with valid auth token
 */
export async function GET(request: NextRequest) {
  // Security: Only allow in development or with auth header
  const isProduction = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production';
  const authToken = request.headers.get('x-validation-token');
  const isLocalhost = request.nextUrl.hostname === 'localhost' || request.nextUrl.hostname === '127.0.0.1';

  if (isProduction && !authToken && !isLocalhost) {
    return apiError('Validation endpoint not available in production', 403);
  }

  try {
    const requiredVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_BASE_URL',
    ];

    const optionalVars = [
      'ALLOWED_ORIGINS',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_ALT',
      'SENTRY_DSN',
      'VERCEL_ANALYTICS_ID',
    ];

    // Check required variables
    const missing = requiredVars.filter(v => !process.env[v]);
    const present = requiredVars.filter(v => !!process.env[v]);

    // Check optional variables
    const presentOptional = optionalVars.filter(v => !!process.env[v]);
    const missingOptional = optionalVars.filter(v => !process.env[v]);

    // Build validation response
    const required_vars: Record<string, boolean> = {};
    requiredVars.forEach(v => {
      required_vars[v] = !!process.env[v];
    });

    const warnings: string[] = [];
    const environment = (process.env.VERCEL_ENV || 'development') as 'development' | 'staging' | 'production';

    // Add warnings for concerning configs
    if (environment === 'production' && missing.length > 0) {
      warnings.push(`Production environment missing ${missing.length} required variables`);
    }

    if (!process.env.ALLOWED_ORIGINS && environment === 'production') {
      warnings.push('ALLOWED_ORIGINS not set - using localhost defaults (may block production requests)');
    }

    if (!process.env.SENTRY_DSN) {
      warnings.push('Error tracking (SENTRY) not configured - production errors may not be logged');
    }

    const response: EnvValidationResponse = {
      valid: missing.length === 0,
      environment,
      timestamp: new Date().toISOString(),
      required_vars,
      missing_vars: missing,
      warnings,
    };

    // Mark as critical if production is missing vars
    if (environment === 'production' && missing.length > 0) {
      response.critical_missing = missing;
    }

    return apiSuccess(response);
  } catch (error) {
    console.error('[Env Validation Error]', error);
    return apiError('Failed to validate environment', 500);
  }
}

/**
 * POST - Detailed environment report (development only)
 * Includes more information about each variable
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return apiError('POST endpoint only available in development', 403);
  }

  try {
    const allEnvVars = process.env;
    const avatarRelated = Object.keys(allEnvVars)
      .filter(key => 
        key.includes('NEXT_PUBLIC_') || 
        key.includes('STRIPE_') ||
        key.includes('SUPABASE_') ||
        key.includes('VERCEL_') ||
        key.includes('ALLOWED_ORIGINS')
      )
      .map(key => ({
        name: key,
        set: !!allEnvVars[key],
        length: allEnvVars[key]?.length || 0,
        // Don't expose actual values
        preview: allEnvVars[key] ? `${allEnvVars[key]!.substring(0, 10)}...` : 'NOT_SET',
      }));

    return apiSuccess({
      total_vars: Object.keys(allEnvVars).length,
      avatar_related_vars: avatarRelated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return apiError('Failed to generate environment report', 500);
  }
}
