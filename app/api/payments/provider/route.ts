/**
 * GET /api/payments/provider
 * GET, PUT - Manage payment provider configuration
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get payment provider config
    const { data, error } = await supabase
      .from('payment_provider_configs')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // Create default config if not exists
      const { data: newConfig, error: createError } = await supabase
        .from('payment_provider_configs')
        .insert([
          {
            user_id: user.id,
            active_provider: 'stripe',
            stripe_enabled: true,
          },
        ])
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: 'Failed to create payment config' },
          { status: 500 },
        );
      }

      return NextResponse.json(newConfig, { status: 200 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Error fetching payment provider config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment provider config' },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { activeProvider } = body;

    // Validate active provider
    if (!['stripe', 'tbc', 'bog', 'payze'].includes(activeProvider)) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 },
      );
    }

    // Update payment provider config
    const { data, error } = await supabase
      .from('payment_provider_configs')
      .update({
        active_provider: activeProvider,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update payment config' },
        { status: 500 },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Error updating payment provider config:', error);
    return NextResponse.json(
      { error: 'Failed to update payment config' },
      { status: 500 },
    );
  }
}
