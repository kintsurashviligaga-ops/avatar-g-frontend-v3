/** @jest-environment node */
import { classifyGeminiStatus, classifyGeminiMessage, geminiKeyPresent, geminiStateHint, logGeminiState } from './gemini-guard';

describe('classifyGeminiStatus', () => {
  test('2xx → ok', () => { expect(classifyGeminiStatus(200)).toBe('ok'); });
  test('429 → billing_quota (key valid, plan limit)', () => { expect(classifyGeminiStatus(429)).toBe('billing_quota'); });
  test('403 → invalid_key', () => { expect(classifyGeminiStatus(403)).toBe('invalid_key'); });
  test('400 with key-hint body → invalid_key, else bad_request', () => {
    expect(classifyGeminiStatus(400, 'API key not valid')).toBe('invalid_key');
    expect(classifyGeminiStatus(400, 'bad payload')).toBe('bad_request');
  });
  test('5xx → transient', () => { expect(classifyGeminiStatus(503)).toBe('transient'); });
});

describe('classifyGeminiMessage (AI-SDK thrown errors)', () => {
  test('quota/429/resource_exhausted → billing_quota', () => {
    expect(classifyGeminiMessage('Error 429 RESOURCE_EXHAUSTED quota')).toBe('billing_quota');
    expect(classifyGeminiMessage('maxRetriesExceeded')).toBe('billing_quota');
  });
  test('api key not valid → invalid_key', () => {
    expect(classifyGeminiMessage('API key not valid. Please pass a valid API key.')).toBe('invalid_key');
  });
  test('overloaded/503 → transient', () => {
    expect(classifyGeminiMessage('model is overloaded, 503')).toBe('transient');
  });
});

describe('geminiKeyPresent', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  test('false when no Gemini var set', () => {
    delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEYS; delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    expect(geminiKeyPresent()).toBe(false);
  });
  test('true when any alias set', () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'k';
    expect(geminiKeyPresent()).toBe(true);
  });
});

describe('logGeminiState', () => {
  test('returns the state and is a no-op log for ok', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(logGeminiState('test', 'ok')).toBe('ok');
    expect(spy).not.toHaveBeenCalled();
    expect(logGeminiState('test', 'billing_quota')).toBe('billing_quota');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
  test('every state has a human hint', () => {
    for (const s of ['ok', 'billing_quota', 'invalid_key', 'bad_request', 'transient', 'error'] as const) {
      expect(geminiStateHint(s).length).toBeGreaterThan(0);
    }
  });
});
