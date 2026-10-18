/** @jest-environment node */
/**
 * The three steps of a scene redo behind /api/film/scene/redo: who is charged what and when, what is given back, and what
 * the film is cut from. Every outside call is a fake; the store is an in-memory map with the real claim semantics.
 */
import { pollSceneRedo, quoteSceneRedo, readRedoTarget, startSceneRedo, stitchSceneRedo, REDO_STITCH_STALE_MS, type RedoDeps } from './filmSceneRedoFlow';
import { REDO_RENDER_DEADLINE_MS, type FilmRedoJob, type FilmSceneBook, type FilmStitchRecord } from './filmSceneRedo';

const TOKEN = 'f0123456789abcdef';

const book = (over: Partial<FilmSceneBook> = {}): FilmSceneBook => ({
  v: 1, tokenId: TOKEN, uid: 'user-1', sessionId: 's1', locale: 'ka', compositeId: 'film:s1:1', videoModel: null,
  forecast: { wholesaleGel: 1, retailGel: 2 }, scenePrice: 25, createdAt: 1,
  scenes: [1, 2, 3].map((o) => ({ ordinal: o, seed: 10 + o, userPrompt: `scene ${o}`, selectedOptions: { veoTier: 'fast' }, storyboardFrame: `https://frames.example/${o}.png` })),
  ...over,
});

const stitchRecord = (over: Partial<FilmStitchRecord> = {}): FilmStitchRecord => ({
  v: 1, tokenId: TOKEN, uid: 'user-1', at: 1, musicUrl: 'https://store.example/score.mp3',
  segments: [1, 2, 3].map((o) => ({ url: `https://clips.example/${o}.mp4`, durationSec: 8, ordinal: o })),
  body: { voiceoverUrl: 'https://store.example/vo.mp3', orientation: 'vertical' },
  ...over,
});

type Fake = RedoDeps & {
  jobs: Map<string, FilmRedoJob>;
  claims: Set<string>;
  charges: Array<[string, number, string]>;
  refunds: Array<[string, string]>;
  submits: unknown[][];
  stitches: Array<Record<string, unknown>>;
  clock: { t: number };
};

function fake(over: Partial<RedoDeps> = {}, opts: { book?: FilmSceneBook | null; record?: FilmStitchRecord | null } = {}): Fake {
  const jobs = new Map<string, FilmRedoJob>();
  const claims = new Set<string>();
  const counts = new Map<string, number>();
  const clock = { t: 1_000_000 };
  const charges: Fake['charges'] = [];
  const refunds: Fake['refunds'] = [];
  const submits: unknown[][] = [];
  const stitches: Array<Record<string, unknown>> = [];
  const theBook = opts.book === undefined ? book() : opts.book;
  const theRecord = opts.record === undefined ? stitchRecord() : opts.record;
  const deps: Fake = {
    jobs, claims, charges, refunds, submits, stitches, clock,
    ready: () => true,
    getBook: async (t, uid) => (theBook && theBook.tokenId === t && theBook.uid === uid ? theBook : null),
    getStitchRecord: async (t, uid) => (theRecord && theRecord.tokenId === t && theRecord.uid === uid ? theRecord : null),
    getJob: async (t, n, uid) => { const j = jobs.get(`${t}:${n}`); return j && j.uid === uid ? j : null; },
    saveJob: async (j) => { jobs.set(`${j.tokenId}:${j.ordinal}`, j); return true; },
    claimRender: async (t, n) => (claims.has(`r:${t}:${n}`) ? false : (claims.add(`r:${t}:${n}`), true)),
    releaseRender: async (t, n) => { claims.delete(`r:${t}:${n}`); },
    nextAttempt: async (t, n) => { const k = `${t}:${n}`; const v = (counts.get(k) ?? 0) + 1; counts.set(k, v); return v; },
    claimStitch: async (t) => (claims.has(`s:${t}`) ? false : (claims.add(`s:${t}`), true)),
    releaseStitch: async (t) => { claims.delete(`s:${t}`); },
    isAdmin: async () => false,
    charge: async (uid, amount, ref) => { charges.push([uid, amount, ref]); return { ok: true }; },
    refund: async (uid, ref) => { refunds.push([uid, ref]); return true; },
    toEnglish: async (n) => `EN(${n})`,
    submit: async (...a) => { submits.push(a); return { status: 'queued', taskRef: 'task-1' }; },
    pollTask: async () => ({ status: 'pending', url: null }),
    veoVerdict: async () => 'unknown',
    renewLink: async (u) => u,
    stitch: async (body) => { stitches.push(body); return { status: 200, url: 'https://store.example/master-2.mp4', error: null }; },
    isBudgetRefusal: (e) => typeof e === 'string' && e.startsWith('budget_exceeded:'),
    budgetMessage: () => 'daily limit reached',
    now: () => clock.t,
    ...over,
  };
  return deps;
}

describe('what a caller may name', () => {
  test('a film token and a scene number 1–24', () => {
    expect(readRedoTarget(TOKEN, 2)).toEqual({ tokenId: TOKEN, ordinal: 2 });
    expect(readRedoTarget(` ${TOKEN} `, '3')).toEqual({ tokenId: TOKEN, ordinal: 3 });
    for (const bad of [[TOKEN, 0], [TOKEN, 25], [TOKEN, 1.5], [TOKEN, 'two'], ['', 1], ['a/b', 1], [null, 1], ['x'.repeat(200), 1]]) {
      expect(readRedoTarget(bad[0], bad[1])).toBeNull();
    }
  });
});

describe('quote', () => {
  test('the price the priced question shows: the scene’s own, 0 for an admin; another account’s film has none', async () => {
    expect((await quoteSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, fake())).body).toEqual({ price: 25, ordinal: 2, scenes: 3 });
    expect((await quoteSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, fake({ isAdmin: async () => true }))).body.price).toBe(0);
    expect((await quoteSceneRedo('user-2', { tokenId: TOKEN, ordinal: 2 }, fake())).status).toBe(404);
    expect((await quoteSceneRedo('user-1', { tokenId: TOKEN, ordinal: 5 }, fake())).status).toBe(404);
  });
});

describe('start', () => {
  test('never takes more than the price the user was shown', async () => {
    const d = fake();
    const out = await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2, expectedPrice: 20 }, d);
    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({ error: 'price_changed', price: 25 });
    expect(d.charges).toEqual([]);
    expect(d.claims.size).toBe(0);
    expect((await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2, expectedPrice: 25 }, d)).status).toBe(202);
  });

  test('charges the scene’s price once, under the attempt’s ref, and sends the scene again from its own frame', async () => {
    const d = fake();
    const out = await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2, note: 'warmer light' }, d);
    expect(out.status).toBe(202);
    expect(out.body).toMatchObject({ price: 25, redo: { ordinal: 2, attempt: 1, status: 'rendering', credits: 25 } });
    expect(d.charges).toEqual([['user-1', 25, `filmredo:${TOKEN}:2:1`]]);
    const [sentBook, req, sc, compositeId] = d.submits[0] as [FilmSceneBook, { userPrompt: string; selectedOptions: Record<string, string> }, { ordinal: number; seed: number }, string];
    expect(sentBook.sessionId).toBe('s1');
    expect(req.userPrompt).toBe('scene 2 EDIT FOR THIS SCENE: EN(warmer light).');
    expect(req.selectedOptions.characterReference).toBe('https://frames.example/2.png');
    expect(sc.ordinal).toBe(2);
    expect(sc.seed).not.toBe(12);
    expect(compositeId).toBe('film:s1:1:redo:2:1');
    expect(d.jobs.get(`${TOKEN}:2`)?.taskRef).toBe('task-1');
    expect(d.claims.has(`r:${TOKEN}:2`)).toBe(true);
  });

  test('an admin pays nothing', async () => {
    const d = fake({ isAdmin: async () => true });
    const out = await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(out.status).toBe(202);
    expect(out.body.price).toBe(0);
    expect(d.charges).toEqual([]);
  });

  test('another account’s film, an unknown scene, or no store: refused before anything is taken', async () => {
    const d = fake();
    expect((await startSceneRedo('user-2', { tokenId: TOKEN, ordinal: 2 }, d)).status).toBe(404);
    expect((await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 7 }, d)).status).toBe(404);
    expect((await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, fake({ ready: () => false }))).status).toBe(503);
    expect(d.charges).toEqual([]);
    expect(d.submits).toEqual([]);
  });

  test('one render of a scene at a time: a second press while it renders is refused and charged nothing', async () => {
    const d = fake();
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    const again = await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('scene_busy');
    expect(d.charges).toHaveLength(1);
  });

  test('not enough credits → 402 with the price; a ledger that cannot answer → 503; neither renders, both free the scene', async () => {
    const poor = fake({ charge: async () => ({ ok: false, reason: 'insufficient' }) });
    const out = await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, poor);
    expect(out.status).toBe(402);
    expect(out.body).toMatchObject({ error: 'insufficient_credits', price: 25 });
    expect(poor.submits).toEqual([]);
    expect(poor.claims.size).toBe(0);
    const down = fake({ charge: async () => ({ ok: false, reason: 'skipped' }) });
    expect((await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, down)).status).toBe(503);
    expect(down.submits).toEqual([]);
  });

  test('a scene that could not be sent gives the price back at once; a spent daily budget says so', async () => {
    const d = fake({ submit: async () => ({ status: 'failed', taskRef: null, error: 'budget_exceeded:veo_daily' }) });
    const out = await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(out.status).toBe(429);
    expect(out.body).toMatchObject({ error: 'budget_exhausted', message: 'daily limit reached', redo: { status: 'failed', refunded: true } });
    expect(d.refunds).toEqual([['user-1', `filmredo:${TOKEN}:2:1`]]);
    expect(d.claims.size).toBe(0);
    const e = fake({ submit: async () => { throw new Error('boom'); } });
    expect((await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, e)).status).toBe(502);
    expect(e.refunds).toHaveLength(1);
  });

  test('a render the store cannot keep track of is not charged for', async () => {
    const d = fake();
    d.saveJob = async (j) => { if (j.status === 'rendering') return false; d.jobs.set(`${j.tokenId}:${j.ordinal}`, j); return true; };
    const out = await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(out.status).toBe(503);
    expect(d.refunds).toHaveLength(1);
  });

  test('the next attempt has its own ref and seed', async () => {
    const d = fake({ pollTask: async () => ({ status: 'succeeded', url: 'https://clips.example/2-a.mp4' }) });
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(d.charges.map((c) => c[2])).toEqual([`filmredo:${TOKEN}:2:1`, `filmredo:${TOKEN}:2:2`]);
    const seeds = d.submits.map((s) => (s[2] as { seed: number }).seed);
    expect(seeds[0]).not.toBe(seeds[1]);
  });
});

describe('poll', () => {
  test('a landed render becomes the scene’s new clip and frees the scene', async () => {
    const d = fake({ pollTask: async () => ({ status: 'succeeded', url: 'https://clips.example/2-new.mp4' }) });
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    const out = await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(out.body.redo).toMatchObject({ status: 'ready', clipUrl: 'https://clips.example/2-new.mp4' });
    expect(d.claims.has(`r:${TOKEN}:2`)).toBe(false);
    expect(d.refunds).toEqual([]);
  });

  test('a failed render is given back only on Google’s terminal word; until then it is still rendering', async () => {
    let verdict: 'failed' | 'unknown' = 'unknown';
    const d = fake({ pollTask: async () => ({ status: 'failed', url: null }), veoVerdict: async () => verdict });
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect((await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).body.redo).toMatchObject({ status: 'rendering' });
    expect(d.refunds).toEqual([]);
    verdict = 'failed';
    expect((await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).body.redo).toMatchObject({ status: 'failed', refunded: true, error: 'render_failed' });
    expect(d.refunds).toEqual([['user-1', `filmredo:${TOKEN}:2:1`]]);
    // A later poll gives nothing back twice.
    await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(d.refunds).toHaveLength(1);
  });

  test('a render on another engine is failed by the provider’s own terminal word', async () => {
    const d = fake({ pollTask: async () => ({ status: 'failed', url: null }), veoVerdict: async () => null });
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect((await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).body.redo).toMatchObject({ status: 'failed', refunded: true });
  });

  test('a render with no answer after the deadline is given up on and paid back', async () => {
    const d = fake();
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    d.clock.t += REDO_RENDER_DEADLINE_MS - 1;
    expect((await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).body.redo).toMatchObject({ status: 'rendering' });
    d.clock.t += 2;
    expect((await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).body.redo).toMatchObject({ status: 'failed', error: 'render_timed_out', refunded: true });
    expect(d.claims.size).toBe(0);
  });

  test('only the owner can follow a redo', async () => {
    const d = fake();
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect((await pollSceneRedo('user-2', { tokenId: TOKEN, ordinal: 2 }, d)).status).toBe(404);
  });

  test('a stitch that died with its function hands the clip back to be cut again', async () => {
    const d = fake();
    d.jobs.set(`${TOKEN}:2`, {
      v: 1, tokenId: TOKEN, uid: 'user-1', ordinal: 2, attempt: 1, ref: 'r', credits: 25, status: 'stitching', taskRef: 'task-1',
      sessionId: 's1', clipUrl: 'https://clips.example/2-new.mp4', masterUrl: null, refunded: false, error: null, startedAt: 1, updatedAt: d.clock.t,
    });
    d.clock.t += REDO_STITCH_STALE_MS;
    expect((await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).body.redo).toMatchObject({ status: 'ready', error: 'stitch_interrupted' });
  });
});

describe('stitch', () => {
  async function readyRedo(d: Fake, ordinal = 2): Promise<void> {
    d.pollTask = async () => ({ status: 'succeeded', url: `https://clips.example/${ordinal}-new.mp4` });
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal }, d);
    await pollSceneRedo('user-1', { tokenId: TOKEN, ordinal }, d);
  }

  test('cuts the new clip into the film’s last stitch with its music, and the film then has the new master', async () => {
    const d = fake();
    await readyRedo(d);
    const out = await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(out.status).toBe(200);
    expect(out.body.redo).toMatchObject({ status: 'done', masterUrl: 'https://store.example/master-2.mp4' });
    expect(d.stitches[0]).toMatchObject({
      filmTokenId: TOKEN, musicUrl: 'https://store.example/score.mp3', voiceoverUrl: 'https://store.example/vo.mp3', orientation: 'vertical',
      segments: [
        { url: 'https://clips.example/1.mp4', durationSec: 8, ordinal: 1 },
        { url: 'https://clips.example/2-new.mp4', durationSec: 8, ordinal: 2 },
        { url: 'https://clips.example/3.mp4', durationSec: 8, ordinal: 3 },
      ],
    });
    // The scene's price covered the stitch: nothing more is charged.
    expect(d.charges).toHaveLength(1);
    expect(d.claims.has(`s:${TOKEN}`)).toBe(false);
  });

  test('a redo cut hours after the film: every link the stitch names is renewed first (the narration’s expire in 2 h)', async () => {
    // Live E2E 2026-10-17: film B was cut at 17:49Z and redone at 19:48Z; its narration link had expired, so the
    // assembler refused the stitch with media_not_yours (502 stitch_failed) and no later try could succeed.
    const renewed: string[] = [];
    const d = fake({ renewLink: async (u) => { renewed.push(u); return `${u}?token=fresh`; } }, {
      record: stitchRecord({
        body: {
          voiceoverUrl: 'https://store.example/vo.mp3', sfxUrl: 'https://store.example/sfx.mp3', orientation: 'vertical',
          dialogueStems: [{ speaker: 'A', url: 'https://store.example/a.mp3' }],
        },
      }),
    });
    await readyRedo(d);
    expect((await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).status).toBe(200);
    expect(d.stitches[0]).toMatchObject({
      musicUrl: 'https://store.example/score.mp3?token=fresh',
      voiceoverUrl: 'https://store.example/vo.mp3?token=fresh',
      sfxUrl: 'https://store.example/sfx.mp3?token=fresh',
      dialogueStems: [{ speaker: 'A', url: 'https://store.example/a.mp3?token=fresh' }],
      orientation: 'vertical',
      segments: [
        { url: 'https://clips.example/1.mp4?token=fresh', durationSec: 8, ordinal: 1 },
        { url: 'https://clips.example/2-new.mp4?token=fresh', durationSec: 8, ordinal: 2 },
        { url: 'https://clips.example/3.mp4?token=fresh', durationSec: 8, ordinal: 3 },
      ],
    });
    expect(renewed).toHaveLength(7);
  });

  test('a link that cannot be renewed is handed over as it was (the assembler decides), and the cut still runs', async () => {
    const d = fake({ renewLink: async (u) => { if (u.includes('vo.mp3')) throw new Error('storage down'); return u.includes('score') ? '' : u; } });
    await readyRedo(d);
    expect((await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).status).toBe(200);
    expect(d.stitches[0]).toMatchObject({ voiceoverUrl: 'https://store.example/vo.mp3', musicUrl: 'https://store.example/score.mp3' });
  });

  test('a scene Google had failed goes back into its gap', async () => {
    const d = fake({}, { record: stitchRecord({ segments: [1, 3].map((o) => ({ url: `https://clips.example/${o}.mp4`, durationSec: 8, ordinal: o })) }) });
    await readyRedo(d);
    await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect((d.stitches[0]!.segments as Array<{ ordinal: number }>).map((s) => s.ordinal)).toEqual([1, 2, 3]);
  });

  test('a stitch that fails keeps the new clip for another try and gives nothing back (the scene was rendered)', async () => {
    const d = fake({ stitch: async () => ({ status: 500, url: null, error: 'assemble_failed' }) });
    await readyRedo(d);
    const out = await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(out.status).toBe(502);
    expect(out.body.redo).toMatchObject({ status: 'ready', clipUrl: 'https://clips.example/2-new.mp4', error: 'assemble_failed' });
    expect(d.refunds).toEqual([]);
    expect(d.claims.has(`s:${TOKEN}`)).toBe(false);
  });

  test('nothing to cut yet, a film cut before scenes were numbered, or a stitch already running: refused, nothing stitched', async () => {
    const none = fake({}, { record: null });
    await readyRedo(none);
    expect((await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, none)).body.error).toBe('no_stitch_record');
    const old = fake({}, { record: stitchRecord({ segments: [{ url: 'https://clips.example/1.mp4' }, { url: 'https://clips.example/2.mp4' }] }) });
    await readyRedo(old);
    expect((await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, old)).body.error).toBe('stitch_unordered');
    const busy = fake();
    await readyRedo(busy);
    busy.claims.add(`s:${TOKEN}`);
    expect((await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, busy)).body.error).toBe('film_stitching');
    expect([...none.stitches, ...old.stitches, ...busy.stitches]).toEqual([]);
  });

  test('a redo still rendering, or another account’s, cannot be stitched', async () => {
    const d = fake();
    await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect((await stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d)).body.error).toBe('redo_not_ready');
    expect((await stitchSceneRedo('user-2', { tokenId: TOKEN, ordinal: 2 }, d)).status).toBe(404);
    expect(d.stitches).toEqual([]);
  });

  test('a new redo of a scene waits while the film is being cut with it', async () => {
    const d = fake({ stitch: async () => new Promise(() => undefined) });
    await readyRedo(d);
    void stitchSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    await new Promise((r) => setImmediate(r));
    const out = await startSceneRedo('user-1', { tokenId: TOKEN, ordinal: 2 }, d);
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('film_stitching');
    expect(d.charges).toHaveLength(1);
  });
});
