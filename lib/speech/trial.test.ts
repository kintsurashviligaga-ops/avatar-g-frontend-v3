/** @jest-environment jsdom */
/**
 * lib/speech/trial — the owner's listening trial of the read-aloud models: a `?tts=` link picks the model for the tab,
 * the request names it, and the replay cache is skipped while it is on.
 */
import { browserSpeechDeps } from './player';
import type { SpeechCache } from './cache';
import { SPEECH_ROUTE } from './request';
import {
  SPEECH_TRIAL_KEY,
  SPEECH_TRIAL_MODELS,
  SpeechTrialRecorder,
  speechTrialModel,
  speechTrialRecorder,
  wavAudioMs,
  type SpeechTrialEnv,
} from './trial';
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
  const PROFILE: Record<string, string> = {
    'x-speech-contract': '1', 'x-speech-pacing': '1;lang=en-US', 'x-speech-model': 'gemini-3.8-flash-tts',
    'x-voice-name': 'Aoede', 'x-speech-sample-rate': '24000', 'x-speech-channels': '1',
  };
  const wav = () => ({
    ok: true,
    status: 200,
    headers: { get: (k: string) => PROFILE[k.toLowerCase()] ?? null },
    blob: async () => new Blob([WAV_MONO_24K]),
  });
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

  test('a trial chunk is measured: its length, how long the route took and how much audio came back', async () => {
    window.history.replaceState({}, '', '/ka/studio?tts=gemini-3.8-flash-tts');
    const rec = speechTrialRecorder();
    rec.onState({ status: 'loading', owner: 'omni:c:1', index: 0 });
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => wav());
    await browserSpeechDeps(null).synth('Hello.', 'en', new AbortController().signal);
    const chunk = rec.snapshot()!.chunks[0]!;
    expect(chunk.chars).toBe('Hello.'.length);
    expect(chunk.synthMs).toBeGreaterThanOrEqual(0);
    expect(chunk.audioMs).toBe(wavAudioMs(WAV_MONO_24K.length, '|24000x1'));
  });
});

describe('the trial recorder', () => {
  const clock = () => {
    let t = 1_000;
    return { now: () => t, at: (ms: number) => { t = 1_000 + ms; } };
  };
  const st = (status: string, index = 0, owner: string | null = 'omni:c:1') => ({ status, owner, index });

  test('first sound, the waits a listener hears, and the end of the read', () => {
    const c = clock();
    const r = new SpeechTrialRecorder(c.now);
    r.onState(st('loading'), 'gemini-3.8-flash-tts');
    c.at(2_400); r.onState(st('playing'), 'gemini-3.8-flash-tts');
    // Chunk 1 was ready: no wait.
    c.at(3_000); r.onState(st('playing', 1), 'gemini-3.8-flash-tts');
    // Chunk 2 was not: 1.1 s of silence.
    c.at(6_000); r.onState(st('loading', 2), 'gemini-3.8-flash-tts');
    c.at(7_100); r.onState(st('playing', 2), 'gemini-3.8-flash-tts');
    // A moment's opening of the next chunk is not a wait anyone hears.
    c.at(9_000); r.onState(st('loading', 3), 'gemini-3.8-flash-tts');
    c.at(9_050); r.onState(st('playing', 3), 'gemini-3.8-flash-tts');
    c.at(12_000); r.onState(st('done', 3), 'gemini-3.8-flash-tts');
    expect(r.snapshot()).toEqual({ model: 'gemini-3.8-flash-tts', firstSoundMs: 2_400, waits: 1, waitMs: 1_100, chunks: [], done: true });
  });

  test('a pause is not a wait; a new read (or another bubble) starts a new record; no trial records nothing', () => {
    const c = clock();
    const off = new SpeechTrialRecorder(c.now);
    off.onState(st('loading'), null);
    expect(off.snapshot()).toBeNull();
    const r = new SpeechTrialRecorder(c.now);
    r.onState(st('loading'), 'm');
    c.at(1_000); r.onState(st('playing'), 'm');
    c.at(2_000); r.onState(st('paused'), 'm');
    c.at(9_000); r.onState(st('playing'), 'm');
    expect(r.snapshot()!.waits).toBe(0);
    r.onState(st('loading', 0, 'omni:c:2'), 'm');
    expect(r.snapshot()).toMatchObject({ firstSoundMs: null, waits: 0, done: false });
  });

  test('chunks are kept in the order they answer, and not after the read ended', () => {
    const r = new SpeechTrialRecorder(() => 0);
    r.onState(st('loading'), 'm');
    r.onChunk({ chars: 10, synthMs: 900, audioMs: 800 });
    r.onChunk({ chars: 40, synthMs: 1_500, audioMs: 3_000 });
    r.onState(st('failed', 1), 'm');
    r.onChunk({ chars: 99, synthMs: 1, audioMs: 1 });
    expect(r.snapshot()!.chunks.map((x) => x.chars)).toEqual([10, 40]);
  });

  test('wavAudioMs reads the length from the size and the profile', () => {
    expect(wavAudioMs(44 + 48_000, 'c1|p1;lang=auto|gemini-3.8-flash-tts|Aoede|24000x1')).toBe(1_000);
    expect(wavAudioMs(44 + 96_000, 'x|48000x1')).toBe(1_000);
    expect(wavAudioMs(44, 'x|24000x1')).toBeNull();
    expect(wavAudioMs(1_000, null)).toBeNull();
  });
});
