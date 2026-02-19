/**
 * GET /api/invoices/[id]
 * Get invoice details with items
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 },
      );
    }

    // Get invoice items
    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', params.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      console.error('Error fetching invoice items:', itemsError);
    }

    return NextResponse.json(
      {
        invoice,
        items: items || [],
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const { status } = body;

    // Validate status
    if (!['issued', 'paid', 'void'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 },
      );
    }

    // Update invoice status
    const updateData: {
      status: 'issued' | 'paid' | 'void';
      paid_at?: string;
      voided_at?: string;
    } = { status };

    if (status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    } else if (status === 'void') {
      updateData.voided_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Failed to update invoice' },
        { status: 500 },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 },
    );
  }
}
