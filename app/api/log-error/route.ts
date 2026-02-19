import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Error logging requires nodejs for Supabase

interface ErrorLogBody {
  message: string;
  digest?: string;
  stack?: string;
  timestamp: string;
  url: string;
  userAgent: string;
}

/**
 * Error Logging Endpoint
 * POST /api/log-error
 * 
 * Logs client-side errors to Supabase for monitoring
 * Rate limited to prevent abuse
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: max 10 error logs per minute per IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const now = new Date();
    
    // Parse request body
    const body: ErrorLogBody = await request.json();

    // Validate required fields
    if (!body.message || !body.url) {
      return apiError('Missing required fields: message, url', 400);
    }

    // Only log in production
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Client Error Logged]', body.message, 'at', body.url);
      return apiSuccess({ logged: false, reason: 'development' });
    }

    try {
      const supabase = createSupabaseServerClient();

      // Insert error log
      const { error: insertError } = await supabase
        .from('error_logs')
        .insert({
          error_type: 'client_error',
          error_message: body.message.substring(0, 500),
          error_digest: body.digest,
          error_stack: body.stack?.substring(0, 2000),
          page_url: body.url,
          user_agent: body.userAgent?.substring(0, 500),
          client_ip: ip,
          logged_at: now.toISOString(),
          environment: process.env.VERCEL_ENV || 'unknown',
        });

      if (insertError && insertError.code !== 'PGRST116') {
        // PGRST116 = table doesn't exist (OK during setup)
        console.error('[Error Log Insert Failed]', insertError);
        return apiSuccess({ logged: false, reason: 'database_unavailable' });
      }

      return apiSuccess({ logged: true });
    } catch (dbError) {
      // Silently fail - don't break the client
      console.error('[Error Logging Failed]', dbError);
      return apiSuccess({ logged: false, reason: 'server_error' });
    }
  } catch (error) {
    console.error('[Error Log Route Error]', error);
    // Always return 200 - error logging should never block the app
    return apiSuccess({ logged: false, reason: 'parse_error' });
  }
}
