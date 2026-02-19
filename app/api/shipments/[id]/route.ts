// GET /api/shipments/[id]
// PUT /api/shipments/[id]
// Get or update shipment details (sellers only)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ShippingService } from '@/lib/shipping/ShippingService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: request.headers.get('Authorization') || '' } },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get shipment with RLS enforcement
    const { data: shipment, error } = await supabase
      .from('shipments')
      .select(
        `
        id,
        order_id,
        carrier,
        service_level,
        tracking_number,
        tracking_url,
        status,
        shipped_at,
        delivered_at,
        created_at,
        orders!inner (id, user_id),
        shipment_events (
          id,
          status,
          location,
          message,
          occurred_at,
          source
        )
      `
      )
      .eq('id', params.id)
      .eq('seller_user_id', user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    return NextResponse.json(shipment, { status: 200 });
  } catch (error) {
    console.error('Error fetching shipment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shipment' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status, trackingNumber, trackingUrl, location, message } = await request.json();

    // Verify seller owns this shipment
    const { data: shipment, error: fetchError } = await supabase
      .from('shipments')
      .select('id, seller_user_id')
      .eq('id', params.id)
      .single();

    if (fetchError || shipment.seller_user_id !== user.id) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    const shippingService = new ShippingService(supabase);

    // Update tracking info if provided
    if (trackingNumber) {
      await shippingService.updateShipmentTracking(
        params.id,
        trackingNumber,
        trackingUrl
      );
    }

    // Update status if provided
    if (status) {
      await shippingService.updateShipmentStatus(
        params.id,
        status,
        location,
        message
      );
    }

    // Get updated shipment
    const { data: updated } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', params.id)
      .single();

    return NextResponse.json(
      { message: 'Shipment updated', shipment: updated },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating shipment:', error);
    return NextResponse.json(
      { error: 'Failed to update shipment' },
      { status: 500 }
    );
  }
}
