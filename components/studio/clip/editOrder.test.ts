/**
 * components/studio/clip/editOrder — an uploaded video edited or extended by Omni, as the chat's card (GG 2026-10-25
 * 16:58Z; card 17:04Z). Pinned: the words are kept as typed; an edit is priced at its own length on the grid, an extend at
 * the new seconds (8 by default); the prices are GG's card; the request carries the stored path and the price shown; a
 * length the browser could not read is left to the server; every line is said in the UI language.
 */
import {
  changeEdit, editFailureText, editOpAllowed, editOrder, editPriceNote, editRequestBody, editSpecLine, editTooLongText,
} from './editOrder';

const VIDEO = { url: 'blob:https://myavatar.ge/1', mimeType: 'video/mp4', name: 'clip.mp4' };
const base = { op: 'edit' as const, prompt: '  გააღამე  ', video: VIDEO, inputSec: 5.04 };

test('an edit: the words as typed, priced at its own length rounded up to the grid (5 s → 6 s, ✦48 at 720p)', () => {
  const o = editOrder(base);
  expect(o).toMatchObject({ op: 'edit', prompt: '  გააღამე  ', inputSec: 5.04, seconds: 8, resolution: '720p', phase: 'ask', credits: 48 });
  expect(changeEdit(o, { resolution: '1080p' }).credits).toBe(68);
  // An edit's length is the video's: the extend pick does not move its price.
  expect(changeEdit(o, { seconds: 4 }).credits).toBe(48);
});

test('an extend: the new seconds only, 8 by default; GG\'s card at both resolutions', () => {
  const o = editOrder({ ...base, op: 'extend' });
  expect(o).toMatchObject({ op: 'extend', seconds: 8, credits: 61 });
  expect([4, 6, 8, 10].map((s) => changeEdit(o, { seconds: s as 4 | 6 | 8 | 10 }).credits)).toEqual([34, 48, 61, 74]);
  expect([4, 6, 8, 10].map((s) => changeEdit(changeEdit(o, { resolution: '1080p' }), { seconds: s as 4 | 6 | 8 | 10 }).credits)).toEqual([48, 68, 88, 108]);
  expect(changeEdit(o, { op: 'edit' })).toMatchObject({ op: 'edit', credits: 48, phase: 'ask' });
});

test('a length the browser could not read: the edit is priced at 4 s and the server\'s measured length corrects it', () => {
  const o = editOrder({ ...base, inputSec: null });
  expect(o).toMatchObject({ inputSec: null, credits: 34 });
  expect(editOpAllowed('edit', null)).toBe(true);
  expect(changeEdit(o, { inputSec: 9.2 })).toMatchObject({ inputSec: 9.2, credits: 74 });
  expect(editPriceNote(o, 'en')).toMatch(/server measures/);
});

test('which ops a video allows: over 10 s neither; under 3 s only extend', () => {
  expect(editOpAllowed('edit', 12)).toBe(false);
  expect(editOpAllowed('extend', 12)).toBe(false);
  expect(editOpAllowed('edit', 2)).toBe(false);
  expect(editOpAllowed('extend', 2)).toBe(true);
});

test('the request: the stored path, the op, the new seconds, the resolution and the price shown', () => {
  const o = changeEdit(editOrder({ ...base, op: 'extend' }), { seconds: 10 });
  expect(editRequestBody(o, 'omni-uploads/u-1/a.mp4')).toEqual({
    op: 'extend', prompt: '  გააღამე  ', video: 'omni-uploads/u-1/a.mp4', seconds: 10, resolution: '720p', expectedCredits: 74,
  });
});

test('the spec line and the price note, in the UI language', () => {
  expect(editSpecLine(editOrder(base), 'en')).toBe('Edit · 5 s · 720p · Gemini Omni Flash');
  expect(editSpecLine(editOrder({ ...base, op: 'extend', resolution: '1080p' }), 'en')).toBe('Extend +8 s → 13 s · 1080p · Gemini Omni Flash');
  expect(editSpecLine(editOrder({ ...base, op: 'extend' }), 'ka')).toBe('გაგრძელება +8 წმ → 13 წმ · 720p · Gemini Omni Flash');
  expect(editSpecLine(editOrder({ ...base, inputSec: null }), 'ru')).toBe('Редактирование · 720p · Gemini Omni Flash');
  expect(editPriceNote(editOrder(base), 'en')).toBe('A 5 s video, priced as 6 s. The frame is the video\'s own.');
  expect(editPriceNote(editOrder({ ...base, op: 'extend' }), 'ka')).toBe('ფასი მხოლოდ ახალ 8 წამზეა. კადრი ვიდეოს საკუთარია.');
});

test('failures say what happened, with the length when the server read it, and that nothing was charged', () => {
  expect(editFailureText({ error: 'video_too_long', seconds: 14.4, maxSeconds: 10 }, 'en')).toBe(
    'The video is 14.4 s. Editing and extending take a video of up to 10 s. Trim it and attach it again. Nothing was charged.');
  expect(editTooLongText(null, 'ka')).toMatch(/^რედაქტირება და გაგრძელება მაქსიმუმ 10 წამიან/);
  expect(editFailureText({ error: 'video_too_short', seconds: 2.2 }, 'en')).toMatch(/at least 3 s.*can be extended/);
  expect(editFailureText({ error: 'video_unreadable' }, 'ru')).toMatch(/MP4 или MOV/);
  expect(editFailureText({ error: 'video_too_large' }, 'en')).toMatch(/too large/);
  expect(editFailureText({ error: 'insufficient_credits' }, 'ka')).toMatch(/კრედიტი/);
  expect(editFailureText({}, 'en')).toBeTruthy();
});
