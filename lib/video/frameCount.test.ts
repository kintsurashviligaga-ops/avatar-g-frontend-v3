/** @jest-environment node */
/**
 * Video Core v1.0 §4 — the decoded-frame counter the film QC and the T3 evidence use. The argv, the progress parser and
 * the exact verdict are pinned here; the count itself on real media is lib/orchestrator/ffmpeg-assembly.ffmpeg.test.
 */
import { countDecodedFrames, decodedFrameArgs, frameExactVerdict, parseDecodedFrames } from './frameCount';

describe('decodedFrameArgs', () => {
  test('decodes the first picture stream only, cadence untouched, to the null muxer, progress on stdout', () => {
    const a = decodedFrameArgs('/tmp/master.mp4');
    expect(a[a.indexOf('-i') + 1]).toBe('/tmp/master.mp4');
    expect(a[a.indexOf('-map') + 1]).toBe('0:v:0');
    expect(a[a.indexOf('-fps_mode') + 1]).toBe('passthrough');
    expect(a[a.indexOf('-progress') + 1]).toBe('pipe:1');
    expect(a.slice(-3)).toEqual(['-f', 'null', '-']);
    expect(a).toContain('-nostats');
  });
});

describe('parseDecodedFrames', () => {
  const PROGRESS = 'frame=36\nfps=0.00\nout_time=00:00:01.500000\nprogress=continue\nframe=891\nfps=412.2\nout_time=00:00:29.700000\nspeed= 12x\nprogress=end\n';
  test('the LAST frame= of the progress report is the count', () => {
    expect(parseDecodedFrames(PROGRESS)).toBe(891);
  });
  test('without a progress report the final stats line on stderr is read', () => {
    expect(parseDecodedFrames('', 'frame=  720 fps=0.0 q=-0.0 Lsize=N/A time=00:00:24.00 bitrate=N/A speed= 144x')).toBe(720);
  });
  test('nothing readable is null, never 0', () => {
    expect(parseDecodedFrames('')).toBeNull();
    expect(parseDecodedFrames('progress=end\n', 'No such file or directory')).toBeNull();
    expect(parseDecodedFrames('frames=12\n')).toBeNull(); // not the key
  });
});

describe('frameExactVerdict — the owner\'s table at 30 fps', () => {
  test.each<[number, number]>([[24, 720], [29.7, 891], [60, 1800], [240, 7200], [5, 150]])('%s s = %s frames exactly', (sec, frames) => {
    expect(frameExactVerdict(frames, sec)).toEqual({ ok: true, expected: frames, actual: frames, fps: 30 });
  });
  test('one frame short is said as −1, one over as +1 (never rounded away)', () => {
    expect(frameExactVerdict(890, 29.7)).toEqual({ ok: false, reason: 'count_mismatch', expected: 891, actual: 890, offBy: -1, fps: 30 });
    expect(frameExactVerdict(1801, 60)).toMatchObject({ ok: false, reason: 'count_mismatch', offBy: 1 });
  });
  test('an unreadable file is unreadable, not a pass', () => {
    expect(frameExactVerdict(null, 29.7)).toEqual({ ok: false, reason: 'unreadable', expected: 891, actual: null, offBy: null, fps: 30 });
  });
  test('24 fps legacy master: 24 s = 576', () => {
    expect(frameExactVerdict(576, 24, 24)).toMatchObject({ ok: true, expected: 576, fps: 24 });
  });
});

test('countDecodedFrames refuses a URL: ffmpeg never fetches', async () => {
  await expect(countDecodedFrames('/usr/bin/ffmpeg', 'https://x/in.mp4')).rejects.toThrow('local files only');
});
