/** @jest-environment node */
/**
 * A scene redo (owner's audit 2026-10-17, item 3; price: the owner's tap 14:26:55Z, "სცენის ფასი"). These tests pin the
 * rules: one scene is charged its own price once per attempt, rendered again from its own storyboard frame with a new seed,
 * given back when Google fails it, and cut back into the film with the film's own music and choices, free of a second charge.
 */
jest.mock('server-only', () => ({}));

import {
  cleanRedoNote, keptStitchBody, publicRedo, redoChargeRef, redoClipRequest, redoSeed, restitchBody, restitchSegments,
  REDO_NOTE_MAX, type FilmBookScene, type FilmRedoJob, type FilmStitchRecord,
} from './filmSceneRedo';
import {
  __setFilmSceneBookRedisForTests, claimFilmRestitch, claimSceneRender, filmSceneBookReady, getFilmRedoJob, getFilmSceneBook,
  getFilmStitchRecord, nextRedoAttempt, releaseFilmRestitch, releaseSceneRender, saveFilmRedoJob, saveFilmSceneBook,
  saveFilmStitchRecord,
} from './filmSceneBook';
import { sceneCredits } from '@/lib/credits/priceBook';
import { pickLutLook } from '@/lib/orchestrator/cinematic-lut';

const scene = (over: Partial<FilmBookScene> = {}): FilmBookScene => ({
  ordinal: 2, seed: 41, userPrompt: 'A woman walks into the bakery.', storyboardFrame: 'https://frames.example/2.png',
  selectedOptions: { veoTier: 'fast', characterReference: 'https://ref.example/face.png', veoEndFrame: 'https://frames.example/3.png' },
  ...over,
});

const record = (over: Partial<FilmStitchRecord> = {}): FilmStitchRecord => ({
  v: 1, tokenId: 'f0123456789abcdef', uid: 'user-1', at: 1, musicUrl: 'https://store.example/score.mp3',
  segments: [1, 2, 3].map((o) => ({ url: `https://clips.example/${o}.mp4`, durationSec: 8, ordinal: o })),
  body: { scorePrompt: 'warm bakery morning', voiceoverUrl: 'https://store.example/vo.mp3', orientation: 'vertical', finalDurationSec: 24, captionLang: 'ka' },
  ...over,
});

describe('the price', () => {
  test('one scene of 8 s on Fast costs 71 credits: its clip and what the film adds to it, without the film base', () => {
    expect(sceneCredits('fast', false, 8)).toBe(71);
  });

  test('every attempt has its own ledger ref, so each is charged once and refunded at most once', () => {
    expect(redoChargeRef('f0123456789abcdef', 2, 1)).toBe('filmredo:f0123456789abcdef:2:1');
    expect(redoChargeRef('f0123456789abcdef', 2, 2)).not.toBe(redoChargeRef('f0123456789abcdef', 2, 1));
  });
});

describe('the scene sent again', () => {
  test('starts from its own storyboard frame, never ends on another, and carries the note', () => {
    const req = redoClipRequest(scene(), 'the bread is fresher and the light is warmer');
    expect(req.selectedOptions.characterReference).toBe('https://frames.example/2.png');
    expect(req.selectedOptions).not.toHaveProperty('veoEndFrame');
    expect(req.selectedOptions.veoTier).toBe('fast');
    expect(req.userPrompt).toBe('A woman walks into the bakery. EDIT FOR THIS SCENE: the bread is fresher and the light is warmer.');
  });

  test('a scene with no storyboard frame keeps the reference the start gave it; no note leaves the prompt as it was', () => {
    const req = redoClipRequest(scene({ storyboardFrame: null }), null);
    expect(req.selectedOptions.characterReference).toBe('https://ref.example/face.png');
    expect(req.userPrompt).toBe('A woman walks into the bakery.');
  });

  test('every attempt gets a new seed (the same seed would ask Veo for the clip being replaced), inside 32 bits', () => {
    const seeds = [1, 2, 3].map((a) => redoSeed(41, a));
    expect(new Set([41, ...seeds]).size).toBe(4);
    expect(redoSeed(4_294_967_000, 9)).toBeLessThan(4_294_967_295);
    expect(redoSeed(Number.NaN, 1)).toBeGreaterThanOrEqual(0);
  });

  test('the note is one clean bounded line; an empty one is none', () => {
    expect(cleanRedoNote('  warmer\nlight\u0007 please ')).toBe('warmer light please');
    expect(cleanRedoNote('x'.repeat(REDO_NOTE_MAX + 50))).toHaveLength(REDO_NOTE_MAX);
    expect(cleanRedoNote('   ')).toBeNull();
    expect(cleanRedoNote(42)).toBeNull();
  });
});

describe('cutting the new clip into the film', () => {
  test('replaces that scene in place and keeps every other clip', () => {
    const cut = restitchSegments(record().segments, 2, 'https://clips.example/2-redo.mp4', 8);
    expect(cut?.inserted).toBe(false);
    expect(cut?.segments.map((s) => s.url)).toEqual(['https://clips.example/1.mp4', 'https://clips.example/2-redo.mp4', 'https://clips.example/3.mp4']);
  });

  test('puts a scene Google had failed back into its gap, in scene order', () => {
    const segments = record().segments.filter((s) => s.ordinal !== 2);
    const cut = restitchSegments(segments, 2, 'https://clips.example/2-redo.mp4', 8);
    expect(cut?.inserted).toBe(true);
    expect(cut?.segments.map((s) => s.ordinal)).toEqual([1, 2, 3]);
    expect(cut?.segments[1]).toEqual({ url: 'https://clips.example/2-redo.mp4', durationSec: 8, ordinal: 2 });
  });

  test('a stitch from before scenes were numbered cannot take one scene back', () => {
    expect(restitchSegments([{ url: 'https://clips.example/a.mp4' }, { url: 'https://clips.example/b.mp4', ordinal: 2 }], 2, 'x', 8)).toBeNull();
    expect(restitchSegments([], 1, 'x', 8)).toBeNull();
  });

  test('the new stitch reuses the film’s music (never composed again), its narration and choices, and its token', () => {
    const rec = record();
    const cut = restitchSegments(rec.segments, 2, 'https://clips.example/2-redo.mp4', 8)!;
    const body = restitchBody(rec, cut.segments, cut.inserted);
    expect(body).toMatchObject({
      musicUrl: 'https://store.example/score.mp3', voiceoverUrl: 'https://store.example/vo.mp3', orientation: 'vertical',
      captionLang: 'ka', finalDurationSec: 24, filmTokenId: 'f0123456789abcdef', segments: cut.segments,
    });
  });

  test('the new stitch keeps the film’s brief, so the scenes the user kept keep their grade (live E2E: the night LUT was lost)', () => {
    const rec = record({ body: { ...record().body, scorePrompt: 'შექმენი 9:16 სარეკლამო ვიდეო. პირველი: ღამის თბილისი ზემოდან.' } });
    const cut = restitchSegments(rec.segments, 2, 'https://clips.example/2-redo.mp4', 8)!;
    const body = restitchBody(rec, cut.segments, cut.inserted);
    expect(body.scorePrompt).toBe(rec.body.scorePrompt);
    // The look the assembler picks from that brief is the original film's, not the default.
    expect(pickLutLook(body.scorePrompt as string)).toBe('night_neon');
    expect(pickLutLook(undefined)).toBe('cinematic');
    // And the music it carries is the recorded one: the assembler takes `musicUrl` before it would compose from the brief.
    expect(body.musicUrl).toBe('https://store.example/score.mp3');
    // The redo body is the delivered one with only the scenes changed (no key lost, none added).
    const { segments: _a, filmTokenId: _b, ...again } = body;
    expect(again).toEqual({ ...rec.body, musicUrl: rec.musicUrl });
  });

  test('a film that gained a scene drops the final length it was cut to; a film with no music keeps its score brief', () => {
    const rec = record({ musicUrl: null });
    const cut = restitchSegments(rec.segments.filter((s) => s.ordinal !== 3), 3, 'https://clips.example/3-redo.mp4', 8)!;
    const body = restitchBody(rec, cut.segments, cut.inserted);
    expect(body).not.toHaveProperty('finalDurationSec');
    expect(body).not.toHaveProperty('musicUrl');
    expect(body.scorePrompt).toBe('warm bakery morning');
  });

  test('a delivered stitch keeps only the choices a redo needs, and no caption timings when subtitles are re-read', () => {
    const kept = keptStitchBody({
      segments: [{ url: 'x' }], filmTokenId: 't', voiceoverUrl: 'v', subtitles: true, captionAlignment: { words: [] },
      billingToken: 'b', unknownKey: 1, noMusic: null, orientation: 'vertical',
    });
    expect(kept).toEqual({ voiceoverUrl: 'v', subtitles: true, orientation: 'vertical' });
    expect(keptStitchBody({ captionAlignment: { a: 'x'.repeat(500_000) } })).toEqual({});
  });
});

test('the owner sees a redo’s state, never its task or ledger ref', () => {
  const job: FilmRedoJob = {
    v: 1, tokenId: 't', uid: 'user-1', ordinal: 2, attempt: 1, ref: 'filmredo:t:2:1', credits: 25, status: 'ready',
    taskRef: 'secret-task', sessionId: 's1', clipUrl: 'https://clips.example/2.mp4', masterUrl: null, refunded: false,
    error: null, startedAt: 1, updatedAt: 2,
  };
  const shown = publicRedo(job);
  expect(shown).not.toHaveProperty('taskRef');
  expect(shown).not.toHaveProperty('ref');
  expect(shown).not.toHaveProperty('uid');
  expect(shown).toMatchObject({ ordinal: 2, status: 'ready', credits: 25, clipUrl: 'https://clips.example/2.mp4' });
});

describe('the store', () => {
  beforeEach(() => {
    __setFilmSceneBookRedisForTests(null);
    process.env.FILM_CHAIN_MEMORY = '1';
  });
  afterEach(() => { delete process.env.FILM_CHAIN_MEMORY; });

  const book = {
    v: 1 as const, tokenId: 'f0123456789abcdef', uid: 'user-1', sessionId: 's1', locale: 'ka', compositeId: 'film:s1:1',
    videoModel: null, forecast: { wholesaleGel: 1, retailGel: 2 }, scenePrice: 25, scenes: [scene()], createdAt: 1,
  };

  test('with no Redis and no memory switch a redo is not offered at all', async () => {
    delete process.env.FILM_CHAIN_MEMORY;
    expect(filmSceneBookReady()).toBe(false);
    expect(await saveFilmSceneBook(book)).toBe(false);
    expect(await nextRedoAttempt('t', 1)).toBeNull();
    expect(await claimSceneRender('t', 1)).toBe(false);
  });

  test('every record is its owner’s: another account reads nothing', async () => {
    expect(await saveFilmSceneBook(book)).toBe(true);
    expect(await saveFilmStitchRecord(record())).toBe(true);
    const job: FilmRedoJob = {
      v: 1, tokenId: book.tokenId, uid: 'user-1', ordinal: 2, attempt: 1, ref: 'r', credits: 25, status: 'rendering', taskRef: 'k',
      sessionId: 's1', clipUrl: null, masterUrl: null, refunded: false, error: null, startedAt: 1, updatedAt: 1,
    };
    expect(await saveFilmRedoJob(job)).toBe(true);
    expect((await getFilmSceneBook(book.tokenId, 'user-1'))?.scenePrice).toBe(25);
    expect(await getFilmSceneBook(book.tokenId, 'user-2')).toBeNull();
    expect(await getFilmStitchRecord(book.tokenId, 'user-2')).toBeNull();
    expect(await getFilmRedoJob(book.tokenId, 2, 'user-2')).toBeNull();
    expect((await getFilmRedoJob(book.tokenId, 2, 'user-1'))?.status).toBe('rendering');
    expect(await getFilmRedoJob(book.tokenId, 3, 'user-1')).toBeNull();
  });

  test('one render of a scene and one stitch of a film at a time; attempts count up', async () => {
    expect(await claimSceneRender('t', 2)).toBe(true);
    expect(await claimSceneRender('t', 2)).toBe(false);
    expect(await claimSceneRender('t', 3)).toBe(true);
    await releaseSceneRender('t', 2);
    expect(await claimSceneRender('t', 2)).toBe(true);
    expect(await claimFilmRestitch('t')).toBe(true);
    expect(await claimFilmRestitch('t')).toBe(false);
    await releaseFilmRestitch('t');
    expect(await claimFilmRestitch('t')).toBe(true);
    expect([await nextRedoAttempt('t', 2), await nextRedoAttempt('t', 2), await nextRedoAttempt('t', 3)]).toEqual([1, 2, 1]);
  });

  test('on Redis: records live a day, claims are SET NX, attempts are INCR', async () => {
    const store = new Map<string, string>();
    const set = jest.fn(async (k: string, v: string, o?: { nx?: boolean }) => {
      if (o?.nx && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    });
    const incr = jest.fn(async (k: string) => { const n = Number(store.get(k) ?? 0) + 1; store.set(k, String(n)); return n; });
    __setFilmSceneBookRedisForTests({
      set, incr, get: async (k: string) => store.get(k) ?? null, del: async (k: string) => { store.delete(k); return 1; },
      expire: async () => 1,
    } as unknown as Parameters<typeof __setFilmSceneBookRedisForTests>[0]);
    expect(await saveFilmSceneBook(book)).toBe(true);
    expect(set).toHaveBeenCalledWith('film:scenes:f0123456789abcdef', expect.any(String), { ex: 86_400 });
    expect(await claimSceneRender(book.tokenId, 2)).toBe(true);
    expect(set).toHaveBeenCalledWith('film:redo:f0123456789abcdef:2:busy', expect.any(String), { nx: true, ex: 1800 });
    expect(await claimSceneRender(book.tokenId, 2)).toBe(false);
    expect(await nextRedoAttempt(book.tokenId, 2)).toBe(1);
    expect(await nextRedoAttempt(book.tokenId, 2)).toBe(2);
  });

  test('a Redis that does not answer holds nothing and counts nothing', async () => {
    const boom = async () => { throw new Error('down'); };
    __setFilmSceneBookRedisForTests({ set: boom, get: boom, incr: boom, del: boom, expire: boom } as unknown as Parameters<typeof __setFilmSceneBookRedisForTests>[0]);
    expect(await saveFilmSceneBook(book)).toBe(false);
    expect(await getFilmSceneBook(book.tokenId, 'user-1')).toBeNull();
    expect(await claimSceneRender(book.tokenId, 2)).toBe(false);
    expect(await nextRedoAttempt(book.tokenId, 2)).toBeNull();
  });
});
