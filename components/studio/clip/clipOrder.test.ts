/**
 * components/studio/clip/clipOrder — the chat's one-clip card, as data (GG 2026-10-25 16:10Z: „like Gemini's Veo").
 * Pinned: the words are kept as typed; the length is the clip's grid (8 s by default, two or three photos force 8 s); the
 * price is lib/video/directClip's (the route's own) and moves with every chip; the request carries the price shown; a
 * length is read from the words only when it is one of the grid's; every line is said in the UI language.
 */
import { directClipCredits } from '@/lib/video/directClip';
import {
  changeClip, clipAspectFor, clipEngineLabel, clipFailureText, clipLengthsFor, clipOrder, clipPhotoNote, clipRequestBody,
  clipSecondsFromWords, clipSpecLine, clipTooLongText, openClipTier,
} from './clipOrder';

const PHOTO = 'data:image/jpeg;base64,AAAA';
const base = { prompt: '  ბიჭი  ამბობს: „გამარჯობა"  ', photos: [] as string[], seconds: undefined, aspect: '9:16' as const, tier: 'fast' as const };

describe('clipOrder', () => {
  test('keeps the words exactly as typed and starts at 8 s, Veo 3.1 Fast, priced by the route\'s own function', () => {
    const o = clipOrder(base);
    expect(o.prompt).toBe(base.prompt);
    expect(o).toMatchObject({ seconds: 8, aspect: '9:16', tier: 'fast', resolution: '720p', phase: 'ask' });
    expect(o.credits).toBe(directClipCredits({ seconds: 8, tier: 'fast', photos: 0 }));
    expect(o.credits).toBe(75);
  });

  test('a length off the grid is snapped (never a longer run): 24 → 8, 5 → 6, 3 → 4, junk → 8', () => {
    expect(clipOrder({ ...base, seconds: 24 }).seconds).toBe(8);
    expect(clipOrder({ ...base, seconds: 5 }).seconds).toBe(6);
    expect(clipOrder({ ...base, seconds: 3 }).seconds).toBe(4);
    expect(clipOrder({ ...base, seconds: 'x' }).seconds).toBe(8);
    expect(clipOrder({ ...base, seconds: 10 }).seconds).toBe(10);
  });

  test('two or three photos are references: 8 s only, Lite goes to Fast; a fourth photo is dropped', () => {
    const o = clipOrder({ ...base, seconds: 10, tier: 'lite', photos: [PHOTO, PHOTO, PHOTO, PHOTO] });
    expect(o.photos).toHaveLength(3);
    expect(o.seconds).toBe(8);
    expect(o.tier).toBe('fast');
    expect(o.credits).toBe(directClipCredits({ seconds: 8, tier: 'fast', photos: 3 }));
    expect(clipLengthsFor(2)).toEqual([8]);
    expect(clipLengthsFor(1)).toEqual([4, 6, 8, 10]);
  });

  test('10 s is Gemini Omni Flash, priced by resolution as GG approved (720p ✦69 · 1080p ✦102)', () => {
    const o = clipOrder({ ...base, seconds: 10 });
    expect(o.credits).toBe(69);
    expect(clipEngineLabel(o)).toBe('Gemini Omni Flash');
    const hd = changeClip(o, { resolution: '1080p' });
    expect(hd.credits).toBe(102);
    expect(clipSpecLine(hd, 'en')).toBe('10 s · 9:16 · 1080p · 1080×1920 · Gemini Omni Flash');
  });
});

describe('changeClip', () => {
  test('one chip changes one thing and the price follows; the phase is kept', () => {
    const o = clipOrder(base);
    const four = changeClip(o, { seconds: 4 });
    expect(four).toMatchObject({ seconds: 4, aspect: '9:16', phase: 'ask' });
    expect(four.credits).toBe(directClipCredits({ seconds: 4, tier: 'fast', photos: 0 }));
    const wide = changeClip(four, { aspect: '16:9' });
    expect(wide).toMatchObject({ seconds: 4, aspect: '16:9' });
    expect(clipSpecLine(wide, 'ka')).toBe('4 წმ · 16:9 · 720p · 1280×720 · Veo 3.1 Fast');
    // The 10 s resolution is kept while another length is picked, so going back restores it.
    const back = changeClip(changeClip(changeClip(o, { seconds: 10 }), { resolution: '1080p' }), { seconds: 8 });
    expect(back.resolution).toBe('1080p');
    expect(changeClip(back, { seconds: 10 }).credits).toBe(102);
  });
});

describe('clipRequestBody', () => {
  test('carries the price on the card, so the route can refuse a price that changed', () => {
    const o = clipOrder({ ...base, photos: [PHOTO] });
    expect(clipRequestBody(o)).toEqual({
      prompt: base.prompt, photos: [PHOTO], seconds: 8, aspect: '9:16', tier: 'fast', resolution: '720p', expectedCredits: o.credits,
    });
  });
});

describe('the words', () => {
  test.each([
    ['10 წამიანი ვიდეო ზღვაზე', 10],
    ['6 წმ კლიპი', 6],
    ['a 4 second clip of a cat', 4],
    ['make it 8s, please', 8],
    ['видео на 10 сек', 10],
    ['клип 8 с про море', 8],
    ['10-წამიანი', 10],
  ])('„%s" names %i s', (text, sec) => {
    expect(clipSecondsFromWords(text)).toBe(sec);
  });
  test.each(['24 წამი', '1 წუთი', '14 წამი', '16 seconds', 'top 10 songs', 'for 4 seasons', 'ზღვა მზის ჩასვლისას', '2.4 s'])('„%s" names no length', (text) => {
    expect(clipSecondsFromWords(text)).toBeNull();
  });
  test('only the clip\'s two frames are named', () => {
    expect(clipAspectFor('16:9')).toBe('16:9');
    expect(clipAspectFor('9:16')).toBe('9:16');
    expect(clipAspectFor('1:1')).toBeUndefined();
    expect(clipAspectFor(null)).toBeUndefined();
  });
  test('lines are said in the UI language, Georgian by default', () => {
    expect(clipTooLongText('ka', 2000)).toContain('2000 სიმბოლო');
    expect(clipTooLongText('en', 2000)).toContain('at most 2000 characters');
    expect(clipTooLongText('ru', 2000)).toContain('не больше 2000 символов');
    expect(clipTooLongText('de', 2000)).toBe(clipTooLongText('ka', 2000));
    expect(clipPhotoNote(0, 'en')).toBeNull();
    expect(clipPhotoNote(1, 'en')).toMatch(/first frame/);
    expect(clipPhotoNote(2, 'en')).toMatch(/kept \(8 s\)/);
  });
});

describe('clipFailureText', () => {
  test('the clip\'s own refusals are said with what to do, and that nothing was charged', () => {
    expect(clipFailureText({ error: 'speech_too_long', seconds: 11, maxSeconds: 8 }, 'en')).toBe(
      'The spoken words take ~11 s and do not fit a 8 s clip. Shorten them or pick a longer clip. Nothing was charged.');
    expect(clipFailureText({ error: 'voice_off' }, 'ka')).toContain('თანხა არ ჩამოგეჭრა');
    expect(clipFailureText({ error: 'invalid_request' }, 'ru')).toContain('до 3, JPEG/PNG/WebP');
  });
  test('anything else goes through the shared table, never the raw code', () => {
    const t = clipFailureText({ error: 'some_internal_code' }, 'en');
    expect(t).not.toContain('some_internal_code');
    expect(clipFailureText(null, 'en').length).toBeGreaterThan(0);
  });
});

describe('openClipTier', () => {
  test('a tier this deployment cannot render is never sent: Fast, then Lite, then Veo 3.1, as the photos allow', () => {
    expect(openClipTier('standard', [], 0)).toBe('standard');
    expect(openClipTier('standard', ['standard'], 0)).toBe('fast');
    expect(openClipTier('fast', ['fast'], 0)).toBe('lite');
    expect(openClipTier('fast', ['fast'], 2)).toBe('standard'); // Lite takes no references
    expect(openClipTier('fast', ['lite', 'fast', 'standard'], 0)).toBe('fast'); // nothing open: the route says so, free
  });
  test('a closed tier refused by the route is said with what to do', () => {
    expect(clipFailureText({ error: 'tier_unavailable', tier: 'standard' }, 'en')).toBe('This quality is unavailable right now. Pick another one and try again. Nothing was charged.');
  });
});
