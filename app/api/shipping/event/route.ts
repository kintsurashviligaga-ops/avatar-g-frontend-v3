/**
 * POST /api/shipping/event
 * 
 * Add shipping event and update order status
 * 
 * Body:
 * {
 *   orderId: UUID,
 *   status: 'pending' | 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned',
 *   location?: string,
 *   trackingCode?: string,
 *   metadata?: Record<string, any>
 * }
 * 
 * Auth: Only store owner allowed
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/env/server';
import { addShippingEvent } from '@/lib/shipping';
import { ApiResponse } from '@/lib/commerce/types';

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

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        } as ApiResponse<any>,
        { status: 401 }
      );
    }

    const body = await request.json();
    const { orderId, status, location, trackingCode, metadata } = body;

    if (!orderId || !status) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'orderId and status are required',
          },
        } as ApiResponse<any>,
        { status: 400 }
      );
    }

    const event = await addShippingEvent({
      orderId,
      status,
      location,
      trackingCode,
      metadata,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          event,
          message: 'Shipping event recorded and order status updated',
        },
      } as ApiResponse<any>,
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';

    if (message.includes('Unauthorized')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message },
        } as ApiResponse<any>,
        { status: 403 }
      );
    }

    if (message.includes('not found') || message.includes('not exist')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message },
        } as ApiResponse<any>,
        { status: 404 }
      );
    }

    console.error('[POST /api/shipping/event]', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to add shipping event' },
      } as ApiResponse<any>,
      { status: 500 }
    );
  }
}
