import { NextRequest, NextResponse } from 'next/server';
import { getEnvironmentReport } from '@/lib/server/env';
import { getProviderConfig, validateProviderConfig } from '@/lib/server/provider-mode';
import { createClient } from '@supabase/supabase-js';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

/**
 * System Diagnostics API
 * GET /api/diagnostics?health=1
 * 
 * Returns system health status without exposing secrets
 */
export async function GET(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.READ);
  if (rateLimitError) return rateLimitError;

  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const healthCheck = searchParams.get('health') === '1';

    // Basic health check
    if (healthCheck) {
      return apiSuccess({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'avatar-g-diagnostics',
      });
    }

    // Full diagnostics report
    const envReport = getEnvironmentReport();
    const providerConfig = getProviderConfig();
    const providerValidation = validateProviderConfig();

    // Test Supabase connectivity
    const supabaseStatus = {
      connected: false,
      error: null as string | null,
      tables: [] as string[],
      buckets: [] as string[],
    };

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Test database connectivity - try to query tables
        const { error: avatarsError } = await supabase
          .from('avatars')
          .select('id')
          .limit(1);

        const { error: tracksError } = await supabase
          .from('tracks')
          .select('id')
          .limit(1);

        const { error: videosError } = await supabase
          .from('videos')
          .select('id')
          .limit(1);

        const { error: jobsError } = await supabase
          .from('jobs')
          .select('id')
          .limit(1);

        supabaseStatus.connected = true;
        supabaseStatus.tables = [
          avatarsError ? `avatars (error: ${avatarsError.message})` : 'avatars ✓',
          tracksError ? `tracks (error: ${tracksError.message})` : 'tracks ✓',
          videosError ? `videos (error: ${videosError.message})` : 'videos ✓',
          jobsError ? `jobs (error: ${jobsError.message})` : 'jobs ✓',
        ];

        // Test storage buckets
        try {
          const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
          if (bucketsError) {
            supabaseStatus.buckets = [`Error: ${bucketsError.message}`];
          } else {
            supabaseStatus.buckets = buckets?.map((b) => b.name) || [];
          }
        } catch {
          supabaseStatus.buckets = ['Error checking buckets'];
        }
      } else {
        supabaseStatus.error = 'Supabase credentials not configured';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Supabase error';
      supabaseStatus.error = message;
    }

    return apiSuccess({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: envReport,
      providers: {
        config: providerConfig,
        validation: providerValidation,
      },
      supabase: supabaseStatus,
      vercel: {
        isVercel: !!process.env.VERCEL,
        env: process.env.VERCEL_ENV || 'local',
      },
    });
  } catch (error) {
    return apiError(error, 500);
  }
}
