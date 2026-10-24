/**
 * lib/library/videoPool — the Library films' <video> elements kept between two showings of a card (§4.2.5): the same
 * element comes back for the same work, few are kept (the oldest let go, its file released), a failed one never, and
 * none of another account's.
 */
import { keepVideo, keptVideoCount, releaseKeptVideosExcept, takeKeptVideo, videoFailed, videoKey, videoRetried } from './videoPool';

let load: jest.SpyInstance;
let pause: jest.SpyInstance;
beforeEach(() => {
  // jsdom has no media playback: count the calls instead.
  load = jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  releaseKeptVideosExcept(null);
  load.mockClear();
});
afterEach(() => { load.mockRestore(); pause.mockRestore(); });

function film(src = 'https://ours.supabase.co/storage/v1/object/sign/renders/f.mp4?token=t#t=0.1') {
  const el = document.createElement('video');
  el.setAttribute('src', src);
  return el;
}
const playing = (el: HTMLVideoElement) => Object.defineProperty(el, 'paused', { configurable: true, get: () => false });

test('the key starts with the owner', () => {
  expect(videoKey('user-a', 'job-1')).toBe('user-a:job-1');
});

test('a kept element comes back for the same work, once, still loaded', () => {
  const el = film();
  keepVideo(videoKey('user-a', 'f1'), el);
  expect(keptVideoCount()).toBe(1);
  expect(takeKeptVideo(videoKey('user-a', 'f2'))).toBeNull();
  expect(takeKeptVideo(videoKey('user-a', 'f1'))).toBe(el);
  expect(el.getAttribute('src')).toContain('f.mp4'); // nothing to read again
  expect(load).not.toHaveBeenCalled();
  expect(takeKeptVideo(videoKey('user-a', 'f1'))).toBeNull(); // taken: it is the card's now
  expect(keptVideoCount()).toBe(0);
});

test('a playing film is paused when set aside; a paused one is left alone', () => {
  const a = playing(film());
  keepVideo('user-a:f1', a);
  expect(pause).toHaveBeenCalledTimes(1);
  keepVideo('user-a:f2', film());
  expect(pause).toHaveBeenCalledTimes(1);
});

test('an element whose file failed is let go, not kept; pointed at another link it may be kept again', () => {
  const el = film();
  videoFailed(el);
  keepVideo('user-a:f1', el);
  expect(keptVideoCount()).toBe(0);
  expect(el.hasAttribute('src')).toBe(false);
  expect(load).toHaveBeenCalledTimes(1); // the browser drops what it read

  const again = film();
  videoFailed(again);
  videoRetried(again);
  keepVideo('user-a:f1', again);
  expect(takeKeptVideo('user-a:f1')).toBe(again);

  // A browser sets `error` on its own; that is enough too.
  const errored = film();
  Object.defineProperty(errored, 'error', { configurable: true, get: () => ({ code: 4 }) });
  keepVideo('user-a:f1', errored);
  expect(keptVideoCount()).toBe(0);
});

test('a second element for the same work replaces the first, which is released', () => {
  const first = film();
  const second = film();
  keepVideo('user-a:f1', first);
  keepVideo('user-a:f1', second);
  expect(keptVideoCount()).toBe(1);
  expect(first.hasAttribute('src')).toBe(false);
  expect(takeKeptVideo('user-a:f1')).toBe(second);
});

test('at most 48 are kept: the one set aside longest ago goes first, and its file is released', () => {
  const els = Array.from({ length: 50 }, (_, i) => film(`https://x/${i}.mp4`));
  els.forEach((el, i) => keepVideo(`user-a:f${i}`, el));
  expect(keptVideoCount()).toBe(48);
  expect(els[0]!.hasAttribute('src')).toBe(false);
  expect(els[1]!.hasAttribute('src')).toBe(false);
  expect(els[2]!.getAttribute('src')).toBe('https://x/2.mp4');
  expect(takeKeptVideo('user-a:f0')).toBeNull();
  expect(takeKeptVideo('user-a:f49')).toBe(els[49]);

  // Setting one aside again makes it the newest.
  keepVideo('user-a:f2', takeKeptVideo('user-a:f2')!);
  for (let i = 50; i < 60; i++) keepVideo(`user-a:f${i}`, film(`https://x/${i}.mp4`));
  expect(takeKeptVideo('user-a:f2')).toBe(els[2]);
});

test('another account\'s films are let go when the account changes; a sign-out lets go of all', () => {
  const mine = film();
  const theirs = film();
  keepVideo('user-a:f1', mine);
  keepVideo('user-b:f1', theirs);
  keepVideo('user-ab:f1', film()); // a prefix of another owner is not that owner
  releaseKeptVideosExcept('user-a');
  expect(keptVideoCount()).toBe(1);
  expect(theirs.hasAttribute('src')).toBe(false);
  expect(takeKeptVideo('user-a:f1')).toBe(mine);

  keepVideo('user-a:f1', mine);
  releaseKeptVideosExcept(null);
  expect(keptVideoCount()).toBe(0);
  expect(mine.hasAttribute('src')).toBe(false);
});

test('an element without a file is released without asking the browser to reload it', () => {
  const empty = document.createElement('video');
  videoFailed(empty);
  keepVideo('user-a:f1', empty);
  expect(load).not.toHaveBeenCalled();
});
