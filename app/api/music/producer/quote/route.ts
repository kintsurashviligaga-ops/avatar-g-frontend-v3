/**
 * POST /api/music/producer/quote — the price of every length before anything is pressed (free: no provider call, no charge).
 * Same gate as the run route: 404 unless MUSIC_PRODUCER_V2 allows this user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { producerAllowed } from '@/lib/music/producer/flag';
import { producerBook, singsGeorgian } from '@/lib/music/producer/book';
import { lengthPrices, quoteProducer } from '@/lib/music/producer/price';
import { parseProducerSpec, PRODUCER_LENGTHS } from '@/lib/music/producer/spec';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'sign_in' }, { status: 401 });
  if (!producerAllowed(await isAdminUserAsync(user))) return NextResponse.json({ ok: false, error: 'feature_off' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { spec?: unknown };
  const parsed = parseProducerSpec(body.spec);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: 'invalid_request', issues: parsed.errors }, { status: 400 });
  const book = producerBook();
  return NextResponse.json({
    ok: true, book,
    lengths: lengthPrices(book, PRODUCER_LENGTHS),
    quote: quoteProducer('generate', parsed.spec.lengthSec, book),
    extend: quoteProducer('extend', 30, book).credits,
    georgianBeta: singsGeorgian(parsed.spec),
    stems: false,
  });
}
