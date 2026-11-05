/**
 * lib/services/montage/segmentDetect — reading the detection pass and finding a clip's parts (pure, no ffmpeg).
 * The log lines are the real ffmpeg 6/7 formats (blackdetect, silencedetect, showinfo after select).
 */
import {
  buildDetectArgs,
  interiorBreaks,
  parseDetectLog,
  speechSpans,
  splitIntroOutro,
  transitionSpans,
  trimmedWindow,
  type ClipSignals,
} from './segmentDetect';

const sig = (over: Partial<ClipSignals>): ClipSignals => ({ durationSec: 10, hasAudio: true, blacks: [], silences: [], scenes: [], ...over });

describe('parseDetectLog', () => {
  const LOG = [
    '[Parsed_showinfo_3 @ 0x1] n:   0 pts:  30720 pts_time:2       duration:    512 fmt:yuv420p',
    '[silencedetect @ 0x2] silence_start: 1.99996',
    '[silencedetect @ 0x2] silence_end: 2.50004 | silence_duration: 0.500083',
    '[blackdetect @ 0x3] black_start:2 black_end:2.5 black_duration:0.5',
    '[Parsed_showinfo_3 @ 0x1] n:   1 pts:  38400 pts_time:2.5     duration:    512',
    '[Parsed_showinfo_3 @ 0x1] n:   2 pts:  0 pts_time:0     duration:    512',
    '[silencedetect @ 0x2] silence_start: 6.2',
  ].join('\n');

  test('black runs, silences (an open one runs to the end) and hard cuts (none on the first frame)', () => {
    expect(parseDetectLog(LOG, 7, true)).toEqual({
      durationSec: 7,
      hasAudio: true,
      blacks: [{ startSec: 2, endSec: 2.5 }],
      silences: [{ startSec: 2, endSec: 2.5 }, { startSec: 6.2, endSec: 7 }],
      scenes: [2, 2.5],
    });
  });

  test('garbage in → empty signals, never a throw', () => {
    expect(parseDetectLog(undefined as unknown as string, Number.NaN, false)).toEqual({ durationSec: 0, hasAudio: false, blacks: [], silences: [], scenes: [] });
  });

  test('the pass is one argv (no shell), both detectors, the null muxer, capped in time', () => {
    const a = buildDetectArgs('/tmp/x.mp4', 120);
    expect(a.slice(0, 6)).toEqual(['-hide_banner', '-nostats', '-i', '/tmp/x.mp4', '-t', '120']);
    expect(a.join(' ')).toMatch(/blackdetect=d=0\.1.*select='gt\(scene\\,0\.3\)',showinfo/);
    expect(a.join(' ')).toMatch(/silencedetect=noise=-35dB:d=0\.35/);
    expect(a.slice(-3)).toEqual(['-f', 'null', '-']);
  });
});

describe('speechSpans (the voice activity)', () => {
  test('the complement of the silences; slivers dropped', () => {
    expect(speechSpans(sig({ silences: [{ startSec: 0, endSec: 1.2 }, { startSec: 4, endSec: 4.1 }, { startSec: 4.2, endSec: 5 }, { startSec: 8.5, endSec: 10 }] })))
      .toEqual([{ startSec: 1.2, endSec: 4 }, { startSec: 5, endSec: 8.5 }]);
  });
  test('no sound track → nothing heard', () => {
    expect(speechSpans(sig({ hasAudio: false }))).toEqual([]);
  });
});

describe('trimmedWindow', () => {
  test('a body: leading black and the silence before the voice go, less the pad; the same at the end; on the 30 fps grid', () => {
    const w = trimmedWindow(sig({ blacks: [{ startSec: 0, endSec: 0.4 }], silences: [{ startSec: 0, endSec: 1.3 }, { startSec: 8.71, endSec: 10 }] }), true);
    expect(w).toEqual({ startSec: 1.167, endSec: 8.833, startBy: 'speech', endBy: 'speech' });
    expect(Math.abs(w.startSec * 30 - Math.round(w.startSec * 30))).toBeLessThan(0.02);
  });
  test('an intro file: only its black ends go (its silence may be the jingle\'s pause)', () => {
    expect(trimmedWindow(sig({ blacks: [{ startSec: 0, endSec: 0.5 }, { startSec: 9.4, endSec: 10 }], silences: [{ startSec: 0, endSec: 2 }] }), false))
      .toEqual({ startSec: 0.5, endSec: 9.4, startBy: 'black', endBy: 'black' });
  });
  test('nothing but black → the whole clip (no cut on no evidence)', () => {
    expect(trimmedWindow(sig({ blacks: [{ startSec: 0, endSec: 10 }] }), true)).toMatchObject({ startSec: 0, startBy: 'whole', endBy: 'whole' });
  });
});

describe('splitIntroOutro (one clip that carries both)', () => {
  test('black runs inside are the breaks: intro to the first, outro from the last', () => {
    const s = sig({ durationSec: 9, blacks: [{ startSec: 2, endSec: 2.5 }, { startSec: 6, endSec: 6.5 }], scenes: [1, 2.5, 6.5] });
    expect(splitIntroOutro(s)).toEqual({
      ok: true, breaks: 2,
      intro: { startSec: 0, endSec: 2, startBy: 'whole', endBy: 'black' },
      outro: { startSec: 6.5, endSec: 8.933, startBy: 'black', endBy: 'whole' },
    });
  });
  test('no black inside → hard cuts; one break splits the clip in two', () => {
    const s = sig({ durationSec: 6, scenes: [3] });
    expect(splitIntroOutro(s)).toMatchObject({ ok: true, breaks: 1, intro: { endSec: 3, endBy: 'scene' }, outro: { startSec: 3, startBy: 'scene' } });
  });
  test('no black, no cut → a long pause; a breath is not a break', () => {
    expect(interiorBreaks(sig({ silences: [{ startSec: 3, endSec: 3.2 }] }))).toEqual([]);
    expect(interiorBreaks(sig({ silences: [{ startSec: 3, endSec: 3.8 }] }))).toEqual([{ startSec: 3, endSec: 3.8, by: 'silence' }]);
  });
  test('nothing to split by → refused, never guessed', () => {
    expect(splitIntroOutro(sig({}))).toEqual({ ok: false, error: 'no_boundary' });
  });
});

describe('transitionSpans (dissolves the scene filter cannot see)', () => {
  const S = 32 * 32;
  /** 30 fps grey frames: `still` value with a little motion noise, a 0.3 s dissolve to `to` at `atSec`. */
  function clip(sec: number, cuts: Array<{ atSec: number; to: number }>, start = 40): Uint8Array {
    const n = Math.round(sec * 30);
    const out = new Uint8Array(n * S);
    let level = start;
    for (let f = 0; f < n; f += 1) {
      const t = f / 30;
      let v = level;
      for (const c of cuts) {
        if (t >= c.atSec && t < c.atSec + 0.3) v = level + (c.to - level) * ((t - c.atSec) / 0.3);
        if (t >= c.atSec + 0.3) v = c.to;
      }
      if (cuts.some((c) => Math.abs(t - (c.atSec + 0.3)) < 1e-9)) level = v;
      for (let p = 0; p < S; p += 1) out[f * S + p] = Math.max(0, Math.min(255, Math.round(v + ((p + f) % 5) - 2)));
    }
    return out;
  }

  test('finds an intro and an outro dissolve, and nothing in a still body', () => {
    const spans = transitionSpans(clip(12, [{ atSec: 1.1, to: 140 }, { atSec: 10.9, to: 20 }]));
    expect(spans).toHaveLength(2);
    expect(spans[0]!.startSec).toBeGreaterThanOrEqual(1.0);
    expect(spans[0]!.endSec).toBeLessThanOrEqual(1.5);
    expect(spans[1]!.startSec).toBeGreaterThanOrEqual(10.8);
    expect(spans[1]!.endSec).toBeLessThanOrEqual(11.3);
  });

  test('no change → no spans', () => {
    expect(transitionSpans(clip(6, []))).toEqual([]);
  });
});
