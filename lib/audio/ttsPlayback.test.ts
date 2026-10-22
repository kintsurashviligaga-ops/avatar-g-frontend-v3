/** @jest-environment jsdom */
import { waitForTtsPlayback } from './ttsPlayback';

let audio: HTMLAudioElement;
let cancel: (() => void) | null;
let source: string;
let error: MediaError | null;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  jest.useFakeTimers();
  audio = document.createElement('audio');
  source = 'blob:chunk'; error = null; cancel = null;
  Object.defineProperty(audio, 'currentSrc', { get: () => source });
  Object.defineProperty(audio, 'error', { get: () => error });
  audio.play = jest.fn().mockResolvedValue(undefined);
  audio.pause = jest.fn();
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); URL.revokeObjectURL = originalRevoke; });
const start = () => waitForTtsPlayback(audio, 'blob:chunk', value => { cancel = value; });

test('only ended completes the chunk and clears its timer, handlers and URL once', async () => {
  const pending = start();
  audio.dispatchEvent(new Event('ended'));
  expect(await pending).toBe('ended');
  expect(audio.pause).not.toHaveBeenCalled();
  expect(audio.onended).toBeNull(); expect(audio.onerror).toBeNull(); expect(cancel).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

test('an actual media error stops playback and does not report completion', async () => {
  const pending = start(); error = { code: 3 } as MediaError;
  audio.dispatchEvent(new Event('error'));
  expect(await pending).toBe('failed'); expect(audio.pause).toHaveBeenCalledTimes(1);
});

test('a stale source error/ended event cannot truncate the new chunk', async () => {
  const pending = start(); source = 'blob:previous'; error = { code: 3 } as MediaError;
  audio.dispatchEvent(new Event('error')); audio.dispatchEvent(new Event('ended'));
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  source = 'blob:chunk'; error = null; audio.dispatchEvent(new Event('ended'));
  expect(await pending).toBe('ended');
});

test('an error event without a current media error is ignored', async () => {
  const pending = start(); audio.dispatchEvent(new Event('error'));
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  audio.dispatchEvent(new Event('ended')); expect(await pending).toBe('ended');
});

test('play rejection stops the read instead of skipping ahead', async () => {
  audio.play = jest.fn().mockRejectedValue(new Error('blocked'));
  expect(await start()).toBe('failed'); expect(audio.pause).toHaveBeenCalledTimes(1);
});

test('a synchronous play exception has the same failed result', async () => {
  audio.play = jest.fn(() => { throw new Error('unavailable'); });
  expect(await start()).toBe('failed'); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

test('the 90-second watchdog fails and pauses rather than claiming the rest was read', async () => {
  const pending = start(); jest.advanceTimersByTime(90_000);
  expect(await pending).toBe('failed'); expect(audio.pause).toHaveBeenCalledTimes(1);
});

test('Stop or a message switch cancels without a failure and releases resources once', async () => {
  const pending = start(); const stop = cancel!; stop(); stop();
  audio.dispatchEvent(new Event('ended')); jest.advanceTimersByTime(90_000);
  expect(await pending).toBe('cancelled'); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  expect(audio.pause).toHaveBeenCalledTimes(1);
});
