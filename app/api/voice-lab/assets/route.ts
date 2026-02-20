import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { VoiceAsset } from '@/lib/voice-lab/types';

export const dynamic = 'force-dynamic';

const assetSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  kind: z.enum(['recording', 'upload', 'generated']),
  mime: z.string().min(2).max(120),
  storage_path: z.string().max(500).nullable().optional(),
  url: z.string().max(1000).nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = assetSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid voice asset payload');
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, asset: payload.data, message: 'Guest mode stores asset metadata locally.' });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('voice_assets')
      .insert({
        owner_id: user.id,
        project_id: payload.data.project_id ?? null,
        kind: payload.data.kind,
        mime: payload.data.mime,
        storage_path: payload.data.storage_path ?? null,
        url: payload.data.url ?? null,
        duration_ms: payload.data.duration_ms ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      return apiError(error ?? new Error('Insert failed'), 500, 'Failed to create voice asset');
    }

    return apiSuccess({ guest: false, asset: data as VoiceAsset }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create voice asset');
  }
}
