/**
 * lib/agent/media/overlayFx — the overlay pass's filtergraph and its QC verdict (the real-ffmpeg run is in
 * ./mediaStudio.ffmpeg.test and ./montageEdit.ffmpeg.test).
 */
import { GRAIN_STRENGTH, LIGHT_LEAK, OVERLAY_FLAT_SPREAD, OVERLAY_MIN_CORR, frameDiff, lumaCorrelation, lumaSpread, overlayArgs, overlayCheckPoints, overlayGraph, overlayVerdict } from './overlayFx';

describe('overlayGraph', () => {
  test('light leaks: generated light at a quarter size, scaled up, screen-blended at 40 %, as long as the video', () => {
    const g = overlayGraph({ look: 'light-leak', width: 1080, height: 1920, durationSec: 29.7 });
    expect(g.lavfi).toBe(`gradients=s=270x480:r=30:d=30.7:n=3:c0=0xff8a2a:c1=0xffd36a:c2=0x000000:x0=0:y0=0:x1=270:y1=480:speed=${LIGHT_LEAK.speed}:type=radial:seed=7`);
    expect(g.graph).toContain('[1:v]scale=1080:1920:flags=bicubic,format=gbrp[leak]');
    expect(g.graph).toContain('blend=all_mode=screen:all_opacity=0.4:shortest=1');
  });

  test('the light fades with the picture, so a fade to black stays black', () => {
    const g = overlayGraph({ look: 'light-leak', width: 640, height: 360, durationSec: 10, fade: { inSec: 1, outSec: 2 } });
    expect(g.graph).toContain('fade=t=in:st=0:d=1,fade=t=out:st=8:d=2');
  });

  test('grain: noise on the picture itself, no second input', () => {
    const g = overlayGraph({ look: 'grain', width: 640, height: 360, durationSec: 10 });
    expect(g).toEqual({ lavfi: null, graph: `[0:v]noise=alls=${GRAIN_STRENGTH}:allf=t+u,format=yuv420p[vout]` });
  });

  test('the pass keeps the sound as it is and the length to the edit', () => {
    const a = overlayArgs('in.mp4', 'out.mp4', { look: 'light-leak', width: 640, height: 360, durationSec: 12.5 });
    expect(a).toEqual(expect.arrayContaining(['-f', 'lavfi', '-map', '0:a?', '-c:a', 'copy', '-t', '12.5']));
    expect(overlayArgs('in.mp4', 'out.mp4', { look: 'grain', width: 640, height: 360, durationSec: 5 })).not.toContain('lavfi');
    expect(overlayCheckPoints(29.7)).toEqual([7.43, 14.85, 22.28]);
  });
});

describe('overlay QC', () => {
  const frame = (f: (i: number) => number, n = 300) => Buffer.from(Array.from({ length: n * 3 }, (_, i) => f(Math.floor(i / 3))));
  const pic = frame((i) => (i * 37) % 256);

  test('the same picture correlates 1 and differs 0; a flat frame does not correlate with a picture', () => {
    expect(lumaCorrelation(pic, pic)).toBeCloseTo(1, 6);
    expect(frameDiff(pic, pic)).toBe(0);
    expect(lumaCorrelation(pic, frame(() => 128))).toBe(0);
  });

  test('PASS: visible on most instants and the picture kept; FAIL: nothing shown, or the picture drowned', () => {
    expect(overlayVerdict('light-leak', [{ atSec: 1, diff: 9, corr: 0.95 }, { atSec: 2, diff: 2, corr: 0.97 }, { atSec: 3, diff: 11, corr: 0.93 }]).outcome).toBe('PASS');
    const none = overlayVerdict('light-leak', [{ atSec: 1, diff: 0.4, corr: 1 }, { atSec: 2, diff: 0.2, corr: 1 }]);
    expect(none).toMatchObject({ outcome: 'FAIL' });
    expect(none.problems[0]).toMatch(/not visible/);
    const drowned = overlayVerdict('grain', [{ atSec: 1, diff: 40, corr: OVERLAY_MIN_CORR - 0.3 }]);
    expect(drowned.problems[0]).toMatch(/picture is lost/);
    expect(overlayVerdict('grain', []).outcome).toBe('FAIL');
  });

  test('a black or plain frame has no picture to lose: its correlation is not counted, its showing is', () => {
    expect(lumaSpread(frame(() => 0))).toBeCloseTo(0, 3);
    expect(lumaSpread(frame(() => 128))).toBeCloseTo(0, 3);
    expect(lumaSpread(pic)).toBeGreaterThan(OVERLAY_FLAT_SPREAD);
    const plain = overlayVerdict('light-leak', [{ atSec: 1, diff: 9, corr: 0, flat: true }, { atSec: 2, diff: 8, corr: 0.95 }]);
    expect(plain).toMatchObject({ outcome: 'PASS', samples: [{ atSec: 1, flat: true }, { atSec: 2 }] });
    expect(plain.samples[1]).not.toHaveProperty('flat');
    // A plain frame does not excuse a drowned picture elsewhere, nor an overlay that shows nowhere.
    expect(overlayVerdict('light-leak', [{ atSec: 1, diff: 9, corr: 0, flat: true }, { atSec: 2, diff: 30, corr: 0.2 }]).outcome).toBe('FAIL');
    expect(overlayVerdict('light-leak', [{ atSec: 1, diff: 0.5, corr: 0, flat: true }, { atSec: 2, diff: 0.4, corr: 1 }]).outcome).toBe('FAIL');
  });
});
