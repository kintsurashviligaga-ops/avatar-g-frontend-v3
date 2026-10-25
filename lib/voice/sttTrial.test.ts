/** @jest-environment jsdom */
/**
 * lib/voice/sttTrial — the owner's dictation-model trial: a `?stt=` link picks the model for the tab, and only a model
 * the route would honour (lib/ai/google/models STT_MODELS) is ever picked.
 */
import { STT_MODELS } from '../ai/google/models';
import { STT_TRIAL_KEY, sttTrialModel, type SttTrialEnv } from './sttTrial';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const env = (search: string, storage: SttTrialEnv['storage'] = memory()): SttTrialEnv => ({ search, storage });

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

test('no link and nothing kept: no trial (the normal case, and always on the server)', () => {
  expect(sttTrialModel(env(''))).toBeNull();
  expect(sttTrialModel(env('?chat=abc&micstats=1'))).toBeNull();
  expect(sttTrialModel(null)).toBeNull();
});

test.each([...STT_MODELS])('?stt=%p picks that model and keeps it for the tab', (id) => {
  const storage = memory();
  expect(sttTrialModel(env(`?stt=${id}&micstats=1`, storage))).toBe(id);
  // The studio may drop the query string later: the tab still remembers.
  expect(sttTrialModel(env('', storage))).toBe(id);
});

test('the id is read case-insensitively, and nothing outside STT_MODELS is ever picked', () => {
  expect(sttTrialModel(env('?stt=Gemini-3.1-Flash-Lite'))).toBe('gemini-3.1-flash-lite');
  for (const id of ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-3.8-flash-tts', 'gemini-9-ultra', '']) {
    expect(sttTrialModel(env(`?stt=${id}`))).toBeNull();
  }
});

test('?stt=off ends the trial, and so does a model that is not on the list', () => {
  const storage = memory();
  sttTrialModel(env('?stt=gemini-3.5-flash', storage));
  expect(sttTrialModel(env('?stt=off', storage))).toBeNull();
  expect(sttTrialModel(env('', storage))).toBeNull();
  sttTrialModel(env('?stt=gemini-3.5-flash', storage));
  expect(sttTrialModel(env('?stt=gemini-9-ultra', storage))).toBeNull();
  expect(sttTrialModel(env('', storage))).toBeNull();
});

test('a value kept by hand that is not on the list is ignored; refused storage still honours the link', () => {
  const storage = memory();
  storage.setItem(STT_TRIAL_KEY, 'gemini-9-ultra');
  expect(sttTrialModel(env('', storage))).toBeNull();
  const refusing = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  };
  expect(sttTrialModel(env('?stt=gemini-3.6-flash', refusing))).toBe('gemini-3.6-flash');
  expect(sttTrialModel(env('', refusing))).toBeNull();
});

test('the browser default reads the page address and the tab storage', () => {
  window.history.replaceState({}, '', '/ka/dashboard?stt=gemini-3.5-flash-lite');
  expect(sttTrialModel()).toBe('gemini-3.5-flash-lite');
  window.history.replaceState({}, '', '/ka/dashboard');
  expect(sttTrialModel()).toBe('gemini-3.5-flash-lite');
  expect(window.sessionStorage.getItem(STT_TRIAL_KEY)).toBe('gemini-3.5-flash-lite');
});
