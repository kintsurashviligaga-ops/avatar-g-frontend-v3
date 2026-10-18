/** @jest-environment node */
/**
 * Lyria 3 Pro (tracks over 30 s) goes over the SAME transport as the clip: on Vertex (GEMINI_TRANSPORT=vertex) both
 * models answer :generateContent through googleModelFetch, and the Gemini API key's Interactions surface is never used.
 * The transport is mocked — no network, no spend.
 */
jest.mock('../orchestrator/gemini-guard', () => ({ resolveGeminiKey: jest.fn(() => '') }));
jest.mock('../services/billing/BillingGuard', () => ({
  canProceed: jest.fn(async () => ({ allowed: true })),
  recordUsage: jest.fn(async () => undefined),
}));
jest.mock('./geminiFallbackReport', () => ({ reportGeminiFallback: jest.fn() }));
jest.mock('./google/transport', () => ({
  googleTransportKind: jest.fn(() => 'vertex'),
  googleTransportBlocker: jest.fn(() => null),
  googleModelFetch: jest.fn(),
}));

import { generateLyriaTrack, lyriaRequest } from './lyriaMusic';
import { googleModelFetch } from './google/transport';
import { LYRIA_CLIP_MODEL, LYRIA_PRO_MODEL } from '../studio/musicEngines';

const AUDIO = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/mpeg', data: 'A'.repeat(4000) } }] } }] };
const realFetch = global.fetch;

beforeEach(() => {
  delete process.env.LYRIA_MODEL;
  (googleModelFetch as jest.Mock).mockReset().mockImplementation(async () => new Response(JSON.stringify(AUDIO), { status: 200 }));
  global.fetch = jest.fn(async () => { throw new Error('the Interactions API must not be called on Vertex'); }) as unknown as typeof fetch;
});
afterAll(() => { global.fetch = realFetch; });

test('generateLyriaTrack: the clip by default, Pro when named — both over Vertex :generateContent', async () => {
  await expect(generateLyriaTrack({ prompt: 'calm piano', instrumental: true })).resolves.toMatchObject({ mime: 'audio/mpeg' });
  await expect(generateLyriaTrack({ prompt: 'calm piano', instrumental: true, model: LYRIA_PRO_MODEL })).resolves.toMatchObject({ mime: 'audio/mpeg' });
  expect((googleModelFetch as jest.Mock).mock.calls.map((c) => [c[0], c[1]])).toEqual([
    [LYRIA_CLIP_MODEL, 'generateContent'],
    [LYRIA_PRO_MODEL, 'generateContent'],
  ]);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('lyriaRequest (Music Studio v1): Pro over Vertex too', async () => {
  const r = await lyriaRequest('epic ballad', LYRIA_PRO_MODEL, new AbortController().signal);
  expect(r.ok).toBe(true);
  expect((googleModelFetch as jest.Mock).mock.calls[0][0]).toBe(LYRIA_PRO_MODEL);
  expect(global.fetch).not.toHaveBeenCalled();
});
