/**
 * POST /api/avatar/create — start a custom avatar (a 3D scan, a photo set, a video capture, a selfie pack, a text
 * prompt). Built-in avatars only (GG, 2026-10-22; MASTER TASK v3.1 PR 9): a signed-in caller gets 422
 * `capability_unavailable` (gap `custom_avatar`) before anything is written. The route used to insert an `avatar_assets`
 * row marked `processing` that nothing ever finished.
 */
import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/response';
import { billingLocale } from '@/lib/api/billingCopy';
import { customAvatarBody } from '@/lib/avatar/curated';
import { requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return apiError(error, 401, 'Unauthorized');
    return apiError(error, 500, 'Failed to create avatar asset');
  }
  return NextResponse.json(customAvatarBody(billingLocale(request)), { status: 422 });
}
