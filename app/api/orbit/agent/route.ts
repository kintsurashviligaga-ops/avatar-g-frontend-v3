export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/orbit/agent — retired (MASTER TASK v3.1, audit F-04).
 *
 * It streamed the multi-vendor chatEngine (OpenRouter / OpenAI) and no screen calls it. Since 2026-10-09 it answered 404
 * unless the AI_GOOGLE_ONLY=0 kill switch brought the old stream back; that switch is gone, so it is a 404 with no
 * provider code behind it.
 */
export async function POST() {
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}
