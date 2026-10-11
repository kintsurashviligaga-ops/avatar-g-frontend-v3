/**
 * What Agent G says about an edit, in ka · en · ru: every resolved edit in a few words, the plan before Start, the stages,
 * the end, and every refusal (with what the user can do next).
 */
import type { EditQuote } from './editExec';
import type { MediaEdit } from './editPlan';
import {
  askLine, editCodeOf, editDoneText, editErrorText, editLine, editQuoteText, editStageText, editsLine, layerAskLine, outputLine, readingText,
} from './editChat';
import { mineEdits } from './editWords';

const Q: EditQuote = {
  jobId: 'j', credits: 0, name: 'trip-edit.mp4', expiresAt: 1,
  edits: [{ op: 'trim', fromSec: 5, toSec: 12.5 }, { op: 'speed', factor: 2 }],
  plan: { sourceSec: 30, output: 'mp4', durationSec: 3.75, hasAudio: true, width: 1920, height: 1080, copyVideo: false },
};

test.each<[MediaEdit, string, string, string]>([
  [{ op: 'trim', fromSec: 5, toSec: 12.5 }, 'keeps 0:05–0:12.5', 'ვტოვებ 0:05–0:12.5', 'оставляю 0:05–0:12.5'],
  [{ op: 'speed', factor: 2 }, '2× faster', '2×-ით აჩქარება', 'быстрее в 2×'],
  [{ op: 'speed', factor: 0.5 }, '0.5× speed (slower)', '0.5× სიჩქარე (შენელება)', 'скорость 0.5× (медленнее)'],
  [{ op: 'aspect', to: '9:16', fit: 'crop' }, 'frame 9:16, cropped to fill', 'კადრი 9:16, კიდეების ჩამოჭრით', 'кадр 9:16, с обрезкой по краям'],
  [{ op: 'aspect', to: '1:1', fit: 'pad' }, 'frame 1:1, with bars, nothing cut', 'კადრი 1:1, ზოლებით, არაფერი იჭრება', 'кадр 1:1, с полями, без обрезки'],
  [{ op: 'grade', style: 'noir' }, 'black and white colour', 'ფერი: შავ-თეთრი', 'цвет: чёрно-белый'],
  [{ op: 'fade', inSec: 1, outSec: 0 }, 'fade in 1 s', 'გამოჩენა 1 წმ', 'появление 1 с'],
  [{ op: 'fade', inSec: 0.5, outSec: 2 }, 'fade in 0.5 s, fade out 2 s', 'გამოჩენა 0.5 წმ, ჩაქრობა 2 წმ', 'появление 0.5 с, затухание 2 с'],
  [{ op: 'volume', db: 6 }, 'sound +6 dB', 'ხმა +6 dB', 'звук +6 дБ'],
  [{ op: 'volume', db: -6 }, 'sound -6 dB', 'ხმა -6 dB', 'звук -6 дБ'],
  [{ op: 'mute' }, 'sound off', 'ხმის გარეშე', 'без звука'],
  [{ op: 'caption', text: 'ზაფხული' }, 'caption “ზაფხული”', 'წარწერა „ზაფხული“', 'подпись «ზაფხული»'],
  [{ op: 'thumbnail', atSec: 63 }, 'a still from 1:03', 'კადრი 1:03-დან', 'кадр с 1:03'],
])('%j reads as „%s"', (edit, en, ka, ru) => {
  expect(editLine(edit, 'en')).toBe(en);
  expect(editLine(edit, 'ka')).toBe(ka);
  expect(editLine(edit, 'ru')).toBe(ru);
});

test('the plan: the source, the edits, what comes out, free, and that nothing starts before Start', () => {
  expect(editsLine(Q.edits, 'en')).toBe('keeps 0:05–0:12.5 · 2× faster');
  expect(outputLine(Q.plan, 'en')).toBe('MP4 · 0:04 · 1920×1080');
  expect(outputLine({ ...Q.plan, hasAudio: false }, 'ka')).toBe('MP4 · 0:04 · 1920×1080 · უხმოდ');
  expect(outputLine({ ...Q.plan, output: 'jpg' }, 'en')).toBe('JPEG · 1920×1080');
  expect(editQuoteText(Q, 'en')).toBe(
    'Source: your video.\nPlan: keeps 0:05–0:12.5 · 2× faster.\nResult: “trip-edit.mp4”, MP4 · 0:04 · 1920×1080.\nFree. Nothing starts until you press Start.',
  );
  expect(editQuoteText(Q, 'ka', 'previous')).toMatch(/^წყარო: ჩემი ბოლო შედეგი აქ\.\nგეგმა: ვტოვებ 0:05–0:12\.5 · 2×-ით აჩქარება\./);
  expect(editQuoteText(Q, 'ru')).toMatch(/Бесплатно\. Ничего не начнётся, пока вы не нажмёте «Начать»\.$/);
  expect(readingText('previous', 'en')).toBe('Opening my last result and planning the edit…');
});

test('stages and the end, in words', () => {
  expect(editStageText('render', 'en')).toBe('Editing the video');
  expect(editStageText('qc', 'ka')).toBe('ვამოწმებ შედეგს');
  expect(editStageText('mystery', 'en')).toBe('Starting');
  expect(editStageText(null, 'ru')).toBe('Начинаю');
  expect(editDoneText({ output: 'mp4', name: 'a-edit.mp4', durationSec: 7, width: 1080, height: 1920 }, 'en'))
    .toBe('Ready: “a-edit.mp4”, 0:07 · 1080×1920. Watch it here, download it, or find it in your Library.');
  expect(editDoneText({ output: 'jpg', name: 'a-thumbnail.jpg', durationSec: 0, width: 1080, height: 1920 }, 'ka'))
    .toBe('მზადაა: „a-thumbnail.jpg“, 1080×1920. ჩამოტვირთე ან ნახე ბიბლიოთეკაში.');
});

test('refusals say what happened and what to do next; the server numbers only on the English card', () => {
  expect(editErrorText('out_of_range', 'en', 'The video is 30 s long.')).toBe('That time is outside the video. The video is 30 s long.');
  expect(editErrorText('out_of_range', 'ka', 'The video is 30 s long.')).toBe('ეს დრო ვიდეოს გარეთაა.');
  expect(editErrorText('quote_expired', 'en')).toBe('This plan expired (30 minutes). Tell me again what to change.');
  expect(editErrorText('cut_middle', 'en')).toMatch(/cannot cut a stretch out of the middle/);
  expect(editErrorText('caption_text', 'ka')).toMatch(/რა ეწეროს/);
  expect(editErrorText('no_previous', 'ru')).toMatch(/Прикрепите видео/);
  expect(editErrorText('whatever', 'en')).toBe('The video could not be edited. Nothing was charged.');
  expect(editErrorText(undefined, 'en')).toBe('The video could not be edited. Nothing was charged.');
});

test('a refused response reads as its own code, or as what its status means', () => {
  expect(editCodeOf(422, { error: 'conflict' })).toBe('conflict');
  expect(editCodeOf(401, {})).toBe('unauthenticated');
  expect(editCodeOf(429, null)).toBe('rate_limited');
  expect(editCodeOf(404, {})).toBe('closed');
  expect(editCodeOf(404, { error: 'not_found', message: 'No such job.' })).toBe('not_found');
  expect(editCodeOf(500, { error: 'boom' })).toBe('render_failed');
});

describe('askLine: an edit as the words asked it, before a file resolves it (the plan card of a montage chain)', () => {
  // Owner 2026-10-11: the card of this message showed none of the overlay or the texts; a layers ask crashed the plan line.
  const GG = 'დაამონტაჟე, სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე რომ ეფექტი გამოვიდეს და მუსიკა დაადე 0.59 წამიდან რომ დაიწყოს, ასევე დაადე ოვერლეი, გაუკეთე ქებშენი და ლამაზად დააწერე მოუშენით myavatar.ge🚀 და ბოლოს ქართულად უნდა დაიწეროს გადმოდი საიტზე';

  test('the overlay and both texts, each with its place, time, look and motion, in ka · en · ru', () => {
    const asks = mineEdits(GG).edits.filter((e) => e.op === 'overlay' || e.op === 'layers');
    expect(asks.map((e) => askLine(e, 'ka'))).toEqual([
      'ოვერლეი: თბილი სინათლის ანარეკლები',
      '„myavatar.ge🚀“ ქვემოთ, ბოლო 3 წამამდე (კინემატოგრაფიული, ქვემოდან შემოდის) · „გადმოდი საიტზე“ ქვემოთ, ბოლო 3 წამში (ბრენდის ღილაკი, ქვემოდან შემოდის)',
    ]);
    expect(asks.map((e) => askLine(e, 'en'))).toEqual([
      'overlay: warm light leaks',
      '“myavatar.ge🚀” bottom, until 3 s before the end (cinematic, slides up) · “გადმოდი საიტზე” bottom, the last 3 s (brand button, slides up)',
    ]);
    expect(askLine(asks[1]!, 'ru')).toContain('«გადმოდი საიტზე» внизу, последние 3 с');
  });

  test('a layers ask has no resolved layers yet and never throws; an ask with nothing to show is empty', () => {
    expect(askLine({ op: 'layers' }, 'en')).toBe('');
    expect(askLine({ op: 'layers', add: [] }, 'ka')).toBe('');
    expect(askLine({ op: 'trim', fromSec: 1 }, 'en')).toBe('');
    expect(askLine({ op: 'overlay' }, 'en')).toBe('overlay: warm light leaks');
  });

  test('a picture and a mask take the resolver\'s default places', () => {
    expect(layerAskLine({ kind: 'image', ref: 'x' } as never, 'en')).toBe('your picture top right');
    expect(layerAskLine({ kind: 'mask', mode: 'mosaic', firstSec: 2 } as never, 'en')).toBe('pixelated: centre, the first 2 s');
  });
});
