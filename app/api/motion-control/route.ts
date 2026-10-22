/**
 * POST /api/motion-control — animate a character photo with Kling (Replicate). It has no Google engine, so every
 * request is refused with 503 google_only before any charge, upload or provider call, whatever MEDIA_GOOGLE_ONLY says
 * (MASTER TASK v3.1, lib/providers/mediaPolicy). GET /api/motion-control/status stays open, so a job started before
 * this change still finishes.
 */
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import 'server-only';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return refuseOutsideEngine(req);
}
