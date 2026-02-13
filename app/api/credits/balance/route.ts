/**
 * GET /api/credits/balance
 * Get user's current credit balance and allowance
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get credits
    const { data: credits, error: creditsError } = await supabase
      .from('credits')
      .select('balance, monthly_allowance, last_reset_at, next_reset_at, total_earned, total_spent')
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
      lastResetAt: credits.last_reset_at,
      nextResetAt: credits.next_reset_at,
      totalEarned: credits.total_earned,
      totalSpent: credits.total_spent,
    });
    
  } catch (error) {
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
