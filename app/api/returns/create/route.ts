// API: Create return request
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ReturnRequestService } from '@/lib/returns/ReturnRequestService';

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
    const { orderId, reason, comments, items } = body;

    if (!orderId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId, reason' },
        { status: 400 }
      );
    }

    // Create return request
    const returnService = new ReturnRequestService(supabase);
    const result = await returnService.createReturnRequest(user.id, {
      orderId,
      reason,
      notes: comments,
      evidenceUrls: items,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create return request' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      returnId: result.returnId,
    });
  } catch (error) {
    console.error('Error creating return request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
