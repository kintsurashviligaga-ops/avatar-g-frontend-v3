import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type StripeEventRow = {
  processed_at: string | null;
  error_log: string | null;
};

type PaymentAttemptRow = {
  status: string;
};

// Force dynamic rendering (uses cookies and env vars at runtime)
export const dynamic = 'force-dynamic';

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

    const limit = Math.min(Number(searchParams?.get?.('limit') || '50'), 100);

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
    const typedEvents = (events || []) as StripeEventRow[];
    const typedAttempts = (attempts || []) as PaymentAttemptRow[];

    const eventMetrics = {
      total: typedEvents.length,
      processed: typedEvents.filter((eventRow) => eventRow.processed_at).length,
      failed: typedEvents.filter((eventRow) => eventRow.error_log).length,
      successRate:
        typedEvents.length > 0
          ? Math.round(((typedEvents.filter((eventRow) => eventRow.processed_at).length / typedEvents.length) * 100))
          : 0,
    };

    const attemptMetrics = {
      total: typedAttempts.length,
      succeeded: typedAttempts.filter((attemptRow) => attemptRow.status === 'succeeded').length,
      failed: typedAttempts.filter((attemptRow) => attemptRow.status === 'failed').length,
      pending: typedAttempts.filter((attemptRow) => attemptRow.status === 'created' || attemptRow.status === 'requires_action').length,
      successRate:
        typedAttempts.length > 0
          ? Math.round(((typedAttempts.filter((attemptRow) => attemptRow.status === 'succeeded').length / typedAttempts.length) * 100))
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
