// API: Sync tracking (manual trigger or cron)
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TrackingSyncService } from '@/lib/fulfillment/TrackingSyncService';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // Verify authorization (admin only or cron secret)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader !== `Bearer ${cronSecret}`) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const trackingService = new TrackingSyncService(supabase);
    const result = await trackingService.syncAllTracking();

    return NextResponse.json({
      success: true,
      synced: result.synced,
      errors: result.errors,
    });
  } catch (error: unknown) {
    console.error('Error syncing tracking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
