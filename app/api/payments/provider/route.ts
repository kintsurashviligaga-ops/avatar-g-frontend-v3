/**
 * GET /api/payments/provider
 * GET, PUT - Manage payment provider configuration
 */

import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = createServerClient();

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
    const supabase = createServerClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const ProviderSchema = z.object({
      activeProvider: z.enum(['stripe', 'tbc', 'bog', 'payze']),
    });
    let body;
    try {
      const json = await req.json();
      body = ProviderSchema.parse(json);
    } catch (validationError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationError instanceof z.ZodError ? validationError.errors : validationError },
        { status: 400 },
      );
    }
    const { activeProvider } = body;

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
