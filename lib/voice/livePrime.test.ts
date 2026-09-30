/**
 * The Live button's gesture prime: synchronous and never throwing (even with no audio APIs), asks other mic holders to
 * release first, one-shot adoption, a stale prime is disposed, and a prime nobody adopts is released on its own so the
 * mic never stays hot behind a screen that did not open.
 */
import { MIC_CONSTRAINTS } from './micAcquire';
import { MIC_RELEASE_EVENT } from './micBus';
import { PRIME_TTL_MS, primeLive, takePrimed } from './livePrime';

class Ctx {
  static all: Ctx[] = [];
  closed = false;
  resume = jest.fn(async () => {});
  constructor() { Ctx.all.push(this); }
  close() { this.closed = true; return Promise.resolve(); }
}

const g = globalThis as unknown as Record<string, unknown>;
let savedAC: unknown;
let track: { stop: jest.Mock };
let gum: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  savedAC = g.AudioContext;
  g.AudioContext = Ctx;
  Ctx.all = [];
  track = { stop: jest.fn() };
  gum = jest.fn(async () => ({ getTracks: () => [track] }));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gum } });
  takePrimed(); // empty the module slot between tests
});
afterEach(() => {
  g.AudioContext = savedAC;
  jest.useRealTimers();
});

test('primes synchronously: release first, then a resumed context and a first-rung getUserMedia', () => {
  const order: string[] = [];
  const onRelease = () => order.push('release');
  window.addEventListener(MIC_RELEASE_EVENT, onRelease);
  gum.mockImplementation(async () => { order.push('gum'); return { getTracks: () => [track] }; });
  primeLive();
  window.removeEventListener(MIC_RELEASE_EVENT, onRelease);
  expect(order).toEqual(['release', 'gum']);
  expect(gum).toHaveBeenCalledWith(MIC_CONSTRAINTS.full);
  expect(Ctx.all[0]!.resume).toHaveBeenCalled();
  const p = takePrimed();
  expect(p?.playCtx).toBe(Ctx.all[0]);
  expect(p?.mic).toBeInstanceOf(Promise);
  expect(takePrimed()).toBeNull(); // one-shot
});

test('never throws without audio APIs; leaves the mic to the session preflight', () => {
  g.AudioContext = undefined;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  expect(() => primeLive()).not.toThrow();
  expect(takePrimed()).toEqual(expect.objectContaining({ playCtx: null, mic: null }));
});

test('a stale prime is disposed on take; an unclaimed one is released after the TTL', async () => {
  primeLive();
  jest.advanceTimersByTime(11_000);
  expect(takePrimed(10_000)).toBeNull();
  await Promise.resolve(); await Promise.resolve();
  expect(track.stop).toHaveBeenCalled();
  expect(Ctx.all[0]!.closed).toBe(true);

  track.stop.mockClear();
  primeLive();
  jest.advanceTimersByTime(PRIME_TTL_MS);
  await Promise.resolve(); await Promise.resolve();
  expect(track.stop).toHaveBeenCalled();
  expect(Ctx.all[1]!.closed).toBe(true);
  expect(takePrimed()).toBeNull();
});

test('priming twice drops the first prime', async () => {
  primeLive();
  primeLive();
  await Promise.resolve(); await Promise.resolve();
  expect(Ctx.all[0]!.closed).toBe(true);
  expect(takePrimed()?.playCtx).toBe(Ctx.all[1]);
});
