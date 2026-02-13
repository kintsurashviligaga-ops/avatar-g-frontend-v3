/**
 * POST /api/shipping/select-profile
 * 
 * Assign shipping profile to order and recompute shipping cost
 * Updates order total if shipping cost changes
 * 
 * Body:
 * {
 *   orderId: UUID,
 *   shippingProfileId: UUID,
 *   weightGrams?: number
 * }
 * 
 * Auth: Only store owner allowed
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/env/server';
import { selectShippingProfile } from '@/lib/shipping';
import { ApiResponse } from '@/lib/commerce/types';

// Force dynamic rendering
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
    const { orderId, shippingProfileId, weightGrams } = body;

    if (!orderId || !shippingProfileId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'orderId and shippingProfileId are required',
          },
        } as ApiResponse<any>,
        { status: 400 }
      );
    }

    const result = await selectShippingProfile({
      orderId,
      shippingProfileId,
      weightGrams,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      } as ApiResponse<any>,
      { status: 200 }
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

    if (message.includes('not found') || message.includes('not belong')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message },
        } as ApiResponse<any>,
        { status: 404 }
      );
    }

    console.error('[POST /api/shipping/select-profile]', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to select shipping profile' },
      } as ApiResponse<any>,
      { status: 500 }
    );
  }
}
