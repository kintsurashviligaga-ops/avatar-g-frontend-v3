import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServerClient, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const uploadCompleteSchema = z.object({
  avatarAssetId: z.string().uuid(),
  input_urls: z.array(z.string().url()).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const payload = uploadCompleteSchema.safeParse(await request.json());

    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid upload completion payload');
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from('avatar_assets')
      .update({ input_urls: payload.data.input_urls })
      .eq('id', payload.data.avatarAssetId)
      .eq('user_id', user.id);

    if (error) {
      return apiError(error, 500, 'Failed to update uploaded asset inputs');
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    return apiError(error, 500, 'Failed to update uploaded asset inputs');
  }
}
