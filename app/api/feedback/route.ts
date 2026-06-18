import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Per-message 👍/👎 feedback sink (#9). Lightweight by design: validates and logs
 * to the Vercel function logs so feedback is observable immediately without a new
 * DB table. Swap the console.log for a Supabase insert or PostHog capture when you
 * want a dashboard / aggregation.
 */
export async function POST(req: NextRequest) {
  try {
    const { rating, preview } = (await req.json()) as { rating?: unknown; preview?: unknown };
    if (rating !== 'up' && rating !== 'down') {
      return NextResponse.json({ error: 'rating must be "up" or "down"' }, { status: 400 });
    }
    const safePreview = typeof preview === 'string' ? preview.slice(0, 280) : '';
    console.log('[feedback]', JSON.stringify({ rating, preview: safePreview, at: new Date().toISOString() }));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
}
