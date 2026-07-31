/** @jest-environment node */
import {
  isOpenEnded,
  sourcesNeedingDuration,
  resolveSegmentWindows,
  parseFfmpegDuration,
  MIN_WINDOW_SEC,
} from './sequenceWindows';

describe('open-ended detection — the browser could not measure this clip', () => {
  it('treats a zero-length window as open, not as empty', () => {
    expect(isOpenEnded({ src: 0, start: 0, end: 0 })).toBe(true);
  });

  it('treats a measured window as closed', () => {
    expect(isOpenEnded({ src: 0, start: 0, end: 4.2 })).toBe(false);
  });

  it('treats NaN/Infinity as open rather than letting them through into the filtergraph', () => {
    expect(isOpenEnded({ src: 0, start: 0, end: NaN })).toBe(true);
    expect(isOpenEnded({ src: 0, start: NaN, end: 5 })).toBe(true);
    expect(isOpenEnded({ src: 0, start: 0, end: Infinity })).toBe(true);
  });
});

describe('which sources need a server probe', () => {
  it('asks only for the sources that actually carry an open window', () => {
    const w = [
      { src: 0, start: 0, end: 5 },
      { src: 1, start: 0, end: 0 },
      { src: 2, start: 0, end: 3 },
    ];
    expect(sourcesNeedingDuration(w, 3)).toEqual([1]);
  });

  it('asks once for a source used by several open windows', () => {
    const w = [
      { src: 1, start: 0, end: 0 },
      { src: 1, start: 10, end: 0 },
    ];
    expect(sourcesNeedingDuration(w, 2)).toEqual([1]);
  });

  it('is empty when every window was measured — the probe must not tax the common case', () => {
    expect(sourcesNeedingDuration([{ src: 0, start: 0, end: 5 }], 1)).toEqual([]);
  });

  it('ignores out-of-range indices instead of probing a source that does not exist', () => {
    expect(sourcesNeedingDuration([{ src: 9, start: 0, end: 0 }], 2)).toEqual([]);
  });
});

describe('window resolution — the clip that used to vanish', () => {
  it('RECOVERS a clip the browser could not measure, using the real source duration', () => {
    const { kept, dropped } = resolveSegmentWindows([{ src: 0, start: 0, end: 0 }], [12.5], 1);
    expect(dropped).toEqual([]);
    expect(kept).toEqual([{ src: 0, start: 0, end: 12.5 }]);
  });

  it('keeps a trim-in point when only the end was unknown', () => {
    const { kept } = resolveSegmentWindows([{ src: 0, start: 4, end: 0 }], [10], 1);
    expect(kept[0]).toMatchObject({ start: 4, end: 10 });
  });

  it('leaves a measured window exactly as the user trimmed it', () => {
    const { kept } = resolveSegmentWindows([{ src: 0, start: 1.5, end: 6.25 }], [30], 1);
    expect(kept[0]).toMatchObject({ start: 1.5, end: 6.25 });
  });

  it('carries the caller\'s extra fields through untouched', () => {
    const { kept } = resolveSegmentWindows(
      [{ src: 0, start: 0, end: 0, muted: true, transition: 'crossfade' as const }],
      [8],
      1,
    );
    expect(kept[0]).toMatchObject({ muted: true, transition: 'crossfade', end: 8 });
  });

  it('preserves order, so `src` indices still line up with the upload array', () => {
    const { kept } = resolveSegmentWindows(
      [{ src: 2, start: 0, end: 0 }, { src: 0, start: 0, end: 2 }, { src: 1, start: 0, end: 0 }],
      [9, 9, 9],
      3,
    );
    expect(kept.map((k) => k.src)).toEqual([2, 0, 1]);
  });

  it('drops — WITH A REASON — a clip even ffmpeg could not measure', () => {
    const { kept, dropped } = resolveSegmentWindows([{ src: 0, start: 0, end: 0 }], [0], 1);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([{ index: 0, src: 0, reason: 'unmeasurable' }]);
  });

  it('drops a window whose start is past the end of its source', () => {
    expect(resolveSegmentWindows([{ src: 0, start: 30, end: 0 }], [10], 1).dropped[0]?.reason).toBe('unmeasurable');
  });

  it('drops a sub-frame window rather than letting an empty stream break the whole graph', () => {
    const { dropped } = resolveSegmentWindows([{ src: 0, start: 0, end: MIN_WINDOW_SEC / 2 }], [10], 1);
    expect(dropped[0]?.reason).toBe('zero-length');
  });

  it('drops an out-of-range source index instead of rendering the wrong footage', () => {
    const { dropped } = resolveSegmentWindows([{ src: 5, start: 0, end: 3 }], [10], 1);
    expect(dropped).toEqual([{ index: 0, src: 5, reason: 'bad-source-index' }]);
  });

  it('one unusable clip does not take the other clips down with it', () => {
    const { kept, dropped } = resolveSegmentWindows(
      [{ src: 0, start: 0, end: 4 }, { src: 1, start: 0, end: 0 }, { src: 2, start: 0, end: 3 }],
      [4, 0, 3],
      3,
    );
    expect(kept.map((k) => k.src)).toEqual([0, 2]);
    expect(dropped).toHaveLength(1);
  });

  it('normalizes a negative start rather than emitting trim=start=-2', () => {
    expect(resolveSegmentWindows([{ src: 0, start: -2, end: 5 }], [10], 1).kept[0]?.start).toBe(0);
  });

  it('is total on junk input', () => {
    const junk = [null, undefined, { src: '0', start: 0, end: 5 }] as unknown as Array<{ src: number; start: number; end: number }>;
    const { kept, dropped } = resolveSegmentWindows(junk, [10], 1);
    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(3);
  });
});

describe('ffmpeg duration parsing', () => {
  it('reads the banner duration', () => {
    expect(parseFfmpegDuration('  Duration: 00:01:23.45, start: 0.000000, bitrate: 1200 kb/s')).toBeCloseTo(83.45, 2);
  });

  it('handles hours', () => {
    expect(parseFfmpegDuration('Duration: 02:00:00.00,')).toBe(7200);
  });

  it('handles a missing fractional part', () => {
    expect(parseFfmpegDuration('Duration: 00:00:07,')).toBe(7);
  });

  it('returns 0 for N/A and for stderr with no duration at all', () => {
    expect(parseFfmpegDuration('Duration: N/A, bitrate: N/A')).toBe(0);
    expect(parseFfmpegDuration('Stream #0:0: Video: h264')).toBe(0);
    expect(parseFfmpegDuration('')).toBe(0);
  });
});
