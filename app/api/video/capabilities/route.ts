/**
 * GET /api/video/capabilities — which film lengths this deployment can render TODAY, for the studio's length picker.
 *
 *   { longform: boolean, maxSeconds: number }
 *
 * `longform` is true only when the long-form pipeline (104 … 240 s, lib/video/longform) can really take an order:
 * LONGFORM_VIDEO_ENABLED is on AND a valid LONGFORM_MARGIN prices it (the create route answers 503 "pricing_unconfigured"
 * without one — limits.longformPricingFromEnv is the one reading of that condition, so this route can never say "open"
 * where the order route would refuse). The picker shows every length above 1:36 locked ("opening soon") until this says
 * true. `maxSeconds` is the longest film accepted: 240 when open, otherwise the film pipeline's 96.
 *
 * Booleans and one number — never an env value, a margin, a price, or a reason. Public (the picker is shown to guests too)
 * and fail-closed: anything that throws answers "closed".
 */
import { NextResponse } from 'next/server';
import { FILM_MAX_SEC, VIDEO_MAX_SEC } from '@/lib/video/duration';
import { longformPricingFromEnv } from '@/lib/video/longform/limits';
import { isLongformEnabled } from '@/lib/video/longform/plan';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface VideoCapabilitiesBody {
  longform: boolean;
  maxSeconds: number;
}

export async function GET() {
  let longform = false;
  try {
    longform = isLongformEnabled() && longformPricingFromEnv().ok;
  } catch {
    longform = false;
  }
  const body: VideoCapabilitiesBody = { longform, maxSeconds: longform ? VIDEO_MAX_SEC : FILM_MAX_SEC };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
