/**
 * GET /api/user/stats
 * Return user generation statistics (avatars, music, videos, images)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

interface GenerationStats {
  total: number;
  today: number;
  byType: Record<string, number>;
  recent: unknown[];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.READ);
    if (rateLimitError) return rateLimitError;

    // For now, return mock stats  
    // In production, you'd query avatars, music_tracks, videos, images tables
    const stats: GenerationStats = {
      total: 0,
      today: 0,
      byType: {
        avatars: 0,
        music: 0,
        videos: 0,
        images: 0,
      },
      recent: [],
    };

    // Try to get authenticated user
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get auth user from request headers
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      const user = data?.user;
      
      if (user?.id) {
        // Query avatars table
        const { data: avatars, count: avatarCount } = await supabase
          .from('avatars')
          .select('*', { count: 'exact' })
          .eq('owner_id', user.id)
          .limit(5);

        stats.total = (avatarCount || 0);
        stats.byType.avatars = (avatarCount || 0);
        
        // Add recent avatars
        if (avatars && avatars.length > 0) {
          stats.recent = avatars.map(a => ({
            id: a.id,
            type: 'avatar',
            created_at: a.created_at,
            name: a.name || 'Unnamed Avatar'
          }));
        }

        // Count today's generations
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { count: todayCount } = await supabase
          .from('avatars')
          .select('*', { count: 'exact' })
          .eq('owner_id', user.id)
          .gte('created_at', today.toISOString())
          .limit(1);

        stats.today = (todayCount || 0);
      }
    }

    return apiSuccess(stats);
  } catch (error) {
    return apiError(error, 500, 'Failed to fetch stats');
  }
}
