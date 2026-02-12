/**
 * POST /api/avatars/save
 * Save user avatar to Supabase
 * 
 * Request body:
 * {
 *   model_url?: string;
 *   preview_image_url?: string;
 *   name?: string;
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

interface SaveAvatarRequest {
  model_url?: string;
  preview_image_url?: string;
  name?: string;
  owner_id: string; // Required: either auth user id or anon id
}

interface SaveAvatarResponse {
  success: boolean;
  avatar?: {
    id: string;
    owner_id: string;
    model_url?: string;
    preview_image_url?: string;
    created_at: string;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as SaveAvatarRequest;
    
    // Validate required fields
    if (!body.owner_id) {
      return NextResponse.json(
        { success: false, error: 'owner_id is required' },
        { status: 400 }
      );
    }
    
    // Get Supabase service role client (server-side only)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Create avatar record
    const avatarId = uuidv4();
    const { data, error } = await supabase
      .from('avatars')
      .insert({
        id: avatarId,
        owner_id: body.owner_id,
        model_url: body.model_url || null,
        preview_image_url: body.preview_image_url || null,
        name: body.name || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error saving avatar:', error);
      return NextResponse.json(
        { success: false, error: `Failed to save avatar: ${error.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      {
        success: true,
        avatar: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Avatar save endpoint error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
