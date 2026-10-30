/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { loadBeatTrack } from './beatAnalysis';

const url = 'https://storage.example.test/sign/music.mp3?token=test';
const originalFetch = globalThis.fetch;
const originalOffline = Object.getOwnPropertyDescriptor(window, 'OfflineAudioContext');

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalOffline) Object.defineProperty(window, 'OfflineAudioContext', originalOffline);
  else Reflect.deleteProperty(window, 'OfflineAudioContext');
});

test('decodes the actual delivered media bytes without changing HTML audio playback', async () => {
  const sample = new Float32Array(24000);
  for (let i = 3000; i < 4000; i++) sample[i] = Math.sin(i * 0.03) * 0.35;
  let pos = 0;
  const chunks = [new Uint8Array([11, 22]), new Uint8Array([33, 44, 55])];
  const reader = {
    read: jest.fn(async () => pos < chunks.length
      ? { done: false, value: chunks[pos++] }
      : { done: true, value: undefined }),
    releaseLock: jest.fn(),
  };
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => '5' },
    body: { getReader: () => reader },
  }) as typeof fetch;

  const decodeAudioData = jest.fn(async (raw: ArrayBuffer) => {
    expect(Array.from(new Uint8Array(raw))).toEqual([11, 22, 33, 44, 55]);
    return { sampleRate: 24000, length: sample.length, numberOfChannels: 1, getChannelData: () => sample };
  });
  Object.defineProperty(window, 'OfflineAudioContext', {
    configurable: true,
    value: class { decodeAudioData = decodeAudioData; },
  });

  const analyzed = await loadBeatTrack(url, new AbortController().signal);
  expect(globalThis.fetch).toHaveBeenCalledWith(url, expect.objectContaining({
    credentials: 'omit', mode: 'cors', cache: 'no-store',
  }));
  expect(analyzed.frames.length).toBeGreaterThan(20);
  expect(decodeAudioData).toHaveBeenCalledTimes(1);
});

test('CORS failures are surfaced, never substituted by fake beat data', async () => {
  globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('CORS')) as typeof fetch;
  await expect(loadBeatTrack(url, new AbortController().signal)).rejects.toThrow('CORS');
});

test('rejects oversized media before decoding, and refuses untrusted schemes', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true, headers: { get: () => String(25 * 1024 * 1024) },
    body: { getReader: jest.fn() },
  }) as typeof fetch;
  await expect(loadBeatTrack(url, new AbortController().signal)).rejects.toThrow('audio_too_large');
  await expect(loadBeatTrack('javascript:alert(1)', new AbortController().signal)).rejects.toThrow('media_scheme_unsupported');
});
