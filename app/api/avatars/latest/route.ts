/**
 * GET /api/avatars/latest
 * Fetch the latest avatar for a user (authenticated or anonymous)
 * 
 * Query params:
 * - owner_id: Required. User ID (auth) or anonymous UUID
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

interface AvatarRow {
  id: string;
  owner_id: string;
  model_url?: string;
  preview_image_url?: string;
  name?: string;
  created_at: string;
}

interface LatestAvatarResponse {
  success: boolean;
  avatar?: AvatarRow | null;
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('owner_id');
    
    if (!ownerId) {
      return NextResponse.json(
        { success: false, error: 'owner_id query param is required' },
        { status: 400 }
      );
    }
    
    // Get Supabase service role client (server-side only)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Query latest avatar for this owner
    const { data, error } = await supabase
      .from('avatars')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching latest avatar:', error);
      return NextResponse.json(
        { success: false, error: `Failed to fetch avatar: ${error.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      {
        success: true,
        avatar: data || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Latest avatar endpoint error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
