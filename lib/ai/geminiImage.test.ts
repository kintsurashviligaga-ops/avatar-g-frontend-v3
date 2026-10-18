/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../orchestrator/gemini-guard', () => ({ resolveGeminiKey: () => 'k' }));
jest.mock('../web/publicFetch', () => ({ fetchPublicBytes: jest.fn() }));
jest.mock('./google/transport', () => ({ googleImageModelFetch: jest.fn(), googleImageTransportBlocker: () => null }));

import { googleImageModelFetch } from './google/transport';
import { generateGeminiImage, retryAfterMs, RATE_LIMIT_BACKOFF_MS } from './geminiImage';

const fetchMock = googleImageModelFetch as jest.Mock;
const image = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] }), { status: 200 });
const limited = (retryAfter?: string) => new Response('{}', { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} });

describe('generateGeminiImage — per-minute quota (429)', () => {
  beforeEach(() => { jest.useFakeTimers(); fetchMock.mockReset(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  const run = async () => {
    const p = generateGeminiImage({ prompt: 'scene 4' });
    for (let i = 0; i < 10; i++) await jest.advanceTimersByTimeAsync(20_000);
    return p;
  };

  it('waits and retries a 429, then returns the frame', async () => {
    fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(image());
    const r = await run();
    expect(r?.base64).toBe('AAAA');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the bounded retries and returns null (never throws)', async () => {
    fetchMock.mockImplementation(async () => limited());
    expect(await run()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1 + RATE_LIMIT_BACKOFF_MS.length);
  });

  it('does not retry other errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));
    expect(await run()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads Retry-After seconds, capped, and ignores junk', () => {
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs('600')).toBe(20_000);
    expect(retryAfterMs('soon')).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });
});
