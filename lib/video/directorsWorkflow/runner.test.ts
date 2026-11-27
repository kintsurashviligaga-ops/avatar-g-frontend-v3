/**
 * The scene-by-scene run: a continuing scene waits for the clip before it, independent scenes render two at a time, a
 * scene whose source failed is never started (never charged), and a re-render reuses delivered clips.
 */
import { deliveredClips, emptyScene, runFilm, sceneDependency, type DwPollResult, type DwProject, type DwScene, type DwStartResult } from './index';

const film = (frames: DwScene['firstFrame'][]): DwProject => ({
  id: 'p', title: 't', logline: 'l', aspect: '9:16', resolution: '720p', characters: [],
  scenes: frames.map((f, i) => ({ ...emptyScene(`s${i + 1}`), order: i + 1, action: `a${i + 1}`, firstFrame: f })),
  status: 'approved', version: 1,
});

/** A fake network: each started scene is ready after `ticks` polls, unless listed in `fail`. */
function fake(opts: { fail?: string[]; ticks?: number } = {}) {
  const started: Array<{ id: string; prev: string | null }> = [];
  let live = 0;
  let maxLive = 0;
  const polls = new Map<string, number>();
  const start = async (scene: DwScene, prev: string | null): Promise<DwStartResult> => {
    started.push({ id: scene.id, prev });
    live += 1;
    maxLive = Math.max(maxLive, live);
    return { ok: true, jobId: `job-${scene.id}`, credits: 10 };
  };
  const poll = async (jobId: string): Promise<DwPollResult> => {
    const id = jobId.slice(4);
    const n = (polls.get(id) ?? 0) + 1;
    polls.set(id, n);
    if (n < (opts.ticks ?? 2)) return { state: 'running' };
    live -= 1;
    return opts.fail?.includes(id) ? { state: 'failed', error: 'safety', refunded: true } : { state: 'ready', videoUrl: `https://cdn/${id}.mp4` };
  };
  const wait = async () => { await Promise.resolve(); };
  return { deps: { start, poll, wait }, started, get maxLive() { return maxLive; } };
}

it('scene dependency is the previous scene only when the card continues from it', () => {
  const p = film(['none', 'previous', 'none']);
  expect(p.scenes.map((s) => sceneDependency(p, s))).toEqual([null, 's1', null]);
});

it('independent scenes render at most two at a time; a continuing scene gets the previous clip', async () => {
  const p = film(['none', 'none', 'previous', 'none']);
  const f = fake();
  const runs = await runFilm(p, f.deps);
  expect(Object.values(runs).every((r) => r.state === 'done')).toBe(true);
  expect(f.maxLive).toBeLessThanOrEqual(2);
  expect(f.started.find((x) => x.id === 's3')!.prev).toBe('https://cdn/s2.mp4');
  expect(f.started.find((x) => x.id === 's1')!.prev).toBeNull();
  expect(deliveredClips(p, runs)).toEqual(['s1', 's2', 's3', 's4'].map((s) => `https://cdn/${s}.mp4`));
});

it('a failed scene blocks the scene that continues from it — never started, never charged — the rest go on', async () => {
  const p = film(['none', 'previous', 'none']);
  const f = fake({ fail: ['s1'] });
  const runs = await runFilm(p, f.deps);
  expect(runs.s1).toMatchObject({ state: 'failed', refunded: true });
  expect(runs.s2!.state).toBe('blocked');
  expect(runs.s3!.state).toBe('done');
  expect(f.started.map((x) => x.id)).not.toContain('s2');
  expect(deliveredClips(p, runs)).toBeNull();
});

it('re-rendering scene 1 and its blocked follower reuses nothing else and starts only those', async () => {
  const p = film(['none', 'previous', 'none']);
  const f = fake();
  const runs = await runFilm(p, f.deps, ['s1', 's2'], { s3: 'https://cdn/s3-old.mp4' });
  expect(f.started.map((x) => x.id)).toEqual(['s1', 's2']);
  expect(deliveredClips(p, runs, { s3: 'https://cdn/s3-old.mp4' })).toEqual(['https://cdn/s1.mp4', 'https://cdn/s2.mp4', 'https://cdn/s3-old.mp4']);
});

it('re-rendering a continuing scene alone reads the previous clip from the earlier run; without it the scene is blocked', async () => {
  const p = film(['none', 'previous']);
  const f = fake();
  await runFilm(p, f.deps, ['s2'], { s1: 'https://cdn/s1-old.mp4' });
  expect(f.started).toEqual([{ id: 's2', prev: 'https://cdn/s1-old.mp4' }]);
  const g = fake();
  const runs = await runFilm(p, g.deps, ['s2']);
  expect(runs.s2!.state).toBe('blocked');
  expect(g.started).toEqual([]);
});

it('a refused start fails the scene without polling; an aborted run starts nothing new', async () => {
  const p = film(['none', 'none', 'none']);
  const poll = jest.fn();
  const runs = await runFilm(p, { start: async () => ({ ok: false, error: 'insufficient_credits' }), poll, wait: async () => {} });
  expect(Object.values(runs).map((r) => r.state)).toEqual(['failed', 'failed', 'failed']);
  expect(poll).not.toHaveBeenCalled();
  const ac = new AbortController();
  ac.abort();
  const start = jest.fn();
  const r2 = await runFilm(p, { start, poll, wait: async () => {}, signal: ac.signal });
  expect(start).not.toHaveBeenCalled();
  expect(Object.values(r2).every((r) => r.state === 'waiting')).toBe(true);
});
