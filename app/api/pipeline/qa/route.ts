// Master Prompt §6.3 — Vision QA gate verification. POST an image/frame URL → Claude
// Vision verdict { passed, reason }. Guarded (spends a Claude vision call).
import { NextRequest, NextResponse } from 'next/server';
import { VisionQualityGate } from '@/lib/pipeline/quality/vision-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const gate = new VisionQualityGate();

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-selftest-key');
  if (!key || key !== process.env.MIGRATION_RUN_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: { imageUrl?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

  const verdict = await gate.inspectFrame(imageUrl);
  return NextResponse.json({ ok: true, verdict });
}
