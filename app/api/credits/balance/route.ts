/**
 * GET /api/credits/balance
 * Get user's current credit balance and allowance
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabase = createRouteHandlerClient();

    await supabase.rpc('reset_user_credits_if_due', { p_user_id: user.id });
    
    // Get credits
    const { data: credits, error: creditsError } = await supabase
      .from('credits')
      .select('balance, monthly_allowance, reset_at')
      .eq('user_id', user.id)
      .single();
    
    if (creditsError) {
      console.error('Failed to get credits:', creditsError);
      return NextResponse.json(
        { error: 'Failed to get credits' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      balance: credits.balance,
      monthlyAllowance: credits.monthly_allowance,
      resetAt: credits.reset_at,
    });
    
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Credits API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch credits',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
