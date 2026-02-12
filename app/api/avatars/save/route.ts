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

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const isValidOptionalUrl = (value?: string | null) => {
  if (!value) return true;
  if (value.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const saveAvatarSchema = z.object({
  owner_id: z.string().min(3),
  model_url: z.string().optional().nullable().refine(isValidOptionalUrl, {
    message: 'Invalid model_url',
  }),
  preview_image_url: z.string().optional().nullable().refine(isValidOptionalUrl, {
    message: 'Invalid preview_image_url',
  }),
  name: z.string().min(1).max(120).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
    if (rateLimitError) return rateLimitError;

    const body = await request.json();
    const parsed = saveAvatarSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(new Error('Invalid request'), 400, 'Invalid request');
    }
    
    // Validate required fields
    const { owner_id, model_url, preview_image_url, name } = parsed.data;
    
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
        owner_id,
        model_url: model_url || null,
        preview_image_url: preview_image_url || null,
        name: name || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error saving avatar:', error);
      return apiError(error, 500, 'Failed to save avatar');
    }

    return apiSuccess({
      success: true,
      avatar: data,
    }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to save avatar');
  }
}
