/** @jest-environment jsdom */
/**
 * The page's player and the calls (MASTER TASK v3.1 §5, Phase 4 PR 7): a call has the speakers. Gemini Live starting
 * takes the microphone (lib/voice/micBus), which stops the read; while <html data-live-call> is set no read starts; the
 * turn-by-turn voice call claims the speakers itself for as long as it is open.
 */
import { requestMicRelease } from '../voice/micBus';
import { claimSpeakersForCall, speechPlayer } from './player';

beforeEach(() => {
  // jsdom has no media playback: the page's <audio> is stubbed, and a chunk's synthesis never answers.
  const proto = window.HTMLMediaElement.prototype;
  jest.spyOn(proto, 'play').mockImplementation(() => Promise.resolve());
  jest.spyOn(proto, 'pause').mockImplementation(() => undefined);
  jest.spyOn(proto, 'load').mockImplementation(() => undefined);
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => new Promise(() => undefined));
});

afterEach(() => {
  speechPlayer().stop();
  delete document.documentElement.dataset.liveCall;
  delete document.documentElement.dataset.voiceCall;
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

test('Live starting (it asks for the microphone) stops the read under way', () => {
  const player = speechPlayer();
  player.play({ owner: 'omni:c1:0', text: 'Read this.', locale: 'en' });
  expect(player.getState().owner).toBe('omni:c1:0');
  requestMicRelease('live');
  expect(player.getState().status).toBe('idle');
});

test('no read starts while a Live call has the speakers; it may once the call ends', () => {
  const player = speechPlayer();
  document.documentElement.dataset.liveCall = '1';
  player.play({ owner: 'omni:c1:0', text: 'Read this.', locale: 'en' });
  expect(player.getState()).toMatchObject({ status: 'failed', fault: 'live_call' });
  delete document.documentElement.dataset.liveCall;
  player.play({ owner: 'omni:c1:0', text: 'Read this.', locale: 'en' });
  expect(player.getState()).toMatchObject({ status: 'loading', owner: 'omni:c1:0', fault: null });
});

test('the voice call claims the speakers: the read stops, none starts, and the release lets reads start again', () => {
  const player = speechPlayer();
  player.play({ owner: 'premium', text: 'Read this.', locale: 'ka' });
  const release = claimSpeakersForCall();
  expect(player.getState().status).toBe('idle');
  expect(document.documentElement.dataset.voiceCall).toBe('1');
  player.play({ owner: 'premium', text: 'Read this.', locale: 'ka' });
  expect(player.getState()).toMatchObject({ status: 'failed', fault: 'live_call' });
  release();
  expect(document.documentElement.dataset.voiceCall).toBeUndefined();
  player.play({ owner: 'premium', text: 'Read this.', locale: 'ka' });
  expect(player.getState()).toMatchObject({ status: 'loading', fault: null });
});
