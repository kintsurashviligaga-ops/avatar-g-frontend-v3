/**
 * @jest-environment jsdom
 *
 * The product ad's photo queue: three photos picked at once all arrive, in the order picked; a fourth is counted as
 * overflow, never placed and never dropped without a word.
 */
import { placeProductShots, readAsDataUrl } from './productShots';

const EMPTY = { primary: null, extras: [] as string[] };

test('three photos picked at once: the first is the primary, the next two the extra angles', () => {
  expect(placeProductShots(EMPTY, ['a', 'b', 'c'])).toEqual({ primary: 'a', extras: ['b', 'c'], overflow: 0 });
});

test('a second pick after the first was placed fills the remaining angles, then counts the rest', () => {
  const first = placeProductShots(EMPTY, ['a']);
  expect(first).toEqual({ primary: 'a', extras: [], overflow: 0 });
  expect(placeProductShots(first, ['b', 'c', 'd'])).toEqual({ primary: 'a', extras: ['b', 'c'], overflow: 1 });
});

test('a full ad takes nothing more; a removed primary is filled first by the next pick', () => {
  expect(placeProductShots({ primary: 'a', extras: ['b', 'c'] }, ['d'])).toEqual({ primary: 'a', extras: ['b', 'c'], overflow: 1 });
  expect(placeProductShots({ primary: null, extras: ['b'] }, ['x', 'y'])).toEqual({ primary: 'x', extras: ['b', 'y'], overflow: 0 });
});

test('unreadable files (null / empty) take no slot', () => {
  expect(placeProductShots(EMPTY, ['', 'a'])).toEqual({ primary: 'a', extras: [], overflow: 0 });
});

test('readAsDataUrl reads a picked file as a data URL', async () => {
  const url = await readAsDataUrl(new Blob(['x'], { type: 'image/png' }));
  expect(url).toMatch(/^data:image\/png;base64,/);
});
