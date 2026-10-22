/**
 * POST /api/replicate/image — raw NanoBanana / Replicate image models. It has no Google engine, so every request is refused with 503 google_only before any charge, upload or
 * provider call, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1, lib/providers/mediaPolicy). Kept as a route so an
 * old client gets a clear answer instead of a 404.
 */
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return refuseOutsideEngine(req);
}
