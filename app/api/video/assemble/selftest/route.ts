/**
 * GET /api/video/assemble/selftest?probe=mva-ffmpeg-selftest
 *
 * Verification-only: proves the bundled ffmpeg-static binary EXECUTES inside the
 * Vercel serverless runtime and that the xfade + audio filtergraph runs (the
 * platform risk for Option B). Generates two 1s test clips in /tmp, stitches
 * them with the SAME buildFilterComplex used in production, and returns proof —
 * no auth, no upload, no user data. Cheap + harmless; remove after verification.
 */
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { buildFilterComplex } from '@/lib/orchestrator/ffmpeg-filtergraph';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const exec = promisify(execFile);

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'mva-ffmpeg-selftest') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) return NextResponse.json({ ok: false, stage: 'binary', error: 'ffmpeg-static path null' }, { status: 500 });

  const started = Date.now();
  const dir = await mkdtemp(join(tmpdir(), 'selftest_'));
  try {
    // 1. binary executes?
    const ver = await exec(bin, ['-version'], { maxBuffer: 1 << 22 });
    const version = ver.stdout.split('\n')[0] ?? '';

    // 2. generate two 1s clips with audio
    const c1 = join(dir, 'c1.mp4'); const c2 = join(dir, 'c2.mp4'); const out = join(dir, 'out.mp4');
    await exec(bin, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', c1], { maxBuffer: 1 << 24 });
    await exec(bin, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', c2], { maxBuffer: 1 << 24 });

    // 3. stitch with the production filtergraph (clipSec=1 for the test)
    const { filter, vmap, amap } = buildFilterComplex({ nClips: 2, hasVoice: false, hasMusic: false, hasSfx: false, fps: 24, duckPct: 30, clipSec: 1 });
    const args = ['-y', '-i', c1, '-i', c2, '-filter_complex', filter, '-map', vmap];
    if (amap) args.push('-map', amap);
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', out);
    await exec(bin, args, { maxBuffer: 1 << 26 });

    const sz = (await stat(out)).size;
    return NextResponse.json({
      ok: sz > 0,
      ffmpegExecutes: true,
      version,
      stitchedBytes: sz,
      filter,
      ms: Date.now() - started,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, stage: 'exec', error: e instanceof Error ? e.message.slice(0, 300) : String(e) }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
