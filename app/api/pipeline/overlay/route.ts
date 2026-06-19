// Master Prompt §7.1 — B2B marketing-overlay endpoint. Burns animated lower-thirds, a
// price chip, spec bullets and a CTA pill over a finished film via FFmpeg drawtext.
// Guarded by a header key (spends an FFmpeg re-encode). Input:
//   { videoUrl, marketing: { overlayText, priceTag, cta, website, specs[] }, durationSec? }
import { NextRequest, NextResponse } from 'next/server';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { applyMarketingOverlays, type MarketingOverlay } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 150;

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-selftest-key');
  if (!key || key !== process.env.MIGRATION_RUN_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { videoUrl?: unknown; marketing?: unknown; durationSec?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl : '';
  if (!videoUrl) return NextResponse.json({ error: 'videoUrl required' }, { status: 400 });
  const marketing = (body.marketing && typeof body.marketing === 'object' ? body.marketing : {}) as MarketingOverlay;
  const durationSec = typeof body.durationSec === 'number' ? body.durationSec : 30;

  const dir = await mkdtemp(join(tmpdir(), 'overlay-'));
  const inPath = join(dir, 'in.mp4');
  const outPath = join(dir, 'out.mp4');
  try {
    const r = await fetch(videoUrl, { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return NextResponse.json({ ok: false, error: `fetch video ${r.status}` }, { status: 502 });
    await writeFile(inPath, Buffer.from(await r.arrayBuffer()));

    const ov = await applyMarketingOverlays(inPath, outPath, marketing, durationSec);
    if (!ov.ok) {
      return NextResponse.json({ ok: false, error: ov.error, fontExists: ov.fontExists, fontPath: ov.fontPath }, { status: 502 });
    }

    const out = await readFile(outPath);
    const path = `overlays/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    const url = await uploadAndSign('uploads', path, out.toString('base64'), 'video/mp4', 604_800);
    return NextResponse.json({ ok: true, url, bytes: out.byteLength });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
