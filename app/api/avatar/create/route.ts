import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServerClient, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const createAvatarSchema = z.object({
  avatar_goal: z.enum(['personal', 'business', 'team']),
  avatar_type: z.enum(['scan', 'studio', 'stylized', 'fast']),
  input_method: z.enum(['3d_upload', 'phone_scan', 'photo_set', 'video_capture', 'selfie_pack', 'text_to_avatar']),
  notes: z.string().max(5000).optional(),
  text_prompt: z.string().max(5000).optional(),
  output_options: z.object({
    fullBody: z.boolean(),
    background: z.enum(['transparent', 'studio', 'none']),
    rigging: z.boolean(),
  }),
});

const UPLOAD_PLANS: Record<
  z.infer<typeof createAvatarSchema>['input_method'],
  { requiredFilesCount: number; allowedExtensions: string[]; maxFileSize: number }
> = {
  '3d_upload': {
    requiredFilesCount: 1,
    allowedExtensions: ['.glb', '.gltf', '.fbx', '.obj', '.zip'],
    maxFileSize: 200 * 1024 * 1024,
  },
  phone_scan: {
    requiredFilesCount: 1,
    allowedExtensions: ['.zip', '.usdz', '.ply', '.obj'],
    maxFileSize: 300 * 1024 * 1024,
  },
  photo_set: {
    requiredFilesCount: 6,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSize: 20 * 1024 * 1024,
  },
  video_capture: {
    requiredFilesCount: 1,
    allowedExtensions: ['.mp4', '.mov', '.webm'],
    maxFileSize: 500 * 1024 * 1024,
  },
  selfie_pack: {
    requiredFilesCount: 12,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSize: 20 * 1024 * 1024,
  },
  text_to_avatar: {
    requiredFilesCount: 0,
    allowedExtensions: [],
    maxFileSize: 0,
  },
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const payload = createAvatarSchema.safeParse(await request.json());

    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid avatar create payload');
    }

    const supabase = createServerClient();
    const { data: asset, error } = await supabase
      .from('avatar_assets')
      .insert({
        user_id: user.id,
        avatar_goal: payload.data.avatar_goal,
        avatar_type: payload.data.avatar_type,
        input_method: payload.data.input_method,
        status: 'processing',
        meta: {
          notes: payload.data.notes ?? null,
          text_prompt: payload.data.text_prompt ?? null,
          output_options: payload.data.output_options,
        },
      })
      .select('id')
      .single();

    if (error || !asset) {
      return apiError(error ?? new Error('Insert failed'), 500, 'Failed to create avatar asset');
    }

    const uploadPlan = UPLOAD_PLANS[payload.data.input_method];

    return apiSuccess({
      avatarAssetId: asset.id,
      uploadPlan: {
        ...uploadPlan,
        storagePathPrefix: `avatar-assets/${user.id}/${asset.id}`,
      },
    }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    return apiError(error, 500, 'Failed to create avatar asset');
  }
}
