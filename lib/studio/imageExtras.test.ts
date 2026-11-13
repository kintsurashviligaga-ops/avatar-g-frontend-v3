/**
 * lib/studio/imageExtras — Phase 7.5 Image additions, all OFF by default: the extra ratios, edit mode's words, quick edits
 * and the multi-reference reader.
 */
import {
  IMAGE_MULTI_REF_MAX, IMG_EXTRA_ASPECTS, applyQuickEdit, editModeCopy, extraReferences, imageEditModeUiOn,
  imageExtraRatiosServerOn, imageExtraRatiosUiOn, imageMultiRefServerOn, isImgExtraAspect, quickEdits,
} from './imageExtras';
import { IMG_ASPECTS, imageAspectsOffered } from './imageCreate';

const KEYS = ['NEXT_PUBLIC_IMAGE_EXTRA_RATIOS', 'IMAGE_EXTRA_RATIOS', 'NEXT_PUBLIC_IMAGE_EDIT_MODE', 'IMAGE_MULTI_REF'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

test('every flag is off unless set to a truthy word', () => {
  for (const k of KEYS) delete process.env[k];
  expect([imageExtraRatiosUiOn(), imageExtraRatiosServerOn(), imageEditModeUiOn(), imageMultiRefServerOn()]).toEqual([false, false, false, false]);
  for (const k of KEYS) process.env[k] = 'on';
  expect([imageExtraRatiosUiOn(), imageExtraRatiosServerOn(), imageEditModeUiOn(), imageMultiRefServerOn()]).toEqual([true, true, true, true]);
  process.env.IMAGE_MULTI_REF = '0';
  expect(imageMultiRefServerOn()).toBe(false);
});

test('the picker offers today\'s ten ratios, and the four extra ones only with the flag', () => {
  expect(imageAspectsOffered(false)).toEqual([...IMG_ASPECTS]);
  expect(imageAspectsOffered(true)).toEqual([...IMG_ASPECTS, ...IMG_EXTRA_ASPECTS]);
  expect(isImgExtraAspect('1:8')).toBe(true);
  expect(isImgExtraAspect('16:9')).toBe(false);
});

test('a quick edit fills an empty box, or adds a line under what is there', () => {
  const remove = quickEdits('en').find((q) => q.id === 'remove-bg')!;
  expect(applyQuickEdit('', remove)).toBe(remove.prompt);
  expect(applyQuickEdit('keep the cat  ', remove)).toBe(`keep the cat\n${remove.prompt}`);
  expect(quickEdits('ka').map((q) => q.id)).toEqual(quickEdits('ru').map((q) => q.id));
  expect(editModeCopy('xx').button).toBe('რედაქტირება'); // Georgian by default
  expect(editModeCopy('en').button).toBe('Edit');
});

test('extra references: strings only, images only, no repeats, at most 14 with the first', () => {
  const first = 'data:image/jpeg;base64,AAA';
  expect(extraReferences(undefined, first)).toEqual([]);
  expect(extraReferences(['https://a/1.png', 7, '', ' https://a/1.png ', first, 'http://insecure/x.png', 'data:text/html,x', 'data:image/png;base64,B'], first))
    .toEqual(['https://a/1.png', 'data:image/png;base64,B']);
  const many = Array.from({ length: 30 }, (_, i) => `https://a/${i}.png`);
  expect(extraReferences(many, first)).toHaveLength(IMAGE_MULTI_REF_MAX - 1);
  expect(extraReferences(many, '')).toHaveLength(IMAGE_MULTI_REF_MAX);
});
