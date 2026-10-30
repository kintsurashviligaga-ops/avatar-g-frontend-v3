/**
 * components/studio/clip/clipOrder — the chat's one-clip card, as data (GG 2026-10-25 16:10Z: „like Gemini's Veo").
 * Pinned: the words are kept as typed; the length is the clip's grid (8 s by default, two or three photos force 8 s); the
 * price is lib/video/directClip's (the route's own) and moves with every chip; the request carries the price shown; a
 * length is read from the words only when it is one of the grid's; every line is said in the UI language.
 */
import { directClipCredits } from '@/lib/video/directClip';
import {
  changeClip, clipAspectFor, clipEngineLabel, clipHold, clipHoldText, clipIsOmni, clipResolutionBlurb, clipTierBlurb, clipFailureText, clipLengthsFor,
  clipOrder, clipPhotoNote, clipRepriced, clipRequestBody, clipSecondsFromWords, clipSpecLine, clipSpeechNote, clipTooLongText, openClipTier,
} from './clipOrder';

const PHOTO = 'data:image/jpeg;base64,AAAA';
/** Nobody speaks: a Veo clip. */
const base = { prompt: '  ბიჭი  ბუშტს  უშვებს  ', photos: [] as string[], seconds: undefined, aspect: '9:16' as const, tier: 'fast' as const };
/** GG's brief, verbatim (2026-10-26 10:31Z): three people, three Georgian lines. */
const GG_BRIEF = '9:16. იგივე პოდკასტი. დასაწყისში 180° გლუვი orbit მრგვალ მაგიდაზე; დრამატული შუქი, სერიოზული ატმოსფერო. კამერა ჩერდება მამაკაცზე — თავდაჯერებული, ოდნავ აღფრთოვანებული, დამაჯერებელი მზერით: „აგენტ ჯი გესმენია? ხმოვანი ბრძანებებით მართავ და ქართულადაც ესაუბრები!“ სწრაფი ჭრა წამყვანზე — ირონიული ღიმილით, ცნობისმოყვარე და ოდნავ გაკვირვებული ტონით: „ანუ ქართულად ვეუბნები, რა გააკეთოს?“ შემდეგ ქალი — თბილი ინტერესით, თვალებში გაოცება და ჩართულობა: „ეს უკვე საინტერესოა!“ ბუნებრივი ჟესტები, ზუსტი lip-sync, ტექსტის გარეშე.';
/** The same, cut to two short lines (as suggested to GG at 10:34Z). */
const SHORT = 'კაცი ამბობს: „აგენტ ჯი, ქართულად გესმის?“ ქალი პასუხობს: „ეს უკვე საინტერესოა!“';

describe('clipOrder', () => {
  test('keeps the words exactly as typed and starts at 8 s, Veo 3.1 Fast, priced by the route\'s own function', () => {
    const o = clipOrder(base);
    expect(o.prompt).toBe(base.prompt);
    expect(o).toMatchObject({ seconds: 8, aspect: '9:16', tier: 'fast', resolution: '720p', speech: null, phase: 'ask' });
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
    // A speaking clip says so, so the route prices it as Omni too.
    expect(clipRequestBody(clipOrder({ ...base, prompt: SHORT }))).toMatchObject({ speech: 'ka', resolution: '1080p' });
  });
});

describe('a clip whose characters speak Georgian (GG 2026-10-26 10:44Z; card 10:55Z)', () => {
  test('is Gemini Omni Flash at every length, 1080p unless 720p is picked, at the price book\'s Omni row', () => {
    const o = clipOrder({ ...base, prompt: SHORT, seconds: 8 });
    expect(o).toMatchObject({ speech: 'ka', seconds: 8, resolution: '1080p', credits: 82 });
    expect(clipIsOmni(o)).toBe(true);
    expect(clipSpecLine(o, 'ka')).toBe('8 წმ · 9:16 · 1080p · 1080×1920 · Gemini Omni Flash');
    expect(clipSpeechNote(o, 'ka')).toContain('თითოეული თავისი ხმით');
    expect([4, 6, 8, 10].map((s) => changeClip(o, { seconds: s as 4 | 6 | 8 | 10 }).credits)).toEqual([42, 62, 82, 102]);
    expect([4, 6, 8, 10].map((s) => changeClip(changeClip(o, { resolution: '720p' }), { seconds: s as 4 | 6 | 8 | 10 }).credits)).toEqual([28, 42, 55, 69]);
    // A pick made on the panel is kept.
    expect(clipOrder({ ...base, prompt: SHORT, resolution: '720p' }).resolution).toBe('720p');
    // Lite is no Veo tier here: it is not moved to Fast, and does not count.
    expect(clipOrder({ ...base, prompt: SHORT, tier: 'lite', photos: [PHOTO] }).credits).toBe(82);
    // A clip nobody speaks in is Veo, as before.
    expect(clipIsOmni(clipOrder(base))).toBe(false);
    expect(clipSpeechNote(clipOrder(base), 'ka')).toBeNull();
  });

  test('GG\'s three lines are said not to fit 8 s or 10 s, before anything is sent; two short lines fit, from 6 s', () => {
    const o = clipOrder({ ...base, prompt: GG_BRIEF, photos: [PHOTO] });
    const hold = clipHold(o);
    expect(hold).toMatchObject({ kind: 'long', max: 8, fitsAt: null });
    expect(clipHoldText(hold!, 'ka')).toMatch(/^ნათქვამი ტექსტი ~11\.\d წამია და 8 წამიან კლიპს არ ეტევა\. შეამოკლე\.$/);
    expect(clipHold(changeClip(o, { seconds: 10 }))).toMatchObject({ kind: 'long', max: 10, fitsAt: null });
    const short = clipOrder({ ...base, prompt: SHORT, photos: [PHOTO] });
    expect(clipHold(short)).toBeNull();
    expect(clipHold(changeClip(short, { seconds: 6 }))).toBeNull();
    const four = clipHold(changeClip(short, { seconds: 4 }));
    expect(four).toMatchObject({ kind: 'long', max: 4, fitsAt: 6 });
    expect(clipHoldText(four!, 'en')).toMatch(/^The spoken words take ~3\.\d s and do not fit a 4 s clip\. Pick 6 s or shorten them\.$/);
    // A long quote in a clip nobody speaks Georgian in (a sign, a title) never holds Create: the route reads it.
    const sign = 'A neon sign over a Tbilisi bakery reads "Fresh bread every morning from six, pastries and coffee all day long, closed Mondays"';
    expect(clipOrder({ ...base, prompt: sign }).speech).toBeNull();
    expect(clipHold(clipOrder({ ...base, prompt: sign, seconds: 4 }))).toBeNull();
  });

  test('takes one photo: two or three are held with the reason, not sent', () => {
    const o = clipOrder({ ...base, prompt: SHORT, photos: [PHOTO, PHOTO] });
    expect(clipHold(o)).toEqual({ kind: 'photos' });
    expect(clipHoldText({ kind: 'photos' }, 'ka')).toBe('ქართულად მოლაპარაკე კლიპი ერთ ფოტოს იღებს, პირველ კადრად. გამომიგზავნე ერთი ფოტოთი.');
    expect(clipFailureText({ error: 'speech_one_photo' }, 'en')).toBe('A clip where someone speaks Georgian takes one photo, as its first frame. Send it with one photo.');
  });

  test('the route\'s reader found a Georgian line the card missed: the same order, as Omni, at the route\'s price', () => {
    const o = clipOrder({ ...base, prompt: 'ბიჭი მიესალმება მეგობრებს' });
    expect(o.speech).toBeNull();
    const next = clipRepriced({ ...o, phase: 'starting' }, { credits: 82, speech: 'ka' });
    expect(next).toMatchObject({ speech: 'ka', credits: 82, phase: 'ask', prompt: o.prompt });
    expect(clipEngineLabel(next)).toBe('Gemini Omni Flash');
    // A plain price change keeps the order.
    expect(clipRepriced({ ...o, phase: 'starting' }, { credits: 80 })).toMatchObject({ speech: null, credits: 80, phase: 'ask' });
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

describe('what a quality pick changes (GG 2026-10-26 08:46Z: the three rows read the same)', () => {
  test.each(['ka', 'en', 'ru'])('%s: the three Veo tiers and the two Omni resolutions are told apart in words', (locale) => {
    const tiers = (['lite', 'fast', 'standard'] as const).map((t) => clipTierBlurb(t, locale));
    expect(new Set(tiers).size).toBe(3);
    expect(clipResolutionBlurb('720p', locale)).not.toBe(clipResolutionBlurb('1080p', locale));
  });
  test('Lite says it takes no reference photos (it is greyed out with 2–3)', () => {
    expect(clipTierBlurb('lite', 'en')).toMatch(/Does not take 2–3 photos/);
    expect(clipTierBlurb('lite', 'ka')).toContain('2–3 ფოტოს არ იღებს');
  });
});
