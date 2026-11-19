/** @jest-environment node */
/**
 * Image, music, video and avatar renders in the chat as Agent G's timeline card (GG 2026-11-06 11:22Z „კი, ყველგან").
 */
import { genTask } from './genSteps';

const clock = { from: 0 };

test('an image in flight: the request is done, the render spins, the chat is ahead', () => {
  const m = genTask({ kind: 'image', phase: 'working', stage: '', clock }, 'ka');
  expect(m.steps.map((s) => [s.key, s.state])).toEqual([['request', 'done'], ['render', 'active'], ['deliver', 'pending']]);
  expect(m.countText).toBe('1/3 ნაბიჯი');
  expect(m.title).toBe('სურათი');
  expect(m.status).toBe('working');
  // The image route reports no percent, so the card shows none (§3.3).
  expect(m.pct).toBeNull();
  expect(m.steps[1]!.detail).toBeUndefined();
});

test('a film: the frames are counted while they land, then the render carries the poll’s own percent and stage', () => {
  const drawing = genTask({ kind: 'video', phase: 'working', frames: { ready: 2, total: 6 }, clock }, 'en');
  expect(drawing.steps.map((s) => s.key)).toEqual(['request', 'frames', 'render', 'deliver']);
  expect(drawing.steps[1]).toMatchObject({ state: 'active', note: '2/6' });
  const rendering = genTask({ kind: 'video', phase: 'working', pct: 41.6, stage: 'Scene 3 of 6', frames: { ready: 6, total: 6 }, clock }, 'en');
  expect(rendering.steps[1]!.state).toBe('done');
  expect(rendering.steps[2]).toMatchObject({ state: 'active', note: '42%', detail: 'Scene 3 of 6', label: 'Render the video' });
  expect(rendering.pct).toBe(42);
  // Never 100 before the asset.
  expect(genTask({ kind: 'video', phase: 'working', pct: 100, clock }, 'en').pct).toBe(99);
});

test('a finished render has every step done; a failure and a stop mark the render and skip the rest', () => {
  const done = genTask({ kind: 'music', phase: 'done', clock: { from: 0, to: 89_000 } }, 'ka');
  expect(done.steps.every((s) => s.state === 'done')).toBe(true);
  expect(done.countText).toBe('3/3 ნაბიჯი');
  expect(done.statusText).toBe('მზადაა');
  expect(done.pct).toBeNull();
  const failed = genTask({ kind: 'lipsync', phase: 'failed', clock }, 'ru');
  expect(failed.steps.map((s) => s.state)).toEqual(['done', 'failed', 'skipped']);
  expect(failed.title).toBe('Аватар');
  expect(genTask({ kind: 'image', phase: 'stopped', clock }, 'en').steps.map((s) => s.state)).toEqual(['done', 'stopped', 'skipped']);
});
