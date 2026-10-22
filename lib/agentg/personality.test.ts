/** @jest-environment node */
/**
 * Agent G's personality reply is Gemini only (R7 and the provider policy: Google + ElevenLabs).
 *
 * It used to fall back to Claude Haiku whenever Gemini failed and ANTHROPIC_API_KEY was set, so a dead Gemini key
 * answered in another vendor's voice. Now a Gemini miss returns the localized fallback reply tagged 'fallback', and
 * the Anthropic client is never created. v3.1: Gemini is reached on Vertex AI only; an AI Studio key opens nothing.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: jest.fn(() => (id: string) => ({ provider: 'google', id })) }));
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn(() => (id: string) => ({ provider: 'anthropic', id })) }));
jest.mock('../agent-g-orchestrator', () => ({ agentGSystemPrompt: () => 'system' }));

import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateAgentGPersonalityReply, getFallbackReply } from './personality';

const VERTEX_ENV: Record<string, string> = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_TRANSPORT', ...Object.keys(VERTEX_ENV)];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ANTHROPIC_API_KEY = 'anthropic-key-not-real';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('Agent G personality — Gemini only', () => {
  it('answers from Gemini on Vertex AI', async () => {
    Object.assign(process.env, VERTEX_ENV);
    (generateText as jest.Mock).mockResolvedValue({ text: 'hello from gemini' });
    const out = await generateAgentGPersonalityReply({ userText: 'hi', locale: 'en', channel: 'web' });
    expect(out.replyText).toBe('hello from gemini');
    expect(out.meta.styleHints).not.toContain('fallback');
    expect(createAnthropic).not.toHaveBeenCalled();
  });

  it('a Gemini failure returns the localized fallback, never a Claude reply', async () => {
    Object.assign(process.env, VERTEX_ENV);
    (generateText as jest.Mock).mockRejectedValue(new Error('PERMISSION_DENIED'));
    const out = await generateAgentGPersonalityReply({ userText: 'hi', locale: 'ka', channel: 'telegram' });
    expect(out.replyText).toBe(getFallbackReply('ka'));
    expect(out.meta.styleHints).toContain('fallback');
    expect(createAnthropic).not.toHaveBeenCalled();
    // Only Gemini was asked (two attempts), nothing else.
    expect(generateText).toHaveBeenCalledTimes(2);
    for (const [args] of (generateText as jest.Mock).mock.calls) expect(args.model.provider).toBe('google');
  });

  it('with Vertex AI unconfigured it does not reach for an AI Studio or an Anthropic key', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key-not-real';
    const out = await generateAgentGPersonalityReply({ userText: 'hi', locale: 'en', channel: 'web' });
    expect(out.replyText).toBe(getFallbackReply('en'));
    expect(generateText).not.toHaveBeenCalled();
    expect(createAnthropic).not.toHaveBeenCalled();
  });
});
