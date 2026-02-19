// API: Get/update return request
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ReturnRequestService } from '@/lib/returns/ReturnRequestService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const returnService = new ReturnRequestService(supabase);
    const returnRequest = await returnService.getReturnRequest(params.id);

    if (!returnRequest) {
      return NextResponse.json({ error: 'Return request not found' }, { status: 404 });
    }

    return NextResponse.json({ returnRequest });
  } catch (error) {
    console.error('Error fetching return request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const { action, refundAmount, reason } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action field' }, { status: 400 });
    }

    const returnService = new ReturnRequestService(supabase);

    let result;
    switch (action) {
      case 'approve':
        result = await returnService.approveReturn(user.id, params.id, refundAmount);
        break;
      case 'reject':
        result = await returnService.rejectReturn(user.id, params.id, reason);
        break;
      case 'mark_in_transit':
        result = await returnService.markInTransit(user.id, params.id);
        break;
      case 'mark_received':
        result = await returnService.markReceived(user.id, params.id);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update return request' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating return request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
