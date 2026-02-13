/**
 * GET /api/shipping/track
 * 
 * Returns shipping tracking info for an order
 * 
 * Query params:
 * - orderId: UUID of order
 * 
 * Response: { orderId, shippingStatus, trackingCode, estimatedDaysMin/Max, events[] }
 * 
 * Auth: Request must come from order buyer or store owner (RLS enforced by DB)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/env/server';
import { getTracking } from '@/lib/shipping';
import { ApiResponse } from '@/lib/commerce/types';

// Force dynamic rendering (uses cookies at runtime)
export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'orderId is required' },
        } as ApiResponse<any>,
        { status: 400 }
      );
    }

    const tracking = await getTracking(orderId);

    return NextResponse.json(
      {
        success: true,
        data: tracking,
      } as ApiResponse<any>,
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    
    if (message.includes('not found') || message.includes('access denied')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Order not found or access denied' },
        } as ApiResponse<any>,
        { status: 404 }
      );
    }

    console.error('[GET /api/shipping/track]', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tracking' },
      } as ApiResponse<any>,
      { status: 500 }
    );
  }
}
