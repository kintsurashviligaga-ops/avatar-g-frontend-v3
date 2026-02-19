// API: Retry failed fulfillment job
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FulfillmentService } from '@/lib/fulfillment/FulfillmentService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    // Get authenticated user (admin/seller only)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobId = params.id;

    // Get job to verify ownership
    const { data: job, error: jobError } = await supabase
      .from('fulfillment_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Reset job for retry
    const { error: updateError } = await supabase
      .from('fulfillment_jobs')
      .update({
        status: 'queued',
        error_message: null,
        retry_count: 0,
        next_retry_at: null,
      })
      .eq('id', jobId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Process job
    const fulfillmentService = new FulfillmentService(supabase);
    fulfillmentService.processFulfillmentJob(jobId);

    return NextResponse.json({
      success: true,
      message: 'Job queued for retry',
    });
  } catch (error: unknown) {
    console.error('Error retrying fulfillment job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
