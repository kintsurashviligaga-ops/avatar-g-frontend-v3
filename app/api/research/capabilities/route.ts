/**
 * GET /api/research/capabilities → { available, reason?, credits, filesAvailable, maxActive }
 *
 * Is Deep Research usable on THIS deployment? Probed, never assumed (lib/research/capabilities.ts): the opt-out switch, a
 * Google key and the `research_jobs` table must all be there. The composer asks once and shows the mode as "opening soon"
 * when `available` is false. `credits` is the price the start button shows — the same number POST /api/research/start
 * charges and demands back as `confirmedCredits`. Public (no user data), never cached.
 */
import { NextRequest } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getResearchCapabilities } from '@/lib/research/capabilities';
import { json } from '@/lib/research/http';
import { getResearchRuntime } from '@/lib/research/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;
  const rt = getResearchRuntime();
  return json(await getResearchCapabilities(rt?.db ?? null));
}
