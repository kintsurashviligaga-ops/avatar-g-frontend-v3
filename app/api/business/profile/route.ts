/**
 * GET /api/business/profile
 * GET, PUT, POST - Manage user business profile
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getBusinessProfile, createOrUpdateBusinessProfile } from '@/lib/tax/georgia';

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

    // Get business profile
    const profile = await getBusinessProfile(supabase, user.id);

    if (!profile) {
      return NextResponse.json(
        { error: 'Business profile not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    console.error('Error fetching business profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch business profile' },
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

    const {
      legalName,
      taxId,
      address,
      phone,
      email,
      isVatPayer,
      invoicePrefix,
      fxRateGelPerUsd,
    } = body;

    // Validate required fields
    if (!legalName || !taxId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: legalName, taxId, email' },
        { status: 400 },
      );
    }

    // Update business profile
    const profile = await createOrUpdateBusinessProfile(supabase, user.id, {
      legalName,
      taxId,
      address: address || '',
      phone: phone || '',
      email,
      isVatPayer: isVatPayer ?? false,
      invoicePrefix: invoicePrefix || 'AG',
      fxRateGelPerUsd: fxRateGelPerUsd || 2.7,
    });

    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    console.error('Error updating business profile:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update business profile',
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
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

    const {
      legalName,
      taxId,
      address,
      phone,
      email,
      isVatPayer,
      invoicePrefix,
      fxRateGelPerUsd,
    } = body;

    // Validate required fields
    if (!legalName || !taxId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: legalName, taxId, email' },
        { status: 400 },
      );
    }

    // Create business profile (same as PUT for upsert)
    const profile = await createOrUpdateBusinessProfile(supabase, user.id, {
      legalName,
      taxId,
      address: address || '',
      phone: phone || '',
      email,
      isVatPayer: isVatPayer ?? false,
      invoicePrefix: invoicePrefix || 'AG',
      fxRateGelPerUsd: fxRateGelPerUsd || 2.7,
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    console.error('Error creating business profile:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create business profile',
      },
      { status: 500 },
    );
  }
}
