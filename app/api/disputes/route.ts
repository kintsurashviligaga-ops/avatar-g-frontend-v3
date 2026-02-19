// API: List disputes (admin/seller view)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DisputeService } from '@/lib/disputes/DisputeService';

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
    const view = searchParams?.get?.('view'); // 'seller' or 'admin'
    const status = searchParams?.get?.('status'); // Optional filter

    const disputeService = new DisputeService(supabase);

    let disputes;
    if (view === 'seller') {
      disputes = await disputeService.listSellerDisputes(user.id);
    } else {
      // Admin view (all disputes)
      disputes = await disputeService.listDisputes(status || undefined);
    }

    return NextResponse.json({ disputes });
  } catch (error) {
    console.error('Error listing disputes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
