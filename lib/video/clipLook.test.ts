import { matchClipLooks, parseSignalStats, MAX_BRIGHTNESS_SHIFT, MAX_SAT_RATIO, MIN_SAT_RATIO } from './clipLook';

describe('clipLook', () => {
  it('averages signalstats frames', () => {
    const log = [
      'frame:0 pts:0', 'lavfi.signalstats.YAVG=100', 'lavfi.signalstats.SATAVG=40',
      'frame:1 pts:12', 'lavfi.signalstats.YAVG=110', 'lavfi.signalstats.SATAVG=50',
    ].join('\n');
    expect(parseSignalStats(log)).toEqual({ yavg: 105, satavg: 45 });
    expect(parseSignalStats('nothing here')).toBeNull();
  });

  it('pulls a vivid clip and a dull clip toward the film median', () => {
    const looks = matchClipLooks([
      { yavg: 110, satavg: 40 },
      { yavg: 112, satavg: 56 }, // vivid
      { yavg: 108, satavg: 30 }, // dull
    ]);
    expect(looks[0]).toBeNull(); // already the median
    expect(looks[1]!.saturation).toBeLessThan(1);
    expect(looks[2]!.saturation).toBeGreaterThan(1);
  });

  it('corrects exposure within a small clamp', () => {
    const looks = matchClipLooks([{ yavg: 60, satavg: 40 }, { yavg: 120, satavg: 40 }, { yavg: 125, satavg: 40 }]);
    expect(looks[0]!.brightness).toBe(MAX_BRIGHTNESS_SHIFT); // dark shot lifted, but only so far
    expect(looks[1]).toBeNull();
  });

  it('never flattens a very different shot', () => {
    const looks = matchClipLooks([{ yavg: 110, satavg: 10 }, { yavg: 110, satavg: 50 }, { yavg: 110, satavg: 200 }]);
    expect(looks[0]!.saturation).toBe(MAX_SAT_RATIO);
    expect(looks[2]!.saturation).toBe(MIN_SAT_RATIO);
  });

  it('does nothing without at least two measured clips', () => {
    expect(matchClipLooks([{ yavg: 100, satavg: 40 }, null])).toEqual([null, null]);
    expect(matchClipLooks([])).toEqual([]);
  });

  it('leaves an unmeasured clip uncorrected', () => {
    const looks = matchClipLooks([{ yavg: 100, satavg: 30 }, null, { yavg: 100, satavg: 50 }]);
    expect(looks[1]).toBeNull();
  });
});
