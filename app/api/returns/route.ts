// API: List return requests (buyer or seller view)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ReturnRequestService } from '@/lib/returns/ReturnRequestService';

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
    const view = searchParams?.get?.('view'); // 'buyer' or 'seller'
    const status = searchParams?.get?.('status'); // Optional filter

    const returnService = new ReturnRequestService(supabase);

    let returns;
    if (view === 'seller') {
      returns = await returnService.listSellerReturns(user.id, status || undefined);
    } else {
      // Default to buyer view
      returns = await returnService.listBuyerReturns(user.id);
    }

    return NextResponse.json({ returns });
  } catch (error) {
    console.error('Error listing returns:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
