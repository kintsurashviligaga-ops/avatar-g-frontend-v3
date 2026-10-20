/** @jest-environment node */
/**
 * The server's side of a chat film whose tab closed (lib/chat/filmFollowWorker), every effect faked over an in-memory
 * queue with the live store's semantics: one driver per film, the tab's own rules, at most one stitch per sweep, and the
 * film's charge paid back only once nothing can deliver it any more.
 */
import { memoryLeaseStore, type MemoryLeaseStore } from '../orchestrator/testing/memoryLeaseStore';
import { enqueue, LEASE_MS } from '../orchestrator/jobLease';
import {
  FILM_FOLLOW_KIND, FOLLOW_MAX_ATTEMPTS, FOLLOW_MAX_MS, FOLLOW_STITCH_WINDOW_MS, FOLLOW_TAKEOVER_MS, FOLLOW_TTL_MS, followJobId,
  signFollow, type FilmFollowRecord,
} from './filmFollow';
import { STITCH_MIN_BUDGET_MS, payDebt, sweepFilmFollows, type FilmFollowDeps, type StitchOutcome } from './filmFollowWorker';
import type { FilmStatusRecord } from './filmStatusStore';
import type { FilmStudioMatrix } from './filmStudioClient';

const KEY = 'k';
const T0 = 1_760_000_000_000;
const USER = 'user-1';

const recFor = (t: string, extra: Partial<FilmFollowRecord> = {}): FilmFollowRecord => ({
  u: USER, t, p: `film:${t}`, s: 'session_1', c: T0, m: 'a short film about the sea', plan: { orientation: 'vertical', locale: 'ka' }, ...extra,
});

const ready = (t: string): FilmStudioMatrix => ({
  sceneCount: 2, seed: 1, storyboard: 'succeeded', stitch: 'ready', audio: 'succeeded', audioUrl: 'https://s/score.mp3', readyToStitch: true,
  statusTokenId: t,
  clips: [{ ordinal: 1, status: 'succeeded', url: 'https://s/1.mp4' }, { ordinal: 2, status: 'succeeded', url: 'https://s/2.mp4' }],
});
const rendering = (t: string): FilmStudioMatrix => ({ ...ready(t), readyToStitch: false, clips: [{ ordinal: 1, status: 'succeeded', url: 'https://s/1.mp4' }, { ordinal: 2, status: 'queued', url: null }] });
const failedScenes = (t: string): FilmStudioMatrix => ({ ...ready(t), readyToStitch: false, clips: [{ ordinal: 1, status: 'succeeded', url: 'https://s/1.mp4' }, { ordinal: 2, status: 'failed', url: null }] });

interface Fake {
  deps: FilmFollowDeps;
  store: MemoryLeaseStore;
  clock: { now: number };
  watched: Map<string, number | 'unknown'>;
  status: Map<string, FilmStatusRecord | 'unknown'>;
  library: Set<string>;
  libraryDown: boolean;
  polls: string[];
  stitches: Array<{ t: string; body: Record<string, unknown>; budgetMs: number }>;
  stitchAnswer: (t: string) => Promise<StitchOutcome>;
  pollAnswer: (t: string) => FilmStudioMatrix | null | 'error';
  refunds: string[];
  refundAnswer: 'paid' | 'nothing' | 'error';
  failedMarks: string[];
  notified: Array<{ t: string; refunded: boolean }>;
}

function fake(): Fake {
  const clock = { now: T0 };
  const store = memoryLeaseStore(() => clock.now);
  const f: Fake = {
    store, clock,
    watched: new Map(), status: new Map(), library: new Set(), libraryDown: false,
    polls: [], stitches: [], refunds: [], failedMarks: [], notified: [],
    stitchAnswer: async () => ({ status: 200, url: 'https://s/master.mp4', error: null }),
    pollAnswer: (t) => ready(t),
    refundAnswer: 'paid',
    deps: undefined as unknown as FilmFollowDeps,
  };
  f.deps = {
    store,
    key: () => KEY,
    now: () => clock.now,
    watchedAt: async (t) => f.watched.get(t) ?? null,
    status: async (t) => f.status.get(t) ?? null,
    delivered: async (_u, t) => (f.libraryDown ? null : f.library.has(t)),
    poll: async (rec) => { f.polls.push(rec.t); return f.pollAnswer(rec.t); },
    stitch: async (rec, body, opts) => { f.stitches.push({ t: rec.t, body, budgetMs: opts.budgetMs }); return f.stitchAnswer(rec.t); },
    refund: async (_u, t) => { if (f.refundAnswer !== 'error') f.refunds.push(t); return f.refundAnswer; },
    markFailed: async (t) => { f.failedMarks.push(t); },
    notifyFailed: async (rec, refunded) => { f.notified.push({ t: rec.t, refunded }); },
    every: () => () => {},
    log: () => {},
  };
  return f;
}

async function file(f: Fake, t: string, extra: Partial<FilmFollowRecord> = {}): Promise<string> {
  const id = followJobId(t);
  await enqueue(f.store, { id, userId: USER, serviceType: 'film', kind: FILM_FOLLOW_KIND, maxAttempts: FOLLOW_MAX_ATTEMPTS, params: { _follow: signFollow(recFor(t, extra), KEY) } });
  return id;
}

const sweep = (f: Fake, budgetMs = 580_000) => sweepFilmFollows(f.deps, { worker: 'w1', startedAt: f.clock.now, budgetMs });
const row = (f: Fake, id: string) => f.store.rows.get(id)!;

describe('one driver per film', () => {
  test('a film its tab still polls is left alone: no poll, no stitch', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.clock.now = T0 + 10 * 60_000;
    f.watched.set('f1', f.clock.now - 20_000);
    const r = await sweep(f);
    expect(r.waiting).toEqual([id]);
    expect(f.polls).toEqual([]);
    expect(row(f, id).status).toBe('pending');
  });

  test('a film just started is the tab\'s, even before its first poll', async () => {
    const f = fake();
    await file(f, 'f1');
    f.clock.now = T0 + FOLLOW_TAKEOVER_MS - 1;
    await sweep(f);
    expect(f.polls).toEqual([]);
  });

  test('when the shared store cannot say whether the tab is there, the film is left alone', async () => {
    const f = fake();
    await file(f, 'f1');
    f.clock.now = T0 + 10 * 60_000;
    f.watched.set('f1', 'unknown');
    await sweep(f);
    expect(f.polls).toEqual([]);
  });

  test('a stitch someone started is waited out', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.clock.now = T0 + 10 * 60_000;
    f.status.set('f1', { tokenId: 'f1', phase: 'assembling', clips: [], audioReady: true, masterUrl: null, updatedAt: f.clock.now - 60_000 });
    await sweep(f);
    expect(f.polls).toEqual([]);
    expect(row(f, id).status).toBe('pending');
    // …and once the window has passed with no master, the server takes the film again.
    f.clock.now += FOLLOW_STITCH_WINDOW_MS;
    await sweep(f);
    expect(f.stitches.map((s) => s.t)).toEqual(['f1']);
  });

  test('a film the tab finished is closed as delivered, without polling or stitching', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.clock.now = T0 + 60_000;
    f.status.set('f1', { tokenId: 'f1', phase: 'assembled', clips: [], audioReady: true, masterUrl: 'https://s/m.mp4', updatedAt: f.clock.now });
    const r = await sweep(f);
    expect(r.delivered).toEqual([id]);
    expect(row(f, id)).toMatchObject({ status: 'completed', signedUrl: null, result: { outcome: 'delivered', by: 'tab' } });
    expect(f.polls).toEqual([]);
  });
});

describe('a film whose tab closed', () => {
  test('is polled as its owner while scenes still render (the next scene goes out from that poll)', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.pollAnswer = (t) => rendering(t);
    f.clock.now = T0 + FOLLOW_TAKEOVER_MS + 1;
    const r = await sweep(f);
    expect(f.polls).toEqual(['f1']);
    expect(r.waiting).toEqual([id]);
    expect(row(f, id).status).toBe('pending');
  });

  test('is stitched with the tab\'s body once its scenes are in, and never reaches the Library itself', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.clock.now = T0 + 5 * 60_000;
    const r = await sweep(f);
    expect(r.stitched).toEqual([id]);
    expect(f.stitches).toHaveLength(1);
    expect(f.stitches[0]!.body).toMatchObject({
      segments: [{ url: 'https://s/1.mp4' }, { url: 'https://s/2.mp4' }], musicUrl: 'https://s/score.mp3', filmTokenId: 'f1',
      scorePrompt: 'a short film about the sea', orientation: 'vertical', captionLang: 'ka',
    });
    expect(row(f, id)).toMatchObject({ status: 'completed', signedUrl: null, result: { outcome: 'delivered', by: 'server' } });
    expect(JSON.stringify(row(f, id).result)).not.toMatch(/https:/);
    expect(f.refunds).toEqual([]);
  });

  test('one stitch per sweep, and only with enough of the sweep left', async () => {
    const f = fake();
    await file(f, 'f1');
    f.clock.now += 1;
    await file(f, 'f2');
    f.clock.now = T0 + 5 * 60_000;
    const r = await sweep(f);
    expect(f.stitches.map((s) => s.t)).toEqual(['f1']);
    expect(r.waiting).toContain(followJobId('f2'));
    const g = fake();
    await file(g, 'f3');
    g.clock.now = T0 + 5 * 60_000;
    await sweep(g, STITCH_MIN_BUDGET_MS - 1);
    expect(g.stitches).toEqual([]);
  });

  test('too few scenes → closed as failed, its charge paid back, the owner told', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.pollAnswer = (t) => ({ ...failedScenes(t), sceneCount: 3, clips: [...failedScenes(t).clips, { ordinal: 3, status: 'failed', url: null }] });
    f.clock.now = T0 + 5 * 60_000;
    const r = await sweep(f);
    expect(r.failed).toEqual([id]);
    expect(row(f, id)).toMatchObject({ status: 'failed' });
    expect(row(f, id).exec?.owe).toBeUndefined();
    expect(f.refunds).toEqual(['f1']);
    expect(f.failedMarks).toEqual(['f1']);
    expect(f.notified).toEqual([{ t: 'f1', refunded: true }]);
  });

  test('a stitch the route refuses for good is failed and paid back', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.stitchAnswer = async () => ({ status: 502, url: null, error: 'qc_rejected' });
    f.clock.now = T0 + 5 * 60_000;
    const r = await sweep(f);
    expect(r.stitch).toEqual({ id, outcome: 'failed' });
    expect(f.refunds).toEqual(['f1']);
  });

  test('a contracted partial film keeps its plan, fails on 422 and refunds once instead of waiting as busy', async () => {
    const f = fake();
    const id = await file(f, 'f1', { plan: { finalDurationSec: 24 } });
    f.pollAnswer = (t) => ({ ...ready(t), sceneCount: 3, clipSec: 8, readyToStitch: false, clips: [
      { ordinal: 1, status: 'succeeded', url: 'https://s/1.mp4' },
      { ordinal: 2, status: 'failed', url: null },
      { ordinal: 3, status: 'succeeded', url: 'https://s/3.mp4' },
    ] });
    f.stitchAnswer = async () => ({ status: 422, url: null, error: 'contracted_segment_unavailable' });
    f.clock.now = T0 + 5 * 60_000;
    expect((await sweep(f)).stitch).toEqual({ id, outcome: 'failed' });
    expect(f.stitches[0].body).toMatchObject({ finalDurationSec: 24, expectedSegments: 3 });
    expect(f.stitches[0].body.segments).toHaveLength(2);
    expect(f.refunds).toEqual(['f1']);
    f.clock.now += LEASE_MS + 1;
    await sweep(f);
    expect(f.stitches).toHaveLength(1);
    expect(f.refunds).toEqual(['f1']);
  });

  test('a stitch that died on the way is tried once more, then paid back: never more than two stitches', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.stitchAnswer = async () => ({ status: 0, url: null, error: null });
    f.clock.now = T0 + 5 * 60_000;
    expect((await sweep(f)).stitch).toEqual({ id, outcome: 'retry' });
    expect(row(f, id).status).toBe('processing');
    f.clock.now += LEASE_MS + 1;
    expect((await sweep(f)).stitch).toEqual({ id, outcome: 'failed' });
    expect(f.stitches).toHaveLength(2);
    expect(f.refunds).toEqual(['f1']);
  });

  test('someone else stitching right now (409) is left to finish', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.stitchAnswer = async () => ({ status: 409, url: null, error: 'duplicate_request' });
    f.clock.now = T0 + 5 * 60_000;
    expect((await sweep(f)).stitch).toEqual({ id, outcome: 'busy' });
    expect(f.refunds).toEqual([]);
    // That stitch delivers: the next sweep after the lease closes the row as delivered.
    f.status.set('f1', { tokenId: 'f1', phase: 'assembled', clips: [], audioReady: true, masterUrl: 'https://s/m.mp4', updatedAt: f.clock.now });
    f.clock.now += LEASE_MS + 1;
    expect((await sweep(f)).delivered).toEqual([id]);
    expect(f.refunds).toEqual([]);
  });

  test('a poll that fails says nothing: the film waits, and is given up only well past every window', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.pollAnswer = () => 'error';
    f.clock.now = T0 + FOLLOW_MAX_MS + 1;
    await sweep(f);
    expect(row(f, id).status).toBe('pending');
    f.clock.now = T0 + FOLLOW_MAX_MS + FOLLOW_STITCH_WINDOW_MS + 1;
    expect((await sweep(f)).failed).toEqual([id]);
    expect(f.refunds).toEqual(['f1']);
  });

  test('a record past its life is closed owing its charge, unless the film has its master', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    f.clock.now = T0 + FOLLOW_TTL_MS + 1;
    expect((await sweep(f)).failed).toEqual([id]);
    expect(f.polls).toEqual([]);
    expect(f.refunds).toEqual(['f1']);
  });
});

describe('the record is the server\'s', () => {
  test('a row whose record was not signed here is failed, owing nothing', async () => {
    const f = fake();
    const id = followJobId('f1');
    await enqueue(f.store, { id, userId: USER, serviceType: 'film', kind: FILM_FOLLOW_KIND, params: { _follow: signFollow(recFor('f1'), 'another-key') } });
    f.clock.now = T0 + 5 * 60_000;
    const r = await sweep(f);
    expect(r.invalid).toEqual([id]);
    expect(row(f, id).status).toBe('failed');
    expect(row(f, id).exec?.owe).toBeUndefined();
    expect(f.polls).toEqual([]);
    expect(f.refunds).toEqual([]);
  });

  test('a record filed under another user\'s row does not verify', async () => {
    const f = fake();
    const id = followJobId('f1');
    await enqueue(f.store, { id, userId: 'user-2', serviceType: 'film', kind: FILM_FOLLOW_KIND, params: { _follow: signFollow(recFor('f1'), KEY) } });
    f.clock.now = T0 + 5 * 60_000;
    expect((await sweep(f)).invalid).toEqual([id]);
    expect(f.refunds).toEqual([]);
  });
});

describe('the debt is paid only once nothing can deliver the film', () => {
  async function owing(f: Fake, t: string): Promise<string> {
    const id = await file(f, t);
    const r = row(f, id);
    // Closed and owing, as a failure or a reap writes it.
    Object.assign(r, { status: 'failed', exec: { ...r.exec!, owe: 'refund', v: r.exec!.v + 1 } });
    r.params = { ...r.params, _exec: r.exec };
    return id;
  }

  test('a film in the owner\'s Library is settled without paying', async () => {
    const f = fake();
    const id = await owing(f, 'f1');
    f.library.add('f1');
    expect(await payDebt(f.deps, row(f, id))).toBe('settled');
    expect(f.refunds).toEqual([]);
    expect(row(f, id).exec?.owe).toBeUndefined();
  });

  test('a film with its master on the status record is settled without paying', async () => {
    const f = fake();
    const id = await owing(f, 'f1');
    f.status.set('f1', { tokenId: 'f1', phase: 'assembled', clips: [], audioReady: true, masterUrl: 'https://s/m.mp4', updatedAt: T0 });
    expect(await payDebt(f.deps, row(f, id))).toBe('settled');
    expect(f.refunds).toEqual([]);
  });

  test('a stitch still running, an unreadable Library or status, or a refund that did not land keeps the debt', async () => {
    const f = fake();
    const id = await owing(f, 'f1');
    f.status.set('f1', { tokenId: 'f1', phase: 'assembling', clips: [], audioReady: true, masterUrl: null, updatedAt: T0 - 60_000 });
    expect(await payDebt(f.deps, row(f, id))).toBe('kept');
    f.status.set('f1', 'unknown');
    expect(await payDebt(f.deps, row(f, id))).toBe('kept');
    f.status.delete('f1');
    f.libraryDown = true;
    expect(await payDebt(f.deps, row(f, id))).toBe('kept');
    f.libraryDown = false;
    f.refundAnswer = 'error';
    expect(await payDebt(f.deps, row(f, id))).toBe('kept');
    expect(row(f, id).exec?.owe).toBe('refund');
    // The next sweep pays it.
    f.refundAnswer = 'paid';
    const r = await sweep(f);
    expect(r.paid).toEqual([id]);
    expect(f.refunds).toEqual(['f1']);
    expect(row(f, id).exec?.owe).toBeUndefined();
  });

  test('a film with nothing left charged is settled, and the owner still told', async () => {
    const f = fake();
    const id = await owing(f, 'f1');
    f.refundAnswer = 'nothing';
    expect(await payDebt(f.deps, row(f, id))).toBe('paid');
    expect(f.notified).toEqual([{ t: 'f1', refunded: false }]);
  });

  test('a row whose last attempt died is reaped owing its charge, and paid in the same sweep', async () => {
    const f = fake();
    const id = await file(f, 'f1');
    const r = row(f, id);
    Object.assign(r, { status: 'processing', exec: { ...r.exec!, attempt: FOLLOW_MAX_ATTEMPTS, owner: 'dead', leaseUntil: T0 } });
    r.params = { ...r.params, _exec: r.exec };
    f.clock.now = T0 + 10 * 60_000;
    const out = await sweep(f);
    expect(out.gaveUp).toEqual([id]);
    expect(out.paid).toEqual([id]);
    expect(f.refunds).toEqual(['f1']);
  });
});
