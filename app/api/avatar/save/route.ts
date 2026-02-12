// POST /api/avatar/save - Save a generated avatar to the database

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { SaveAvatarRequest, Avatar } from '@/types/platform';

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase env vars are missing');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    // Get auth header and verify user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const { data, error: authError } = await supabase.auth.getUser(token);

    if (authError || !data.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = data.user.id;

    // Parse and validate request body
    const body: SaveAvatarRequest = await request.json();

    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    if (!body.metadata) {
      return NextResponse.json(
        { error: 'Metadata is required' },
        { status: 400 }
      );
    }

    // Upload preview image if provided
    let previewImageUrl = null;
    if (body.preview_image_url) {
      // If it's a data URL, upload it to storage
      if (body.preview_image_url.startsWith('data:')) {
        const base64Data = body.preview_image_url.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `${userId}/${Date.now()}-avatar.jpg`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatar-previews')
          .upload(filename, buffer, {
            contentType: 'image/jpeg'
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          return NextResponse.json(
            { error: 'Failed to upload preview image' },
            { status: 500 }
          );
        }

        previewImageUrl = supabase.storage
          .from('avatar-previews')
          .getPublicUrl(uploadData.path).data.publicUrl;
      } else {
        previewImageUrl = body.preview_image_url;
      }
    }

    // Insert avatar into database
    const { data: avatar, error } = await supabase
      .from('avatars')
      .insert({
        user_id: userId,
        title: body.title,
        description: body.description,
        preview_image_url: previewImageUrl,
        metadata_json: body.metadata
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to save avatar' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      avatar: avatar as Avatar
    });
  } catch (err) {
    console.error('Error in save avatar:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
