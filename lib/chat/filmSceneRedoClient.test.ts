/** @jest-environment node */
/**
 * The studio's half of a scene redo: which words ask for one scene to be shot again, what Agent G says before and after,
 * and the run (start → follow → cut) against a fake server.
 */
import {
  kaScene, namedScenes, quoteSceneRedo, runSceneRedo, sceneRedoAsk, sceneRedoOfferText, sceneRedoResultText, weakScenesText, REDO_CLIENT_DEADLINE_MS,
  type SceneRedoDeps,
} from './filmSceneRedoClient';

describe('which scene the words name', () => {
  test.each([
    ['შეცვალე მე-2 სცენა, პური უფრო ახალი იყოს', [2]],
    ['სცენა 3 თავიდან გადაიღე', [3]],
    ['2-ე სცენა გადააკეთე', [2]],
    ['შეცვალე 1-ლი სცენა', [1]],
    ['მეორე სცენაში სინათლე უფრო თბილი იყოს, შეცვალე', [2]],
    ['redo scene 4 with a warmer light', [4]],
    ['change the second scene', [2]],
    ['переделай сцену 2', [2]],
    ['scene 1 and scene 3 should change', [1, 3]],
    ['make the film better', []],
  ])('%s', (text, want) => {
    expect(namedScenes(text)).toEqual(want);
  });
});

describe('a redo of one scene', () => {
  test('one scene of the film, asked to change: the words are the note', () => {
    expect(sceneRedoAsk('შეცვალე მე-2 სცენა, პური უფრო ახალი იყოს', 4)).toEqual({ ordinal: 2, note: 'შეცვალე მე-2 სცენა, პური უფრო ახალი იყოს' });
    expect(sceneRedoAsk('redo scene 3', 3)).toEqual({ ordinal: 3, note: 'redo scene 3' });
  });

  test('not a redo: two scenes, a scene the film does not have, no change asked, or no film', () => {
    expect(sceneRedoAsk('change scene 1 and scene 2', 3)).toBeNull();
    expect(sceneRedoAsk('change scene 5', 3)).toBeNull();
    expect(sceneRedoAsk('რა ხდება მე-2 სცენაში?', 3)).toBeNull();
    expect(sceneRedoAsk('change scene 2', 0)).toBeNull();
    expect(sceneRedoAsk('', 3)).toBeNull();
  });
});

describe('what Agent G says', () => {
  test('the question names the scene and its price, and that a failed render is paid back', () => {
    const ka = sceneRedoOfferText(2, 25, 'ka');
    expect(ka).toContain('მე-2 სცენას');
    expect(ka).toContain('25 კრედიტი');
    expect(ka).toContain('დაგიბრუნდება');
    expect(sceneRedoOfferText(2, 25, 'en')).toContain('25 credits');
    expect(sceneRedoOfferText(2, 25, 'ru')).toContain('25 кредитов');
    expect(sceneRedoOfferText(2, 0, 'en')).not.toMatch(/credit/);
  });

  test('the result says what happened, and what came back', () => {
    expect(sceneRedoResultText({ kind: 'done', masterUrl: 'm', clipUrl: 'c' }, 2, 'ka')).toContain('შეიცვალა');
    expect(sceneRedoResultText({ kind: 'failed', refunded: true, credits: 25, error: 'render_failed' }, 2, 'ka')).toContain('25 კრედიტი დაგიბრუნდა');
    expect(sceneRedoResultText({ kind: 'failed', refunded: false, credits: 0, error: 'x' }, 2, 'en')).not.toMatch(/came back/);
    expect(sceneRedoResultText({ kind: 'refused', status: 402, error: 'insufficient_credits', price: 25 }, 2, 'en')).toContain('25 credits');
    expect(sceneRedoResultText({ kind: 'refused', status: 429, error: 'budget_exhausted', message: 'ლიმიტი' }, 2, 'ka')).toBe('⚠️ ლიმიტი');
    expect(sceneRedoResultText({ kind: 'clip_only', clipUrl: 'c' }, 2, 'ru')).toContain('Новая сцена 2');
  });
});

function server(script: Array<{ match: RegExp; method?: string; status: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let t = 0;
  const deps: SceneRedoDeps = {
    fetch: async (url, init) => {
      calls.push({ url, ...(init ? { init } : {}) });
      const i = script.findIndex((s) => s.match.test(url) && (!s.method || s.method === (init?.method ?? 'GET')));
      if (i < 0) throw new Error(`unexpected ${url}`);
      const step = script[i]!;
      if (script.filter((s) => s.match.test(url) && (!s.method || s.method === (init?.method ?? 'GET'))).length > 1) script.splice(i, 1);
      return new Response(JSON.stringify(step.body), { status: step.status });
    },
    sleep: async (ms) => { t += ms; },
    now: () => t,
  };
  return { deps, calls };
}

describe('the run', () => {
  test('start → render lands → cut: the film’s new master, with the price the user agreed to', async () => {
    const { deps, calls } = server([
      { match: /\/redo$/, method: 'POST', status: 202, body: { price: 25, redo: { status: 'rendering' } } },
      { match: /\/redo\?/, status: 200, body: { redo: { status: 'rendering' } } },
      { match: /\/redo\?/, status: 200, body: { redo: { status: 'ready', clipUrl: 'https://clips.example/2.mp4' } } },
      { match: /\/redo\/stitch$/, method: 'POST', status: 200, body: { redo: { status: 'done', masterUrl: 'https://store.example/m.mp4' } } },
    ]);
    const phases: string[] = [];
    const out = await runSceneRedo({ tokenId: 'f0123456789abcdef', ordinal: 2, note: 'warmer', expectedPrice: 25, onPhase: (p) => phases.push(p) }, deps);
    expect(out).toEqual({ kind: 'done', masterUrl: 'https://store.example/m.mp4', clipUrl: 'https://clips.example/2.mp4' });
    expect(phases).toEqual(['rendering', 'cutting']);
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ filmTokenId: 'f0123456789abcdef', ordinal: 2, note: 'warmer', expectedPrice: 25 });
  });

  test('a refusal is handed back as it came, before anything runs', async () => {
    const { deps, calls } = server([{ match: /\/redo$/, method: 'POST', status: 402, body: { error: 'insufficient_credits', price: 25 } }]);
    expect(await runSceneRedo({ tokenId: 't', ordinal: 2, note: null, expectedPrice: 25 }, deps)).toEqual({ kind: 'refused', status: 402, error: 'insufficient_credits', price: 25 });
    expect(calls).toHaveLength(1);
  });

  test('a render Google failed ends the run with what came back; a poll that misses is asked again', async () => {
    const { deps } = server([
      { match: /\/redo$/, method: 'POST', status: 202, body: { redo: { status: 'rendering' } } },
      { match: /\/redo\?/, status: 429, body: {} },
      { match: /\/redo\?/, status: 200, body: { redo: { status: 'failed', refunded: true, credits: 25, error: 'render_failed' } } },
    ]);
    expect(await runSceneRedo({ tokenId: 't', ordinal: 2, note: null, expectedPrice: 25 }, deps)).toEqual({ kind: 'failed', refunded: true, credits: 25, error: 'render_failed' });
  });

  test('a cut that fails still hands over the new scene', async () => {
    const { deps } = server([
      { match: /\/redo$/, method: 'POST', status: 202, body: { redo: { status: 'ready', clipUrl: 'https://clips.example/2.mp4' } } },
      { match: /\/redo\/stitch$/, method: 'POST', status: 502, body: { error: 'stitch_failed', redo: { status: 'ready' } } },
    ]);
    expect(await runSceneRedo({ tokenId: 't', ordinal: 2, note: null, expectedPrice: 25 }, deps)).toEqual({ kind: 'clip_only', clipUrl: 'https://clips.example/2.mp4' });
  });

  test('a render that never answers is given up on after the client deadline', async () => {
    const { deps } = server([
      { match: /\/redo$/, method: 'POST', status: 202, body: { redo: { status: 'rendering' } } },
      { match: /\/redo\?/, status: 200, body: { redo: { status: 'rendering' } } },
    ]);
    const out = await runSceneRedo({ tokenId: 't', ordinal: 2, note: null, expectedPrice: 25 }, deps);
    expect(out).toEqual({ kind: 'failed', refunded: false, credits: 0, error: 'render_timed_out' });
    expect(deps.now()).toBeGreaterThan(REDO_CLIENT_DEADLINE_MS);
  });

  test('the quote: the price, or nothing when the film cannot be redone scene by scene', async () => {
    expect(await quoteSceneRedo('t', 2, server([{ match: /quote=1/, status: 200, body: { price: 25, scenes: 3 } }]).deps)).toEqual({ price: 25, scenes: 3 });
    expect(await quoteSceneRedo('t', 2, server([{ match: /quote=1/, status: 404, body: { error: 'film_not_found' } }]).deps)).toBeNull();
  });
});

describe('Georgian writes scene 1 as „1-ლი", never „მე-1"', () => {
  test('kaScene', () => {
    expect(kaScene(1)).toBe('1-ლი');
    expect(kaScene(2)).toBe('მე-2');
    expect(kaScene(12)).toBe('მე-12');
  });
  test('the copy uses it, and the words it suggests parse back to the same scene', () => {
    expect(sceneRedoOfferText(1, 25, 'ka')).toMatch(/^1-ლი სცენას/);
    expect(sceneRedoOfferText(1, 25, 'ka')).not.toMatch(/მე-1/);
    expect(sceneRedoAsk('შეცვალე 1-ლი სცენა', 3)).toEqual({ ordinal: 1, note: 'შეცვალე 1-ლი სცენა' });
  });
});

describe('what the per-scene vision check found is said under the film (audit item 3b)', () => {
  test('clean grades say nothing', () => {
    expect(weakScenesText([{ ordinal: 1, grade: 'A' }, { ordinal: 2, grade: 'B' }], true, 'ka')).toBe('');
    expect(weakScenesText(undefined, true, 'ka')).toBe('');
  });

  test('a flawed and a weak scene are named, and the command for the flawed one is offered', () => {
    const t = weakScenesText([{ ordinal: 3, grade: 'C' }, { ordinal: 2, grade: 'F' }, { ordinal: 1, grade: 'A' }], true, 'ka');
    expect(t).toContain('მე-2 სცენაში სერიოზული ხარვეზი');
    expect(t).toContain('მე-3 სცენა სუსტად გამოვიდა');
    expect(t).toContain('„შეცვალე მე-2 სცენა“');
    // The suggested words really start a redo of that scene.
    const said = /„([^“]+)“/.exec(t)![1]!;
    expect(sceneRedoAsk(said, 3)?.ordinal).toBe(2);
  });

  test('several scenes are listed in order; English and Russian too', () => {
    expect(weakScenesText([{ ordinal: 4, grade: 'C' }, { ordinal: 1, grade: 'C' }], false, 'ka')).toBe('ℹ️ 1-ლი და მე-4 სცენა სუსტად გამოვიდა.');
    expect(weakScenesText([{ ordinal: 2, grade: 'F' }], true, 'en')).toBe('⚠️ The visual check found a real flaw in scene 2.\nIf you like, write “change scene 2” and I\'ll shoot only that scene again at the scene\'s price.');
    expect(weakScenesText([{ ordinal: 2, grade: 'F' }], false, 'ru')).toBe('⚠️ Визуальная проверка нашла серьёзный дефект в сцене 2.');
  });

  test('a film that can no longer be changed by scene gets no command', () => {
    expect(weakScenesText([{ ordinal: 2, grade: 'F' }], false, 'ka')).not.toContain('შეცვალე');
  });
});
