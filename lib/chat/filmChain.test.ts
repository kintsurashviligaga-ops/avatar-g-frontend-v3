/** @jest-environment node */
/**
 * The sequential chain: every scene after the first starts from the previous clip's real last frame.
 *
 * ⚠️ 2026-10-16: on the paid 32 s ad Veo ignored the "end on the next storyboard frame" request and every join jumped in
 * pose, framing and light. The owner chose to render the scenes one after another from the real last frame. These tests
 * pin who may send a scene, from which frame, exactly once, and what a failure costs.
 */
jest.mock('server-only', () => ({}));

import {
  advanceFilmChain, chainNextStep, chainRetryDue, claimFilmChainStep, filmChainStoreReady, filmSequentialChainOn, getFilmChainPlan,
  getFilmChainSteps, recordFilmChainStep, saveFilmChainPlan, __setFilmChainRedisForTests, CHAIN_CLAIM_STALE_MS,
  FILM_CHAIN_MAX_SCENES, type FilmChainDeps, type FilmChainLeg, type FilmChainPlan, type FilmChainStep,
} from './filmChain';

const plan = (over: Partial<FilmChainPlan> = {}): FilmChainPlan => ({
  v: 1, tokenId: 'f0123456789abcdef', uid: 'user-1', sessionId: 's1', locale: 'ka', compositeId: 'film:s1:1',
  videoModel: null, forecast: { wholesaleGel: 1, retailGel: 2 }, sceneCredits: 25, chargeRef: 'film:charge:f0123456789abcdef',
  scenes: [2, 3, 4].map((o) => ({
    ordinal: o, seed: 7, userPrompt: `scene ${o}`, selectedOptions: { veoTier: 'fast' }, storyboardFrame: `https://frames.example/${o}.png`,
  })),
  createdAt: 1, ...over,
});
const legs = (...s: Array<[FilmChainLeg['status'], string | null]>): FilmChainLeg[] =>
  s.map(([status, url], i) => ({ ordinal: i + 1, status, url }));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function deps(over: Partial<FilmChainDeps> = {}): FilmChainDeps & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = { extract: [], host: [], dispatch: [], share: [], refund: [] };
  let n = 0;
  return {
    calls,
    extractLastFrame: async (...a) => { calls.extract!.push(a); return JPEG; },
    hostFrame: async (...a) => { calls.host!.push(a); return `https://storage.example/chain/${a[1]}.jpg`; },
    dispatch: async (...a) => { calls.dispatch!.push(a); return { taskRef: `job-${++n}`, status: 'queued' }; },
    recordShare: async (...a) => { calls.share!.push(a); },
    refundScene: async (...a) => { calls.refund!.push(a); },
    ...over,
  };
}

beforeEach(() => {
  process.env.FILM_CHAIN_MEMORY = '1';
  delete process.env.FILM_SEQUENTIAL_CHAIN;
  __setFilmChainRedisForTests(null);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  delete process.env.FILM_CHAIN_MEMORY;
  jest.restoreAllMocks();
});

describe('which films chain', () => {
  const base = { sceneCount: 4, googleOnly: true, referenceMode: false, musicVideo: false, owner: 'user-1' };
  test('a Google-only, first-frame film of 2–8 scenes with a signed-in owner', () => {
    expect(filmSequentialChainOn(base)).toBe(true);
    expect(filmSequentialChainOn({ ...base, sceneCount: 2 })).toBe(true);
    expect(filmSequentialChainOn({ ...base, sceneCount: FILM_CHAIN_MAX_SCENES })).toBe(true);
  });
  test('not one scene, not past the poll window, not reference mode, not a music video, not off Veo, not a guest', () => {
    expect(filmSequentialChainOn({ ...base, sceneCount: 1 })).toBe(false);
    expect(filmSequentialChainOn({ ...base, sceneCount: FILM_CHAIN_MAX_SCENES + 1 })).toBe(false);
    expect(filmSequentialChainOn({ ...base, referenceMode: true })).toBe(false);
    expect(filmSequentialChainOn({ ...base, musicVideo: true })).toBe(false);
    expect(filmSequentialChainOn({ ...base, googleOnly: false })).toBe(false);
    expect(filmSequentialChainOn({ ...base, owner: null })).toBe(false);
    expect(filmSequentialChainOn({ ...base, owner: 'anonymous' })).toBe(false);
  });
  test('FILM_SEQUENTIAL_CHAIN=0 turns it off', () => {
    process.env.FILM_SEQUENTIAL_CHAIN = '0';
    expect(filmSequentialChainOn(base)).toBe(false);
  });
});

describe('the next scene due', () => {
  const none = new Map<number, FilmChainStep>();
  test('waits while the previous clip renders', () => {
    expect(chainNextStep(plan(), legs(['pending', null], ['pending', null]), none)).toBeNull();
  });
  test('starts from the last frame of the clip that landed', () => {
    expect(chainNextStep(plan(), legs(['succeeded', 'https://media.example/1.mp4'], ['pending', null]), none))
      .toEqual({ ordinal: 2, from: 'last-frame', sourceUrl: 'https://media.example/1.mp4' });
  });
  test('starts from its own storyboard frame when the previous scene failed', () => {
    expect(chainNextStep(plan(), legs(['failed', null], ['pending', null]), none)).toEqual({ ordinal: 2, from: 'storyboard' });
  });
  test('one scene at a time, in film order', () => {
    const steps = new Map<number, FilmChainStep>([[2, { taskRef: 'job-2', status: 'queued', from: 'last-frame', at: 1 }]]);
    // Scene 2 is sent but still rendering: scene 3 waits for it.
    expect(chainNextStep(plan(), legs(['succeeded', 'u1'], ['pending', null], ['pending', null]), steps)).toBeNull();
    expect(chainNextStep(plan(), legs(['succeeded', 'u1'], ['succeeded', 'u2'], ['pending', null]), steps))
      .toEqual({ ordinal: 3, from: 'last-frame', sourceUrl: 'u2' });
  });
  test('nothing once every scene has its outcome', () => {
    const done = new Map<number, FilmChainStep>([2, 3, 4].map((o) => [o, { taskRef: `j${o}`, status: 'queued', from: 'last-frame', at: 1 }]));
    expect(chainNextStep(plan(), legs(['succeeded', 'u1'], ['succeeded', 'u2'], ['succeeded', 'u3'], ['succeeded', 'u4']), done)).toBeNull();
  });
});

describe('advancing the chain', () => {
  const landed = legs(['succeeded', 'https://media.example/1.mp4'], ['pending', null], ['pending', null], ['pending', null]);

  test('the owner’s poll sends scene 2 from scene 1’s real last frame, hosted, and records its share', async () => {
    const d = deps();
    const out = await advanceFilmChain(plan(), landed, new Map(), 'user-1', d);
    expect(out).toEqual({ ordinal: 2, step: expect.objectContaining({ taskRef: 'job-1', status: 'queued', from: 'last-frame' }) });
    expect(d.calls.extract).toEqual([['https://media.example/1.mp4']]);
    expect(d.calls.host![0]![1]).toBe(2);
    expect(d.calls.dispatch![0]![2]).toBe('https://storage.example/chain/2.jpg');
    expect(d.calls.share).toEqual([[expect.objectContaining({ tokenId: 'f0123456789abcdef' }), 2, 'job-1']]);
    expect(d.calls.refund).toEqual([]);
    // The outcome is on the server for every later poll.
    const steps = await getFilmChainSteps(plan());
    expect(steps?.get(2)).toEqual(expect.objectContaining({ taskRef: 'job-1', status: 'queued' }));
  });

  test('another user’s poll (or a guest’s) sends nothing', async () => {
    const d = deps();
    expect(await advanceFilmChain(plan(), landed, new Map(), 'user-2', d)).toBeNull();
    expect(await advanceFilmChain(plan(), landed, new Map(), null, d)).toBeNull();
    expect(d.calls.dispatch).toEqual([]);
  });

  test('two polls at once: the scene is sent exactly once', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const d = deps({ extractLastFrame: async () => { await gate; return JPEG; } });
    const first = advanceFilmChain(plan(), landed, new Map(), 'user-1', d);
    const second = await advanceFilmChain(plan(), landed, new Map(), 'user-1', d);
    release();
    expect(second).toBeNull();
    expect((await first)?.step.status).toBe('queued');
    expect(d.calls.dispatch).toHaveLength(1);
  });

  test('an unreadable last frame falls back to the scene’s storyboard frame', async () => {
    const d = deps({ extractLastFrame: async () => null });
    const out = await advanceFilmChain(plan(), landed, new Map(), 'user-1', d);
    expect(out?.step.from).toBe('storyboard');
    expect(d.calls.host).toEqual([]);
  });

  test('a frame that cannot be hosted falls back the same way', async () => {
    const d = deps();
    d.hostFrame = async () => null;
    const out = await advanceFilmChain(plan(), landed, new Map(), 'user-1', d);
    expect(out?.step.from).toBe('storyboard');
  });

  test('a failed predecessor: the scene starts from its storyboard frame without reading any clip', async () => {
    const d = deps();
    const out = await advanceFilmChain(plan(), legs(['failed', null], ['pending', null]), new Map(), 'user-1', d);
    expect(out?.step).toEqual(expect.objectContaining({ status: 'queued', from: 'storyboard' }));
    expect(d.calls.extract).toEqual([]);
  });

  test('a dispatch that fails is recorded failed, gives the scene’s share back once, and records no share', async () => {
    const d = deps({ dispatch: async () => ({ taskRef: null, status: 'failed', error: 'veo quota — not retried' }) });
    const out = await advanceFilmChain(plan(), landed, new Map(), 'user-1', d);
    expect(out?.step).toEqual(expect.objectContaining({ status: 'failed', taskRef: null, error: 'veo quota — not retried' }));
    expect(d.calls.refund).toEqual([[expect.objectContaining({ tokenId: 'f0123456789abcdef' }), 2]]);
    expect(d.calls.share).toEqual([]);
    // A later poll finds the outcome and does not send the scene again.
    expect(await advanceFilmChain(plan(), landed, (await getFilmChainSteps(plan()))!, 'user-1', d)).not.toEqual(expect.objectContaining({ ordinal: 2 }));
  });

  test('a claim whose poll died mid-dispatch is NOT sent again: recorded failed, share back', async () => {
    const t0 = 1_000_000;
    expect(await claimFilmChainStep('f0123456789abcdef', 2, t0)).toBe('claimed');
    const d = deps({ now: () => t0 + 60_000 });
    expect(await advanceFilmChain(plan(), landed, new Map(), 'user-1', d)).toBeNull(); // still held
    const late = deps({ now: () => t0 + CHAIN_CLAIM_STALE_MS + 1 });
    const out = await advanceFilmChain(plan(), landed, new Map(), 'user-1', late);
    expect(out?.step).toEqual(expect.objectContaining({ status: 'failed', taskRef: null }));
    expect(late.calls.dispatch).toEqual([]);
    expect(late.calls.refund).toHaveLength(1);
  });

  test('a dispatch that throws is a failed scene, never a thrown poll', async () => {
    const d = deps({ dispatch: async () => { throw new Error('socket hang up'); } });
    const out = await advanceFilmChain(plan(), landed, new Map(), 'user-1', d);
    expect(out?.step.status).toBe('failed');
  });
});

describe('a scene Google declined from a last frame', () => {
  // ⚠️ 2026-10-17: scene 3 of the paid ad was refused under Google's celebrity rule when it started from clip 2's last
  // frame; nothing tried its own approved storyboard frame, and the 32 s film came out 24 s.
  const queuedFrom = (from: FilmChainStep['from'], extra: Partial<FilmChainStep> = {}): FilmChainStep => ({ taskRef: 'job-a', status: 'queued', from, at: 1, ...extra });
  const declined = (...s: Array<[FilmChainLeg['status'], string | null, boolean?]>): FilmChainLeg[] =>
    s.map(([status, url, d], i) => ({ ordinal: i + 1, status, url, ...(d ? { declined: true } : {}) }));

  test('is due once more, from its storyboard frame, only after a last-frame start the filter declined', () => {
    const steps = new Map([[2, queuedFrom('last-frame')]]);
    expect(chainRetryDue(plan(), declined(['succeeded', 'u1'], ['failed', null, true]), steps)).toEqual({ ordinal: 2 });
    // a storyboard start declined, a plain failure, an earlier second try, a scene with no storyboard frame: never
    expect(chainRetryDue(plan(), declined(['succeeded', 'u1'], ['failed', null, true]), new Map([[2, queuedFrom('storyboard')]]))).toBeNull();
    expect(chainRetryDue(plan(), declined(['succeeded', 'u1'], ['failed', null]), steps)).toBeNull();
    expect(chainRetryDue(plan(), declined(['succeeded', 'u1'], ['failed', null, true]), new Map([[2, queuedFrom('storyboard', { retry: true })]]))).toBeNull();
    const noFrame = plan({ scenes: plan().scenes.map((s) => ({ ...s, storyboardFrame: null })) });
    expect(chainRetryDue(noFrame, declined(['succeeded', 'u1'], ['failed', null, true]), steps)).toBeNull();
  });

  test('the owner’s poll re-sends it from its storyboard frame, records it as the second try, and holds the next scene', async () => {
    const d = deps();
    const p = plan();
    await recordFilmChainStep(p.tokenId, 2, queuedFrom('last-frame'));
    const steps = (await getFilmChainSteps(p))!;
    const out = await advanceFilmChain(p, declined(['succeeded', 'u1'], ['failed', null, true], ['pending', null]), steps, 'user-1', d);
    expect(out).toMatchObject({ ordinal: 2, step: { status: 'queued', from: 'storyboard', retry: true, taskRef: 'job-1' } });
    expect(d.calls.dispatch).toHaveLength(1);
    expect((d.calls.dispatch[0]![1] as { ordinal: number }).ordinal).toBe(2);
    expect(d.calls.dispatch[0]![2]).toBe('https://frames.example/2.png');
    expect(d.calls.extract).toHaveLength(0);
    expect(d.calls.refund).toHaveLength(0);
    // The film now follows the second try's job; the first try's record still stands under its own key.
    const after = (await getFilmChainSteps(p))!;
    expect(after.get(2)).toMatchObject({ taskRef: 'job-1', retry: true });
    // Its job renders → nothing else is sent, and the next scene waits for it.
    expect(await advanceFilmChain(p, declined(['succeeded', 'u1'], ['pending', null], ['pending', null]), after, 'user-1', d)).toBeNull();
    expect(d.calls.dispatch).toHaveLength(1);
  });

  test('two polls at once: the second try is sent exactly once, and neither sends the next scene', async () => {
    const d = deps();
    const p = plan();
    await recordFilmChainStep(p.tokenId, 2, queuedFrom('last-frame'));
    const steps = (await getFilmChainSteps(p))!;
    const l = declined(['succeeded', 'u1'], ['failed', null, true], ['pending', null]);
    const [a, b] = await Promise.all([advanceFilmChain(p, l, steps, 'user-1', d), advanceFilmChain(p, l, steps, 'user-1', d)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(d.calls.dispatch).toHaveLength(1);
  });

  test('a second try that fails at dispatch is recorded failed and gives the scene’s share back once', async () => {
    const d = deps({ dispatch: async () => ({ taskRef: null, status: 'failed', error: 'refused' }) });
    const p = plan();
    await recordFilmChainStep(p.tokenId, 2, queuedFrom('last-frame'));
    const out = await advanceFilmChain(p, declined(['succeeded', 'u1'], ['failed', null, true]), (await getFilmChainSteps(p))!, 'user-1', d);
    expect(out).toMatchObject({ ordinal: 2, step: { status: 'failed', retry: true } });
    expect(d.calls.refund).toEqual([[p, 2]]);
    expect((await getFilmChainSteps(p))!.get(2)).toMatchObject({ status: 'failed', retry: true });
  });

  test('another user’s poll never re-sends it', async () => {
    const d = deps();
    const p = plan();
    await recordFilmChainStep(p.tokenId, 2, queuedFrom('last-frame'));
    expect(await advanceFilmChain(p, declined(['succeeded', 'u1'], ['failed', null, true]), (await getFilmChainSteps(p))!, 'someone-else', d)).toBeNull();
    expect(d.calls.dispatch).toHaveLength(0);
  });
});

describe('the store', () => {
  test('the first outcome wins: a late writer cannot replace it', async () => {
    expect(await recordFilmChainStep('f0123456789abcdef', 3, { taskRef: null, status: 'failed', from: 'none', at: 1 })).toBe(true);
    expect(await recordFilmChainStep('f0123456789abcdef', 3, { taskRef: 'job-9', status: 'queued', from: 'last-frame', at: 2 })).toBe(false);
    expect((await getFilmChainSteps(plan()))?.get(3)?.status).toBe('failed');
  });

  test('a plan round-trips, and only for its own token', async () => {
    expect(await saveFilmChainPlan(plan())).toBe(true);
    expect((await getFilmChainPlan('f0123456789abcdef'))?.scenes.map((s) => s.ordinal)).toEqual([2, 3, 4]);
    expect(await getFilmChainPlan('ffffffffffffffff0')).toBeNull();
  });

  test('without Redis or the dev memory switch there is no store, so the film renders side by side', async () => {
    delete process.env.FILM_CHAIN_MEMORY;
    expect(filmChainStoreReady()).toBe(false);
    expect(await saveFilmChainPlan(plan())).toBe(false);
    expect(await claimFilmChainStep('f0123456789abcdef', 2, 1)).toBe('unavailable');
  });

  test('a Redis that errors keeps nothing and claims nothing', async () => {
    const boom = async () => { throw new Error('ECONNRESET'); };
    __setFilmChainRedisForTests({ set: boom, get: boom, mget: boom } as unknown as Parameters<typeof __setFilmChainRedisForTests>[0]);
    expect(await saveFilmChainPlan(plan())).toBe(false);
    expect(await claimFilmChainStep('f0123456789abcdef', 2, 1)).toBe('unavailable');
    expect(await getFilmChainSteps(plan())).toBeNull();
  });

  test('on Redis: the plan is kept for the token’s life and a claim is SET NX', async () => {
    const store = new Map<string, string>();
    const set = jest.fn(async (k: string, v: string, o?: { nx?: boolean }) => {
      if (o?.nx && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    });
    __setFilmChainRedisForTests({
      set, get: async (k: string) => store.get(k) ?? null, mget: async (...k: string[]) => k.map((x) => store.get(x) ?? null),
    } as unknown as Parameters<typeof __setFilmChainRedisForTests>[0]);
    expect(await saveFilmChainPlan(plan())).toBe(true);
    expect(set).toHaveBeenCalledWith('film:chain:f0123456789abcdef', expect.any(String), { ex: 21600 });
    expect(await claimFilmChainStep('f0123456789abcdef', 2, 5)).toBe('claimed');
    expect(await claimFilmChainStep('f0123456789abcdef', 2, 6)).toBe('held');
    expect(set).toHaveBeenCalledWith('film:chain:f0123456789abcdef:claim:2', '5', { nx: true, ex: 21600 });
  });
});
