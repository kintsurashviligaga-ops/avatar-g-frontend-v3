/** @jest-environment node */
/**
 * OPT-IN: stitch.ts's argv run against the REAL bundled ffmpeg (ffmpeg-static) on synthetic lavfi clips — local CPU
 * only, no network, no provider. Skipped unless LONGFORM_FFMPEG_IT=1 (it shells out and takes ~1 s):
 *
 *   LONGFORM_FFMPEG_IT=1 npx jest lib/video/longform/stitch.ffmpeg.test.ts
 *
 * This is how the music loop was chosen: `-stream_loop -1` produced a complete file and then HUNG the process (the
 * 30 s exec timeout below is what catches that), while `aloop` exits cleanly. Every exec is bounded for that reason.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { buildLastFrameArgs, buildProbeArgs, buildStitchPlan, parseProbe, type StitchClip } from './stitch';

const enabled = process.env.LONGFORM_FFMPEG_IT === '1' && typeof ffmpegPath === 'string' && existsSync(ffmpegPath);
const maybe = enabled ? describe : describe.skip;

maybe('stitch plans on the real ffmpeg', () => {
  const bin = ffmpegPath as unknown as string;
  let W = '';
  const run = (args: string[]) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, killSignal: 'SIGKILL' });
  const probe = (p: string): string => {
    try {
      run(buildProbeArgs(p));
      return '';
    } catch (e) {
      return String((e as { stderr?: Buffer }).stderr ?? '');
    }
  };
  const clip = (p: string): StitchClip => {
    const pr = parseProbe(probe(p));
    return { source: p, durationSec: pr.durationSec ?? 2, bytes: statSync(p).size, probe: pr };
  };

  beforeAll(() => {
    W = mkdtempSync(join(tmpdir(), 'longform-it-'));
    for (let i = 0; i < 3; i++) {
      run(['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=2', '-f', 'lavfi', '-i', `sine=frequency=${300 + i * 100}:sample_rate=48000:duration=2`,
        '-ac', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(W, `c${i}.mp4`)]);
    }
    run(['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(W, 'odd.mp4')]);
    run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=1.5', '-c:a', 'aac', join(W, 'bed.m4a')]);
  }, 60_000);
  afterAll(() => {
    if (W) rmSync(W, { recursive: true, force: true });
  });

  test('copy + a looped 1.5 s bed under 6 s of clips: exits, ~6 s, audio present', () => {
    const clips = [0, 1, 2].map((i) => clip(join(W, `c${i}.mp4`)));
    const r = buildStitchPlan({ clips, workDir: W, outName: 'copy.mp4', music: { source: join(W, 'bed.m4a'), durationSec: 1.5 } });
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.mode).toBe('copy');
    writeFileSync(r.plan.concatList!.path, r.plan.concatList!.content);
    run(r.plan.argv);
    const out = parseProbe(probe(r.plan.outPath));
    expect(out.durationSec).toBeGreaterThan(5.8);
    expect(out.durationSec).toBeLessThan(6.3);
    expect(out.audio).not.toBeNull();
    run(buildLastFrameArgs(r.plan.outPath, join(W, 'last.jpg')));
    expect(statSync(join(W, 'last.jpg')).size).toBeGreaterThan(1000);
  }, 60_000);

  test('re-encode fallback for a mismatched, silent clip: exits, ~6 s, clip 0\'s frame', () => {
    const clips = [clip(join(W, 'c0.mp4')), clip(join(W, 'odd.mp4')), clip(join(W, 'c2.mp4'))];
    const r = buildStitchPlan({ clips, workDir: W, outName: 're.mp4', music: { source: join(W, 'bed.m4a') } });
    if (!r.ok) throw new Error(r.detail);
    expect(r.plan.mode).toBe('reencode');
    run(r.plan.argv);
    const out = parseProbe(probe(r.plan.outPath));
    expect(out.durationSec).toBeGreaterThan(5.8);
    expect(out.durationSec).toBeLessThan(6.3);
    expect(out.video).toMatchObject({ width: 640, height: 360 });
  }, 60_000);

  test('silent clips + bed alone: exits, audio present', () => {
    const odd = clip(join(W, 'odd.mp4'));
    const r = buildStitchPlan({ clips: [odd, odd], workDir: W, outName: 'silent.mp4', music: { source: join(W, 'bed.m4a') } });
    if (!r.ok) throw new Error(r.detail);
    writeFileSync(r.plan.concatList!.path, r.plan.concatList!.content);
    run(r.plan.argv);
    expect(parseProbe(probe(r.plan.outPath)).audio).not.toBeNull();
  }, 60_000);
});

if (!enabled) {
  test('real-ffmpeg stitch checks are opt-in (LONGFORM_FFMPEG_IT=1)', () => {
    expect(enabled).toBe(false);
  });
}
