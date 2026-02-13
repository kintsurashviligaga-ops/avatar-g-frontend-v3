import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ========================================
// GET /api/admin/payments
// ========================================
// Admin dashboard - stripe events and payment status
// Protected - admin only

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);

    // Get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Verify admin role
    // For now, basic auth check

    const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

    // Fetch latest Stripe events
    const { data: events, error: eventsError } = await supabase
      .from('stripe_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    // Fetch payment attempts
    const { data: attempts, error: attemptsError } = await supabase
      .from('payment_attempts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (attemptsError) {
      console.error('Error fetching attempts:', attemptsError);
      return NextResponse.json({ error: 'Failed to fetch attempts' }, { status: 500 });
    }

    // Calculate metrics
    const eventMetrics = {
      total: events?.length || 0,
      processed: (events || []).filter((e) => e.processed_at).length,
      failed: (events || []).filter((e) => e.error_log).length,
      successRate:
        events && events.length > 0
          ? Math.round(((events.filter((e) => e.processed_at).length / events.length) * 100))
          : 0,
    };

    const attemptMetrics = {
      total: attempts?.length || 0,
      succeeded: (attempts || []).filter((a) => a.status === 'succeeded').length,
      failed: (attempts || []).filter((a) => a.status === 'failed').length,
      pending: (attempts || []).filter((a) => a.status === 'created' || a.status === 'requires_action').length,
      successRate:
        attempts && attempts.length > 0
          ? Math.round(((attempts.filter((a) => a.status === 'succeeded').length / attempts.length) * 100))
          : 0,
    };

    return NextResponse.json(
      {
        events: events || [],
        attempts: attempts || [],
        metrics: {
          events: eventMetrics,
          attempts: attemptMetrics,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/admin/payments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
