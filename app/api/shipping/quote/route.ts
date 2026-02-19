// POST /api/shipping/quote
// Get available shipping rates for a given address
// Request: { sellerUserId, countryCode, city, items }
// Response: [ { rateId, name, minDays, maxDays, priceCents, currency } ]

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ShippingService } from '@/lib/shipping/ShippingService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { sellerUserId, countryCode, city } = await request.json();

    if (!sellerUserId || !countryCode || !city) {
      return NextResponse.json(
        { error: 'Missing required fields: sellerUserId, countryCode, city' },
        { status: 400 }
      );
    }

    const shippingService = new ShippingService(supabase);
    const quotes = await shippingService.getShippingQuotes(
      sellerUserId,
      countryCode,
      city
    );

    return NextResponse.json({ rates: quotes }, { status: 200 });
  } catch (error) {
    console.error('Error in shipping quote:', error);
    return NextResponse.json(
      { error: 'Failed to get shipping quotes' },
      { status: 500 }
    );
  }
}
