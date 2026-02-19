import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({
        isAuthenticated: false,
        isPremium: false,
        avatarUrl: null,
      });
    }

    const supabase = createRouteHandlerClient();

    const [{ data: subscription }, { data: avatar }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('avatars')
        .select('image_url, thumbnail_url, created_at')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const plan = (subscription?.plan || 'FREE').toUpperCase();

    return NextResponse.json({
      isAuthenticated: true,
      isPremium: plan === 'PREMIUM' || plan === 'ENTERPRISE',
      avatarUrl: avatar?.image_url || avatar?.thumbnail_url || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load landing profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
