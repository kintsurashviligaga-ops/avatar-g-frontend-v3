// GET /api/tracking/[id]
// Public tracking endpoint supporting tracking token and order ID lookup

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { ShippingService } from '@/lib/shipping/ShippingService';

export const dynamic = 'force-dynamic';

type ShipmentEvent = {
  status?: string;
  location?: string | null;
  message?: string | null;
  occurred_at?: string | null;
};

function normalizeEvents(events: unknown): Array<{
  status?: string;
  location?: string | null;
  message?: string | null;
  occurredAt?: string | null;
}> {
  if (!Array.isArray(events)) {
    return [];
  }

  return events.map((event) => {
    const typedEvent = (event as ShipmentEvent) || {};
    return {
      status: typedEvent.status,
      location: typedEvent.location ?? null,
      message: typedEvent.message ?? null,
      occurredAt: typedEvent.occurred_at ?? null,
    };
  });
}

async function getByTrackingToken(id: string) {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const shippingService = new ShippingService(supabase);
  const shipment = await shippingService.getShipmentForTracking(id);

  if (!shipment) {
    return null;
  }

  return NextResponse.json(
    {
      status: shipment.status,
      carrier: shipment.carrier,
      events: normalizeEvents(shipment.shipment_events),
      currentLocation: Array.isArray(shipment.shipment_events)
        ? ((shipment.shipment_events[0] as ShipmentEvent | undefined)?.location ?? null)
        : null,
      trackingNumberMasked: shipment.tracking_number
        ? `...${shipment.tracking_number.slice(-4)}`
        : null,
      eta: {
        minDays: 2,
        maxDays: 7,
      },
      shippedAt: shipment.shipped_at,
      deliveredAt: shipment.delivered_at,
      trackingUrl: shipment.tracking_url || null,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
}

async function getByOrderId(id: string) {
  const supabase = createRouteHandlerClient();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(
      `
      id,
      order_number,
      status,
      created_at,
      order_shipments (
        id,
        tracking_number,
        carrier,
        status,
        shipped_at,
        estimated_delivery_at,
        delivered_at,
        tracking_events
      )
    `
    )
    .eq('id', id)
    .single();

  if (orderError || !order) {
    return null;
  }

  const { data: jobs } = await supabase
    .from('fulfillment_jobs')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    order: {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      createdAt: order.created_at,
    },
    shipments: order.order_shipments || [],
    fulfillmentJobs: jobs || [],
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    const tokenResponse = await getByTrackingToken(id);
    if (tokenResponse) {
      return tokenResponse;
    }

    const orderResponse = await getByOrderId(id);
    if (orderResponse) {
      return orderResponse;
    }

    return NextResponse.json(
      { error: 'Tracking information not found or link expired' },
      { status: 404 }
    );
  } catch (error: unknown) {
    console.error('Error fetching tracking info:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve tracking information' },
      { status: 500 }
    );
  }
}
