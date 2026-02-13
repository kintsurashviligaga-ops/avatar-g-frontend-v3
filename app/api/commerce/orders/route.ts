/**
 * Avatar G - Orders API Routes
 * POST /api/commerce/orders (create)
 * GET /api/commerce/orders (list)
 * GET /api/commerce/orders/[id] (get)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  createOrder,
  getUserOrders,
  getOrderById,
  computeOrderSplit,
} from '@/lib/commerce';
import { getServerEnv } from '@/lib/env/server';

// Helper: Get authenticated user
async function getAuthUser(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    getServerEnv().NEXT_PUBLIC_SUPABASE_URL || '',
    getServerEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
}

// ============================================
// GET /api/commerce/orders
// List user's orders
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser(request);

    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }, { status: 401 });
    }

    // Get query params
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const result = await getUserOrders(user.id, limit, offset);

    return NextResponse.json({
      success: true,
      data: {
        orders: result.orders.map((order: any) => ({
          id: order.id,
          status: order.status,
          total: order.total_amount,
          subtotal: order.subtotal_amount,
          vat: order.vat_amount,
          platformFee: order.platform_fee_amount,
          affiliateFee: order.affiliate_fee_amount,
          createdAt: order.created_at,
        })),
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore: offset + limit < result.total,
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/commerce/orders] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch orders',
      },
    }, { status: 500 });
  }
}

// ============================================
// POST /api/commerce/orders
// Create new order
// ============================================

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser(request);

    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.subtotalAmount || body.subtotalAmount <= 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'subtotalAmount is required and must be > 0',
        },
      }, { status: 400 });
    }

    // Compute split (server-side only)
    const split = await computeOrderSplit({
      grossAmount: body.subtotalAmount,
      vatRate: body.vatRate || 18,
      platformFeePercent: body.platformFeePercent || 5,
      affiliateFeePercent: body.affiliateFeePercent || 5,
    });

    // Validate total matches
    if (body.totalAmount && Math.abs(body.totalAmount - split.totalAmount) > 0.01) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_TOTAL',
          message: 'Total amount does not match computed split. Must match server calculation.',
          details: {
            provided: body.totalAmount,
            computed: split.totalAmount,
          },
        },
      }, { status: 400 });
    }

    // Create order
    const order = await createOrder(user.id, {
      subtotalAmount: body.subtotalAmount,
      vatEnabled: body.vatEnabled || true,
      vatRate: body.vatRate || 18,
      stripePaymentIntentId: body.stripePaymentIntentId,
      platformFeeAmount: split.platformFeeAmount,
      affiliateFeeAmount: split.affiliateFeeAmount,
      totalAmount: split.totalAmount,
      buyerCountryCode: body.buyerCountryCode || 'US',
      buyerEmail: body.buyerEmail || user.email,
      buyerName: body.buyerName,
      metadata: body.metadata || {},
    });

    return NextResponse.json({
      success: true,
      data: {
        id: order.id,
        status: order.status,
        subtotal: order.subtotal_amount,
        vat: order.vat_amount,
        platformFee: order.platform_fee_amount,
        affiliateFee: order.affiliate_fee_amount,
        total: order.total_amount,
        split,
        createdAt: order.created_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/commerce/orders] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create order',
        details: error instanceof Error ? error.message : undefined,
      },
    }, { status: 500 });
  }
}

// ============================================
// GET /api/commerce/orders/[id]
// Get specific order
// ============================================

export async function GET_ORDER(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, error } = await getAuthUser(request);

    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }, { status: 401 });
    }

    const order = await getOrderById(user.id, params.id);

    if (!order) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Order not found',
        },
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: order.id,
        status: order.status,
        fulfillmentStatus: order.fulfillment_status,
        subtotal: order.subtotal_amount,
        vat: order.vat_amount,
        platformFee: order.platform_fee_amount,
        affiliateFee: order.affiliate_fee_amount,
        total: order.total_amount,
        buyer: {
          name: order.buyer_name,
          email: order.buyer_email,
          country: order.buyer_country_code,
        },
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
    });
  } catch (error) {
    console.error('[GET /api/commerce/orders/[id]] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch order',
      },
    }, { status: 500 });
  }
}
