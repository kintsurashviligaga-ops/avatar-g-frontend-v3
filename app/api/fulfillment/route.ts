// API: Create/manage fulfillment jobs
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FulfillmentService } from '@/lib/fulfillment/FulfillmentService';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams?.get?.('status');
    const orderId = searchParams?.get?.('orderId');

    // Build query
    let query = supabase
      .from('fulfillment_jobs')
      .select(
        `
        *,
        orders (
          order_number,
          buyer_name,
          total_amount
        ),
        suppliers (
          name,
          type
        )
      `
      )
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (orderId) {
      query = query.eq('order_id', orderId);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: jobs || [] });
  } catch (error: unknown) {
    console.error('Error fetching fulfillment jobs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, items } = body;

    if (!orderId || !items) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId, items' },
        { status: 400 }
      );
    }

    const fulfillmentService = new FulfillmentService(supabase);
    const result = await fulfillmentService.createFulfillmentJob({
      orderId,
      storeId: user.id,
      items,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
    });
  } catch (error: unknown) {
    console.error('Error creating fulfillment job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
