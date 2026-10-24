/** @jest-environment jsdom */
/**
 * The page's player and its replay cache on sign-out, and the account the cache keys on (§5.3.6; GG's decision 3).
 */
import { SESSION_CLEARED_EVENT } from '../auth/sessionCleanup';
import { publishedUserId } from './cache';
import { speechCache, speechPlayer } from './player';

afterEach(() => {
  delete document.documentElement.dataset.authed;
  delete document.documentElement.dataset.uid;
});

test('signing out stops the read under way and clears the replay cache', () => {
  // jsdom has no media playback: the page's <audio> is stubbed.
  const proto = window.HTMLMediaElement.prototype;
  jest.spyOn(proto, 'play').mockImplementation(() => Promise.resolve());
  jest.spyOn(proto, 'pause').mockImplementation(() => undefined);
  jest.spyOn(proto, 'load').mockImplementation(() => undefined);
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => new Promise(() => undefined));
  const player = speechPlayer();
  const clear = jest.spyOn(speechCache(), 'clear');
  try {
    player.play({ owner: 'omni:c1:0', text: 'Read this.', locale: 'en' });
    expect(player.getState().owner).toBe('omni:c1:0');
    window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
    expect(player.getState().status).toBe('idle');
    expect(clear).toHaveBeenCalledTimes(1);
  } finally {
    player.dispose();
    delete (globalThis as unknown as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  }
});

test('the cache keys on the account ChatChrome publishes, and on nothing while signed out', () => {
  expect(publishedUserId()).toBeNull();
  document.documentElement.dataset.uid = 'u-1';
  expect(publishedUserId()).toBeNull(); // no data-authed="1" yet
  document.documentElement.dataset.authed = '1';
  expect(publishedUserId()).toBe('u-1');
  document.documentElement.dataset.authed = '0';
  expect(publishedUserId()).toBeNull();
});
