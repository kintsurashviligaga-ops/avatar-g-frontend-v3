/** @jest-environment jsdom */
/**
 * lib/speech/trial — the owner's listening trial of the read-aloud models: a `?tts=` link picks the model for the tab,
 * the request names it, and the replay cache is skipped while it is on.
 */
import { browserSpeechDeps } from './player';
import type { SpeechCache } from './cache';
import { SPEECH_ROUTE } from './request';
import { SPEECH_TRIAL_KEY, SPEECH_TRIAL_MODELS, speechTrialModel, type SpeechTrialEnv } from './trial';
import { WAV_MONO_24K } from '../../tests/fixtures/speechAudio';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const env = (search: string, storage: SpeechTrialEnv['storage'] = memory()): SpeechTrialEnv => ({ search, storage });

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
});

test('no link and nothing kept: no trial (the normal case)', () => {
  expect(speechTrialModel(env(''))).toBeNull();
  expect(speechTrialModel(env('?chat=abc'))).toBeNull();
  expect(speechTrialModel(null)).toBeNull();
});

test.each([...SPEECH_TRIAL_MODELS])('?tts=%p picks that model and keeps it for the tab', (id) => {
  const storage = memory();
  expect(speechTrialModel(env(`?tts=${id}`, storage))).toBe(id);
  // The studio may drop the query string later: the tab still remembers.
  expect(speechTrialModel(env('', storage))).toBe(id);
});

test('?tts=off ends the trial, and so does a model that is not on the list', () => {
  const storage = memory();
  speechTrialModel(env('?tts=gemini-3.8-flash-tts', storage));
  expect(speechTrialModel(env('?tts=off', storage))).toBeNull();
  expect(speechTrialModel(env('', storage))).toBeNull();
  speechTrialModel(env('?tts=gemini-3.8-flash-tts', storage));
  expect(speechTrialModel(env('?tts=gemini-9-pro-tts', storage))).toBeNull();
  expect(speechTrialModel(env('', storage))).toBeNull();
});

test('a value kept by hand that is not on the list is ignored', () => {
  const storage = memory();
  storage.setItem(SPEECH_TRIAL_KEY, 'gemini-2.5-pro-preview-tts');
  expect(speechTrialModel(env('', storage))).toBeNull();
});

test('storage that throws (blocked site data) still lets the link work for its page', () => {
  const broken = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  };
  expect(speechTrialModel(env('?tts=gemini-3.8-flash-lite-tts', broken))).toBe('gemini-3.8-flash-lite-tts');
  expect(speechTrialModel(env('', broken))).toBeNull();
  expect(speechTrialModel(env('', null))).toBeNull();
});

test('the link is read as the page loads, before any tap (the studio may change its address first)', async () => {
  window.history.replaceState({}, '', '/ka/dashboard?tts=gemini-3.8-flash-lite-tts');
  await jest.isolateModulesAsync(async () => {
    await import('./trial');
  });
  window.history.replaceState({}, '', '/ka/dashboard/c/abc');
  expect(window.sessionStorage.getItem(SPEECH_TRIAL_KEY)).toBe('gemini-3.8-flash-lite-tts');
  expect(speechTrialModel()).toBe('gemini-3.8-flash-lite-tts');
});

describe('the browser wiring', () => {
  // jsdom has no fetch Response: the route's answer, as far as lib/speech/request reads it.
  const wav = () => ({ ok: true, status: 200, headers: { get: () => null }, blob: async () => new Blob([WAV_MONO_24K]) });
  const fakeCache = () => {
    const synth = jest.fn(async () => new Blob(['cached']));
    return { cache: { synth } as unknown as SpeechCache, synth };
  };

  test('with no trial, a chunk goes through the replay cache', async () => {
    const { cache, synth } = fakeCache();
    const f = jest.fn(async () => wav());
    (globalThis as unknown as { fetch: unknown }).fetch = f;
    await browserSpeechDeps(cache).synth('Hello.', 'en', new AbortController().signal);
    expect(synth).toHaveBeenCalledTimes(1);
    expect(f).not.toHaveBeenCalled();
  });

  test('a trial link skips the cache and names the model in the request', async () => {
    window.history.replaceState({}, '', '/ka/studio?tts=gemini-3.8-flash-tts');
    const { cache, synth } = fakeCache();
    const f = jest.fn(async (_url: unknown, _init?: RequestInit) => wav());
    (globalThis as unknown as { fetch: unknown }).fetch = f;
    const blob = await browserSpeechDeps(cache).synth('Hello.', 'en', new AbortController().signal);
    expect(blob?.size).toBe(WAV_MONO_24K.length);
    expect(synth).not.toHaveBeenCalled();
    expect(f.mock.calls[0]![0]).toBe(SPEECH_ROUTE);
    expect(JSON.parse(String(f.mock.calls[0]![1]!.body))).toEqual({ text: 'Hello.', locale: 'en', model: 'gemini-3.8-flash-tts' });
    // Kept for the tab: the next chunk, after the studio dropped the query, is still a trial chunk.
    window.history.replaceState({}, '', '/ka/studio');
    await browserSpeechDeps(cache).synth('Again.', 'en', new AbortController().signal);
    expect(synth).not.toHaveBeenCalled();
    expect(JSON.parse(String(f.mock.calls[1]![1]!.body)).model).toBe('gemini-3.8-flash-tts');
  });
});
