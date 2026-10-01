/**
 * @jest-environment jsdom
 *
 * The job runner: one job per worker, renders ahead of analysis, and a worker that cannot load hands its job — and
 * every job after it — to the main thread instead of dropping them.
 */
jest.mock('./spawnWorker', () => ({ spawnCullWorker: () => { throw new Error('unused'); } }));
jest.mock('./pipeline', () => ({
  analyzePhoto: jest.fn(async (f: File) => ({ metrics: { hash: `main:${f.name}` }, takenAt: null, width: 1, height: 1, thumb: new Blob() })),
  renderGraded: jest.fn(async () => ({ blob: new Blob(['g']), downscaled: false })),
  offscreenCanvas: jest.fn(),
  domCanvas: jest.fn(),
}));

import { NEUTRAL_GRADE } from '@/lib/photo/grade';
import { createCullClient } from './cullClient';
import type { CullRequest } from './protocol';

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: CullRequest[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() { FakeWorker.all.push(this); }
  postMessage(m: CullRequest) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  reply(i = this.posted.length - 1) {
    const m = this.posted[i]!;
    const data = m.type === 'analyze'
      ? { type: 'analyzed', seq: m.seq, ok: true, result: { metrics: { hash: `w:${m.file.name}` }, takenAt: null, width: 1, height: 1, thumb: new Blob() } }
      : { type: 'rendered', seq: m.seq, ok: true, result: { blob: new Blob(['x']), downscaled: false } };
    this.onmessage?.({ data } as MessageEvent);
  }
  crash() { this.onerror?.({ preventDefault() {} } as ErrorEvent); }
}

const f = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FakeWorker.all = [];
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
});

describe('createCullClient', () => {
  it('runs one job per worker, at most two workers, and resolves each job with its own reply', async () => {
    const c = createCullClient({ spawn: () => new FakeWorker() as unknown as Worker, useWorker: true });
    const ps = ['a', 'b', 'c'].map((n) => c.analyze(f(`${n}.jpg`)));
    expect(FakeWorker.all).toHaveLength(2);
    expect(FakeWorker.all.map((w) => w.posted.length)).toEqual([1, 1]);
    FakeWorker.all[1]!.reply();
    FakeWorker.all[0]!.reply();
    // The freed worker takes the third job.
    const third = FakeWorker.all.find((w) => w.posted.length === 2)!;
    third.reply();
    const res = await Promise.all(ps);
    expect(res.map((r) => r.metrics.hash)).toEqual(['w:a.jpg', 'w:b.jpg', 'w:c.jpg']);
  });

  it('an export render jumps the analysis queue', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true }); // a pool of one
    const c = createCullClient({ spawn: () => new FakeWorker() as unknown as Worker, useWorker: true });
    void c.analyze(f('1.jpg'));
    void c.analyze(f('2.jpg'));
    const r = c.render(f('pick.jpg'), NEUTRAL_GRADE, 'image/jpeg');
    expect(FakeWorker.all).toHaveLength(1);
    const w = FakeWorker.all[0]!;
    w.reply(); // finishes 1.jpg
    expect(w.posted[1]!.type).toBe('render');
    w.reply();
    await expect(r).resolves.toMatchObject({ downscaled: false });
  });

  it('a worker that fails to load hands its job and the rest of the queue to the main thread', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true });
    const c = createCullClient({ spawn: () => new FakeWorker() as unknown as Worker, useWorker: true });
    const p1 = c.analyze(f('one.jpg'));
    const p2 = c.analyze(f('two.jpg'));
    FakeWorker.all[0]!.crash();
    expect(FakeWorker.all[0]!.terminated).toBe(true);
    await flush();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.metrics.hash).toBe('main:one.jpg');
    expect(r2.metrics.hash).toBe('main:two.jpg');
  });

  it('without worker support everything runs on the main thread; cancelPending drops queued jobs', async () => {
    const c = createCullClient({ useWorker: false });
    const p1 = c.analyze(f('x.jpg'));
    const p2 = c.analyze(f('y.jpg'));
    c.cancelPending();
    await expect(p1).resolves.toMatchObject({ metrics: { hash: 'main:x.jpg' } });
    await expect(p2).rejects.toThrow('cancelled');
    expect(FakeWorker.all).toHaveLength(0);
  });
});
