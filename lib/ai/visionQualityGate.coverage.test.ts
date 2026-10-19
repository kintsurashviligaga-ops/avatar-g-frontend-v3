/** @jest-environment node */
import { evaluateRenderQuality, evaluateSceneClips } from './visionQualityGate';

const clips = [3, 1, 2].map((ordinal) => ({ ordinal, url: `https://cdn/clip-${ordinal}.mp4` }));
const deps = {
  enabled: () => true, keyPresent: () => true,
  extract: async (url: string) => [url],
  score: async () => '{"score":95,"issues":[]}',
};

test('a missing scene evaluation is reported in place, without an invented grade', async () => {
  const out = await evaluateSceneClips(clips, { deadlineMs: 5_000 }, {
    ...deps, score: async (_p, frames) => frames[0].includes('clip-2') ? null : deps.score(),
  });
  expect(out.map((q) => q.ordinal)).toEqual([1, 2, 3]);
  expect(out[1]).toMatchObject({ status: 'UNAVAILABLE', grade: null, score: null, action: 'review', reason: 'vision_unavailable' });
});

test('disabled scene QA keeps one skipped outcome per input and performs no work', async () => {
  const extract = jest.fn(); const score = jest.fn();
  const out = await evaluateSceneClips(clips, { deadlineMs: 5_000 }, { ...deps, enabled: () => false, extract, score });
  expect(out).toHaveLength(3);
  expect(out.every((q) => q.status === 'SKIPPED' && q.grade === null && q.score === null)).toBe(true);
  expect(extract).not.toHaveBeenCalled(); expect(score).not.toHaveBeenCalled();
});

test('a deadline retains unmeasured outcomes and prevents late extraction from starting inference', async () => {
  jest.useFakeTimers();
  try {
    let finish!: (frames: string[]) => void;
    const extract = jest.fn(() => new Promise<string[]>((r) => { finish = r; }));
    const score = jest.fn(deps.score);
    const pending = evaluateSceneClips(clips, { deadlineMs: 50, concurrency: 1 }, { ...deps, extract, score });
    await jest.advanceTimersByTimeAsync(50);
    const out = await pending;
    expect(out.map((q) => q.ordinal)).toEqual([1, 2, 3]);
    expect(out.every((q) => q.status === 'UNAVAILABLE' && q.reason === 'deadline' && q.grade === null)).toBe(true);
    finish(['late frame']);
    await jest.advanceTimersByTimeAsync(0);
    expect(score).not.toHaveBeenCalled();
    expect(extract).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});

test('a zero deadline makes no new extraction or inference request', async () => {
  const extract = jest.fn(deps.extract); const score = jest.fn(deps.score);
  const out = await evaluateSceneClips(clips, { deadlineMs: 0 }, { ...deps, extract, score });
  expect(out).toHaveLength(3);
  expect(out.every((q) => q.status === 'UNAVAILABLE' && q.reason === 'deadline')).toBe(true);
  expect(extract).not.toHaveBeenCalled(); expect(score).not.toHaveBeenCalled();
});

test('an aborted master evaluation does not begin provider work', async () => {
  const controller = new AbortController(); controller.abort();
  const extract = jest.fn(); const score = jest.fn();
  const out = await evaluateRenderQuality({ videoUrl: 'https://cdn/master.mp4', signal: controller.signal }, { ...deps, extract, score });
  expect(out).toMatchObject({ status: 'UNAVAILABLE', pass: false, grade: null, reason: 'cancelled' });
  expect(extract).not.toHaveBeenCalled(); expect(score).not.toHaveBeenCalled();
});

test('a late configuration result cannot start extraction after cancellation', async () => {
  const controller = new AbortController();
  let configure!: (present: boolean) => void;
  const keyPresent = () => new Promise<boolean>((r) => { configure = r; });
  const extract = jest.fn(); const score = jest.fn();
  const pending = evaluateRenderQuality({ videoUrl: 'https://cdn/master.mp4', signal: controller.signal }, { ...deps, keyPresent, extract, score });
  controller.abort(); configure(true);
  expect(await pending).toMatchObject({ status: 'UNAVAILABLE', pass: false, reason: 'cancelled' });
  expect(extract).not.toHaveBeenCalled(); expect(score).not.toHaveBeenCalled();
});
