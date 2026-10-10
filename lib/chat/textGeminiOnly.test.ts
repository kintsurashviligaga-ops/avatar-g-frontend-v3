/** @jest-environment node */
/**
 * The chat text path is Gemini only (R7 and the provider policy: Google + ElevenLabs).
 *
 * providerRouter used to send "specialist" turns (code, maths, technical blueprints) to Claude BEFORE Gemini whenever
 * ANTHROPIC_API_KEY was set, and to answer from Claude whenever Gemini failed — so a dead Gemini key was hidden behind
 * another vendor's reply. Pinned here, through the real orchestrate():
 *   · a specialist-looking turn goes to Gemini, and the Anthropic client is never constructed, key or not;
 *   · a Gemini failure is an explicit "temporarily unavailable" reply tagged provider 'gemini', never Claude's text;
 *   · without a Gemini key the turn says so, even when an Anthropic key is present.
 * Every provider module is mocked; nothing here can reach the network.
 */
jest.mock('server-only', () => ({}));

jest.mock('./ServiceManager', () => {
  const execute = jest.fn();
  const poll = jest.fn();
  return { ServiceManager: jest.fn().mockImplementation(() => ({ execute, poll })), __sm: { execute, poll } };
});
jest.mock('./filmComposite', () => ({
  // The real keyword predicate (a pure regex in filmPipeline) — only the composite HANDLER is stubbed.
  isThirtySecondFilm: (m: string) => (jest.requireActual('./filmPipeline') as typeof import('./filmPipeline')).isThirtySecondFilm(m),
  handleFilmComposite: jest.fn(async () => ({ success: true, intent: 'video_generation', responseType: 'video', message: 'film queued', metadata: { provider: 'film' } })),
}));
jest.mock('./musicVideoComposite', () => ({
  isMusicVideoComposite: jest.fn(() => false),
  handleMusicVideoComposite: jest.fn(async () => ({ success: true, intent: 'video_generation', responseType: 'video', message: 'mv queued', metadata: { provider: 'mv' } })),
}));
jest.mock('../orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(),
}));
jest.mock('../gemini/client', () => ({ generateWithGemini: jest.fn() }));
// Claude must never be reached: constructing the client fails the test (it used to be the specialist lead and the fallback).
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: jest.fn(async () => ({ model: 'claude', content: [{ type: 'text', text: 'from claude' }], usage: {} })) } })));
jest.mock('../udio/client', () => ({ startUdioGeneration: jest.fn(), getUdioGenerationStatus: jest.fn() }));
jest.mock('../worldlabs/client', () => ({ generateWorldLabsInterior: jest.fn() }));
jest.mock('../nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../replicate/client', () => ({ createPrediction: jest.fn(), pollUntilDone: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../monetization/audit-engine', () => ({
  isFounderAuditCommand: jest.fn(() => false),
  isFounder: jest.fn(() => false),
  runFounderAudit: jest.fn(),
  renderAuditAsMarkdown: jest.fn(),
  forecastMarginForAction: jest.fn(),
}));
jest.mock('./filmStatusStore', () => ({ deriveFilmTokenId: jest.fn(), buildFilmSnapshot: jest.fn(), putFilmStatus: jest.fn() }));
jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));

import { orchestrate, type OrchestratorInput } from './providerRouter';
import { generateWithGemini } from '../gemini/client';

const Anthropic = jest.requireMock('@anthropic-ai/sdk') as jest.Mock;

function input(over: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    message: 'what is the capital of Georgia?',
    serviceContext: 'global',
    agentId: 'main-assistant',
    userId: 'user_1',
    sessionId: 'session_text_1',
    locale: 'en',
    history: [],
    ...over,
  };
}

const SPECIALIST_TURNS = [
  'help me refactor this TypeScript module',
  'fix this:\n```ts\nconst x: number = "1";\n```',
  'compute the integral of x^2 dx',
  'draft a system design for this service',
];

const ENV = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ANTHROPIC_API_KEY = 'anthropic-key-not-real';
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});

afterEach(() => {
  fetchSpy.mockRestore();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('chat text path — Gemini only', () => {
  it.each(SPECIALIST_TURNS)('a specialist-looking turn is answered by Gemini: %s', async (message) => {
    process.env.GEMINI_API_KEY = 'gemini-key-not-real';
    (generateWithGemini as jest.Mock).mockResolvedValue({ text: 'gemini answer', model: 'gemini-test' });
    const res = await orchestrate(input({ message }));
    expect(res.success).toBe(true);
    expect(res.message).toBe('gemini answer');
    expect(res.metadata.provider).toBe('gemini');
    expect(generateWithGemini).toHaveBeenCalledTimes(1);
    expect(Anthropic).not.toHaveBeenCalled();
  });

  it('a Gemini failure is an explicit unavailable reply, not a Claude answer', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key-not-real';
    (generateWithGemini as jest.Mock).mockRejectedValue(new Error('API key not valid'));
    const res = await orchestrate(input({ message: 'help me refactor this TypeScript module' }));
    expect(res.success).toBe(false);
    expect(res.message).toBe('Chat is temporarily unavailable. Please try again shortly.');
    expect(res.metadata).toMatchObject({ provider: 'gemini', geminiError: 'API key not valid' });
    expect(Anthropic).not.toHaveBeenCalled();
  });

  it('a transient Gemini error is retried on Gemini, then reported — still no Claude', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key-not-real';
    (generateWithGemini as jest.Mock).mockRejectedValue(new Error('503 UNAVAILABLE: model overloaded'));
    const res = await orchestrate(input());
    expect(generateWithGemini).toHaveBeenCalledTimes(3);
    expect(res.success).toBe(false);
    expect(res.metadata.provider).toBe('gemini');
    expect(Anthropic).not.toHaveBeenCalled();
  });

  it('without a Gemini key the turn says the core is not configured, even with an Anthropic key', async () => {
    const res = await orchestrate(input({ message: 'compute the integral of x^2 dx' }));
    expect(res.success).toBe(false);
    expect(res.message).toBe('Chat is temporarily unavailable. Please try again a little later.');
    expect(res.metadata).toMatchObject({ provider: 'gemini', error: 'GEMINI_API_KEY not configured' });
    expect(generateWithGemini).not.toHaveBeenCalled();
    expect(Anthropic).not.toHaveBeenCalled();
  });
});
