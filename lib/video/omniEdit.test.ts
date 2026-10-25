/**
 * lib/video/omniEdit — an uploaded video edited or extended by Gemini Omni Flash (GG 2026-10-25 16:58Z; card 17:04Z).
 *
 * What is billed (an edit: its own length on the 4 · 6 · 8 · 10 s grid, rounded up; an extend: the new seconds), what Omni
 * is asked for, which videos it can take, which words make an extend, and the strict body the route accepts.
 */
import {
  OMNI_EDIT_SECONDS, OMNI_EXTEND_DEFAULT_SECONDS, omniEditBilledSeconds, omniEditCredits, omniEditInputCheck, omniEditOpFromWords,
  omniEditOutputSeconds, omniEditRequestSeconds, parseOmniEditRequest, snapOmniExtendSeconds,
} from './omniEdit';

test('the lengths: 4 · 6 · 8 · 10 s, an extend adds 8 by default; anything else snaps to 8', () => {
  expect(OMNI_EDIT_SECONDS).toEqual([4, 6, 8, 10]);
  expect(OMNI_EXTEND_DEFAULT_SECONDS).toBe(8);
  expect(snapOmniExtendSeconds(6)).toBe(6);
  expect(snapOmniExtendSeconds('10')).toBe(10);
  for (const bad of [5, 12, 0, null, undefined, 'x']) expect(snapOmniExtendSeconds(bad)).toBe(8);
});

test('which videos Omni takes: at most 10 s (a phone\'s 10.2 s still is); an edit needs 3 s, an extend 1 s', () => {
  expect(omniEditInputCheck('edit', 5)).toBe('ok');
  expect(omniEditInputCheck('edit', 10.2)).toBe('ok');
  expect(omniEditInputCheck('extend', 10.3)).toBe('too_long');
  expect(omniEditInputCheck('edit', 2.5)).toBe('too_short');
  expect(omniEditInputCheck('edit', 2.97)).toBe('ok');
  expect(omniEditInputCheck('extend', 1.2)).toBe('ok');
  expect(omniEditInputCheck('extend', 0.5)).toBe('too_short');
  for (const bad of [null, undefined, 0, -1, NaN, Infinity]) expect(omniEditInputCheck('edit', bad)).toBe('unknown');
});

test('billed seconds: an edit is its own length rounded up to the grid; an extend is the new seconds only', () => {
  expect(omniEditBilledSeconds('edit', 3)).toBe(4);
  expect(omniEditBilledSeconds('edit', 4.04)).toBe(4);
  expect(omniEditBilledSeconds('edit', 5)).toBe(6);
  expect(omniEditBilledSeconds('edit', 6.5)).toBe(8);
  expect(omniEditBilledSeconds('edit', 8.2)).toBe(10);
  expect(omniEditBilledSeconds('edit', 10.2)).toBe(10);
  // An edit's length is the video's; a length the card sent is ignored.
  expect(omniEditBilledSeconds('edit', 5, 10)).toBe(6);
  expect(omniEditBilledSeconds('extend', 9.5, 4)).toBe(4);
  expect(omniEditBilledSeconds('extend', 2, undefined)).toBe(8);
});

test('what Omni is asked for: an edit renders the video\'s own length (3–10 s); an extend, the new seconds', () => {
  expect(omniEditRequestSeconds('edit', 5.4)).toBe(5);
  expect(omniEditRequestSeconds('edit', 2.97)).toBe(3);
  expect(omniEditRequestSeconds('edit', 10.2)).toBe(10);
  expect(omniEditRequestSeconds('extend', 5.4, 6)).toBe(6);
});

test('the result\'s length: an edit, the video\'s; an extend, the video and the new seconds together', () => {
  expect(omniEditOutputSeconds('edit', 5.4)).toBe(5);
  expect(omniEditOutputSeconds('extend', 5.44, 8)).toBe(13.4);
  expect(omniEditOutputSeconds('extend', 3, 10)).toBe(13);
});

test('credits: GG\'s card, by billed seconds and resolution', () => {
  // 720p 4/6/8/10 s = ✦34/48/61/74; 1080p = ✦48/68/88/108 (card 2026-10-25 17:04Z).
  expect([4, 6, 8, 10].map((s) => omniEditCredits({ op: 'extend', inputSec: 5, seconds: s }))).toEqual([34, 48, 61, 74]);
  expect([4, 6, 8, 10].map((s) => omniEditCredits({ op: 'extend', inputSec: 5, seconds: s, resolution: '1080p' }))).toEqual([48, 68, 88, 108]);
  expect(omniEditCredits({ op: 'edit', inputSec: 5, resolution: '720p' })).toBe(48);
  expect(omniEditCredits({ op: 'edit', inputSec: 9, resolution: '1080p' })).toBe(108);
  // Anything that is not 1080p is priced as 720p, the default.
  expect(omniEditCredits({ op: 'edit', inputSec: 3, resolution: null })).toBe(34);
});

test('words that ask what happens next make an extend, in Georgian, English and Russian; anything else is an edit', () => {
  for (const t of ['გააგრძელე ეს ვიდეო', 'გაგრძელება: ის კარს აღებს', 'შემდეგ რა მოხდება?', 'Continue the scene', 'make it longer',
    'what happens next', 'Продолжи видео', 'удлини ролик']) expect(omniEditOpFromWords(t)).toBe('extend');
  for (const t of ['გააღამე', 'ქუდი დაახურე', 'Make it night', 'Turn him into a cartoon', 'Сделай ночь', 'add rain']) {
    expect(omniEditOpFromWords(t)).toBe('edit');
  }
});

describe('parseOmniEditRequest', () => {
  const ok = { op: 'edit', prompt: '  Make   it night.  ', video: 'u-1/chat/clip.mp4', seconds: 8, resolution: '720p', expectedCredits: 48 };

  test('a good body: the words tidied, the defaults filled in', () => {
    expect(parseOmniEditRequest(ok)).toEqual({
      ok: true,
      value: { op: 'edit', prompt: 'Make it night.', video: 'u-1/chat/clip.mp4', seconds: 8, resolution: '720p', expectedCredits: 48 },
    });
    expect(parseOmniEditRequest({ op: 'extend', prompt: 'He walks away.', video: 'p' })).toEqual({
      ok: true,
      value: { op: 'extend', prompt: 'He walks away.', video: 'p', seconds: 8, resolution: '720p', expectedCredits: null },
    });
  });

  test('a bad field is named, before anything is charged', () => {
    const bad = (patch: Record<string, unknown>) => parseOmniEditRequest({ ...ok, ...patch });
    expect(parseOmniEditRequest(null)).toEqual({ ok: false, field: 'op', code: 'invalid' });
    expect(bad({ op: 'remix' })).toEqual({ ok: false, field: 'op', code: 'invalid' });
    expect(bad({ prompt: '   ' })).toEqual({ ok: false, field: 'prompt', code: 'required' });
    expect(bad({ prompt: 'x'.repeat(2_001) })).toEqual({ ok: false, field: 'prompt', code: 'too_long' });
    expect(bad({ video: '' })).toEqual({ ok: false, field: 'video', code: 'required' });
    expect(bad({ video: 'x'.repeat(4_001) })).toEqual({ ok: false, field: 'video', code: 'invalid' });
    expect(bad({ seconds: 5 })).toEqual({ ok: false, field: 'seconds', code: 'invalid' });
    expect(bad({ seconds: '8' })).toEqual({ ok: false, field: 'seconds', code: 'invalid' });
    expect(bad({ resolution: '4k' })).toEqual({ ok: false, field: 'resolution', code: 'invalid' });
    expect(bad({ expectedCredits: 4.5 })).toEqual({ ok: false, field: 'expectedCredits', code: 'invalid' });
    expect(bad({ expectedCredits: -1 })).toEqual({ ok: false, field: 'expectedCredits', code: 'invalid' });
  });
});
