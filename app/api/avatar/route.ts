import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const personaSchema = z.object({
  name: z.string().min(2).max(120),
  personality: z.enum(['friendly', 'professional', 'funny', 'custom']),
  voice_id: z.string().min(1).max(120).optional().nullable(),
  system_prompt: z.string().max(8000).optional().nullable(),
});

const patchSchema = personaSchema.partial();

/**
 * GET /api/avatar
 *
 * Returns the current user's persona avatar (the row written by the
 * onboarding wizard, identified by `name IS NOT NULL`) or
 * `{ avatar: null }` when the user has not onboarded yet.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await authedClientFromRequest(request);
    if (!user) return apiError(new Error('UNAUTHENTICATED'), 401, 'Unauthorized');

    const { data, error } = await supabase
      .from('avatars')
      .select('id, name, personality, voice_id, system_prompt, image_url, created_at, updated_at')
      .eq('user_id', user.id)
      .not('name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      structuredLog('error', 'avatar.get.failed', { message: error.message });
      return apiError(error, 500, 'Failed to load avatar');
    }

    return apiSuccess({ avatar: data ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    structuredLog('error', 'avatar.get.exception', {
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(error, 500, 'Failed to load avatar');
  }
}

/**
 * POST /api/avatar
 *
 * Creates or updates the user's persona avatar. Idempotent: a second POST
 * by the same user updates the existing row (enforced via the partial
 * unique index `avatars_user_persona_unique_idx`).
 *
 * Body: { name, personality, voice_id?, system_prompt? }
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await authedClientFromRequest(request);
    if (!user) return apiError(new Error('UNAUTHENTICATED'), 401, 'Unauthorized');

    const json = await request.json().catch(() => null);
    const parsed = personaSchema.safeParse(json);

    if (!parsed.success) {
      return apiError(parsed.error, 400, 'Invalid avatar payload');
    }

    // Look for existing persona row.
    const { data: existing, error: lookupError } = await supabase
      .from('avatars')
      .select('id')
      .eq('user_id', user.id)
      .not('name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      structuredLog('error', 'avatar.post.lookup_failed', { message: lookupError.message });
      return apiError(lookupError, 500, 'Failed to save avatar');
    }

    const payload = {
      name: parsed.data.name,
      personality: parsed.data.personality,
      voice_id: parsed.data.voice_id ?? null,
      system_prompt: parsed.data.system_prompt ?? null,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { data, error } = await supabase
        .from('avatars')
        .update(payload)
        .eq('id', existing.id)
        .eq('user_id', user.id)
        .select('id, name, personality, voice_id, system_prompt')
        .single();

      if (error) {
        structuredLog('error', 'avatar.post.update_failed', { message: error.message });
        return apiError(error, 500, 'Failed to save avatar');
      }

      return apiSuccess({ avatar: data });
    }

    const { data, error } = await supabase
      .from('avatars')
      .insert({
        user_id: user.id,
        status: 'completed',
        progress: 100,
        ...payload,
      })
      .select('id, name, personality, voice_id, system_prompt')
      .single();

    if (error) {
      structuredLog('error', 'avatar.post.insert_failed', { message: error.message });
      return apiError(error, 500, 'Failed to save avatar');
    }

    return apiSuccess({ avatar: data }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    structuredLog('error', 'avatar.post.exception', {
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(error, 500, 'Failed to save avatar');
  }
}

/**
 * PATCH /api/avatar
 *
 * Partial update of the user's persona avatar.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await authedClientFromRequest(request);
    if (!user) return apiError(new Error('UNAUTHENTICATED'), 401, 'Unauthorized');

    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);

    if (!parsed.success) {
      return apiError(parsed.error, 400, 'Invalid avatar payload');
    }

    const { data: existing, error: lookupError } = await supabase
      .from('avatars')
      .select('id')
      .eq('user_id', user.id)
      .not('name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      structuredLog('error', 'avatar.patch.lookup_failed', { message: lookupError.message });
      return apiError(lookupError, 500, 'Failed to update avatar');
    }

    if (!existing?.id) {
      return apiError(new Error('No avatar'), 404, 'Avatar not found');
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.personality !== undefined) updatePayload.personality = parsed.data.personality;
    if (parsed.data.voice_id !== undefined) updatePayload.voice_id = parsed.data.voice_id;
    if (parsed.data.system_prompt !== undefined) updatePayload.system_prompt = parsed.data.system_prompt;

    const { data, error } = await supabase
      .from('avatars')
      .update(updatePayload)
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select('id, name, personality, voice_id, system_prompt')
      .single();

    if (error) {
      structuredLog('error', 'avatar.patch.update_failed', { message: error.message });
      return apiError(error, 500, 'Failed to update avatar');
    }

    return apiSuccess({ avatar: data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    structuredLog('error', 'avatar.patch.exception', {
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(error, 500, 'Failed to update avatar');
  }
}
