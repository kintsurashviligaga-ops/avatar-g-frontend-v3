/** @jest-environment node */
/**
 * Video Core v1.0 §4 — the single-clip final cut's ffmpeg argv: re-timed to the 30 fps timeline and stopped at the final
 * length, so the file holds exactly framesFor(final) frames. (The cut itself, on real media, is the T3 evidence under
 * docs/handoffs/video-core/evidence.)
 */
jest.mock('server-only', () => ({}));
jest.mock('ffmpeg-static', () => '/usr/bin/ffmpeg');
jest.mock('../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn() }));
jest.mock('./ffmpegExec', () => ({ ffmpegExec: jest.fn() }));

import { finalCutArgs } from './finalCut';

test('fps=30, -t <final>, one uniform encode, faststart', () => {
  const args = finalCutArgs('https://x/in.mp4', '/tmp/out.mp4', 5);
  expect(args.slice(0, 3)).toEqual(['-y', '-i', 'https://x/in.mp4']);
  expect(args).toContain('fps=30');
  expect(args[args.indexOf('-t') + 1]).toBe('5');
  expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
  expect(args[args.length - 1]).toBe('/tmp/out.mp4');
});

test('a fraction is kept as said (29.7, not 29.7000001)', () => {
  const args = finalCutArgs('/tmp/in.mp4', '/tmp/out.mp4', 29.7);
  expect(args[args.indexOf('-t') + 1]).toBe('29.7');
});
