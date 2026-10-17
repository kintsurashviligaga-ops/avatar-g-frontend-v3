/** @jest-environment node */
/**
 * A narrated film keeps its music after the last word (live E2E 2026-10-17, film B): `sidechaincompress` ends when its key
 * ends, so a ~4 s narration keying the bed of a 16 s film cut the score at 4 s and the master's `apad` filled the rest with
 * digital silence. The voice key is now padded to the film's length.
 *
 * The graph is checked as a string, then run on the real bundled ffmpeg: two 4 s clips, a 2 s "voice" and a 10 s "score",
 * the picture to a null sink and the sound to raw PCM, whose level after the voice must not be silence.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { buildFilterComplex, type FilterGraphOpts } from './ffmpeg-filtergraph';

const film = (o: Partial<FilterGraphOpts> = {}): FilterGraphOpts => ({
  nClips: 2, clipSec: 4, transition: 'cut', orientation: 'vertical', padToTarget: false,
  hasVoice: true, hasMusic: true, hasSfx: false, fps: 24, duckPct: 30, ...o,
});

describe('the voice key runs the whole film', () => {
  it('pads the voice before it is split into the duck key (voice + score)', () => {
    expect(buildFilterComplex(film()).filter).toContain('[2:a]apad=whole_dur=8.00,asplit=2[vkey][vraw]');
  });

  it('pads it on the three-track master too (voice + score + sfx)', () => {
    expect(buildFilterComplex(film({ hasSfx: true, threeTrackMix: true })).filter).toContain('[2:a]apad=whole_dur=8.00,asplit=3[vkeym][vkeys][vraw]');
  });

  it('pads to the 30 s brand length when the legacy pad holds the master there', () => {
    const g = buildFilterComplex(film({ nClips: 4, clipSec: 6, padToTarget: true }));
    expect(g.filter).toContain('[4:a]apad=whole_dur=30.00,asplit=2[vkey][vraw]');
  });

  it('leaves the static mix (smart duck off) without a key', () => {
    expect(buildFilterComplex(film({ smartDuck: false })).filter).not.toContain('apad=whole_dur');
  });
});

const bin = ffmpegStatic as unknown as string | null;
const withFfmpeg = bin && existsSync(bin) ? describe : describe.skip;

withFfmpeg('the score after the last word, on the real ffmpeg', () => {
  const RATE = 8000;
  let dir = '';
  const run = (args: string[]) => execFileSync(bin!, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 120_000 });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'voicekey-'));
    for (const i of [0, 1]) {
      run(['-f', 'lavfi', '-i', 'color=c=gray:s=180x320:r=24:d=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', join(dir, `c${i}.mp4`)]);
    }
    run(['-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=2', join(dir, 'voice.wav')]);
    run(['-f', 'lavfi', '-i', 'sine=frequency=110:sample_rate=48000:duration=10', join(dir, 'score.wav')]);
    run(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.3:sample_rate=48000:duration=10', join(dir, 'sfx.wav')]);
  }, 60_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /** The master's sound as mono PCM, and its RMS level (0..1) over [from, to) seconds. */
  function master(o: Partial<FilterGraphOpts>): { seconds: number; rms: (from: number, to: number) => number } {
    const g = buildFilterComplex(film(o));
    const audio = ['voice.wav', 'score.wav', ...(o.hasSfx ? ['sfx.wav'] : [])];
    const out = join(dir, `mix-${o.hasSfx ? 3 : 2}.raw`);
    run([
      ...['c0.mp4', 'c1.mp4', ...audio].flatMap((f) => ['-i', join(dir, f)]),
      '-filter_complex', g.filter,
      '-map', g.vmap, '-f', 'null', '-',
      '-map', g.amap!, '-ac', '1', '-ar', String(RATE), '-f', 's16le', out,
    ]);
    const pcm = readFileSync(out);
    const n = pcm.length / 2;
    return {
      seconds: n / RATE,
      rms: (from, to) => {
        let sum = 0;
        const a = Math.floor(from * RATE);
        const b = Math.min(n, Math.floor(to * RATE));
        for (let i = a; i < b; i++) sum += (pcm.readInt16LE(i * 2) / 32768) ** 2;
        return Math.sqrt(sum / Math.max(1, b - a));
      },
    };
  }

  it('the score plays on after a 2 s voice to the end of an 8 s film', () => {
    const m = master({});
    expect(m.seconds).toBeCloseTo(8, 1);
    expect(m.rms(0.5, 1.5)).toBeGreaterThan(0.01);
    // Before the fix this window was exact digital silence (0): the score stopped with the voice.
    expect(m.rms(4, 7)).toBeGreaterThan(0.01);
  }, 120_000);

  it('the score and the sfx play on after the voice on the three-track master', () => {
    const m = master({ hasSfx: true, threeTrackMix: true });
    expect(m.seconds).toBeCloseTo(8, 1);
    expect(m.rms(4, 7)).toBeGreaterThan(0.01);
  }, 120_000);
});
