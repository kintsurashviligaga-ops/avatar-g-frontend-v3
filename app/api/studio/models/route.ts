/**
 * GET /api/studio/models[?service=video] — the model picker's source: OUR registry, Georgian labels first,
 * only what this deployment has enabled (HF_ENABLED_MODELS). No endpoints, no schemas, no costs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { listModels, publicModel } from '@/lib/providers/registry';
import type { StudioService } from '@/lib/providers/types';
import { studioV2Enabled } from '@/lib/studio/flags';
import { notFound } from '@/lib/studio/http';

export const dynamic = 'force-dynamic';

const SERVICES: ReadonlySet<StudioService> = new Set(['image', 'video', 'avatar', 'motion', 'remix']);

export async function GET(req: NextRequest) {
  if (!studioV2Enabled()) return notFound();
  const s = req.nextUrl.searchParams.get('service');
  const service = s && SERVICES.has(s as StudioService) ? (s as StudioService) : undefined;
  return NextResponse.json({ models: listModels({ service }).map(publicModel) });
}
