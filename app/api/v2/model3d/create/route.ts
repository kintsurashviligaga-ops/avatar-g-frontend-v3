import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/v2/model3d/create — a 3D reconstruction (TRELLIS on Replicate). It has no Google engine, so every request
 * is refused with 503 google_only before any charge, upload or provider call, whatever MEDIA_GOOGLE_ONLY says (MASTER
 * TASK v3.1, lib/providers/mediaPolicy). /api/v2/model3d/status stays open, so a reconstruction started before this
 * change still finishes and a failed one is still refunded.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return refuseOutsideEngine(req);
}
