/** @jest-environment node */
/**
 * The Higgsfield REST client against a scripted fetch. The rules under test come straight from the docs
 * (concepts/errors, polling, file-uploads, how-to/webhooks) — above all: a generation POST is sent ONCE.
 */
jest.mock('server-only', () => ({}));

import { createHfClient, extractOutputUrls, hfAuthHeaderFromEnv, mapHttpError } from './client';
import { ProviderError } from '@/lib/providers/types';

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function scripted(responses: Array<{ status: number; body?: unknown; corr?: string } | Error>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: String(init.method),
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error('no scripted response left');
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? '' : JSON.stringify(next.body), {
      status: next.status,
      headers: next.corr ? { 'x-correlation-id': next.corr } : {},
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const AUTH = 'Key key-id-1:secret-abc';
const make = (responses: Parameters<typeof scripted>[0]) => {
  const s = scripted(responses);
  const client = createHfClient({ authHeader: AUTH, fetchImpl: s.fetchImpl, sleep: async () => undefined, maxAttempts: 3 });
  return { ...s, client };
};
const timeoutError = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });

describe('credentials', () => {
  test('the pair or the single variable, never a partial header', () => {
    expect(hfAuthHeaderFromEnv({ HF_API_KEY_ID: 'id', HF_API_KEY_SECRET: 'sec' } as NodeJS.ProcessEnv)).toBe('Key id:sec');
    expect(hfAuthHeaderFromEnv({ HF_CREDENTIALS: 'id:sec' } as NodeJS.ProcessEnv)).toBe('Key id:sec');
    expect(hfAuthHeaderFromEnv({ HF_API_KEY_ID: 'id' } as NodeJS.ProcessEnv)).toBeNull(); // the Phase 0 state: ID only
    expect(hfAuthHeaderFromEnv({ HF_CREDENTIALS: 'no-colon' } as NodeJS.ProcessEnv)).toBeNull();
    expect(hfAuthHeaderFromEnv({ HF_CREDENTIALS: 'id:' } as NodeJS.ProcessEnv)).toBeNull();
  });

  test('refuses to build a client without a well-formed header', () => {
    expect(() => createHfClient({ authHeader: 'Bearer x' })).toThrow(ProviderError);
  });
});

describe('estimate', () => {
  test('POST /estimate/<endpoint> with the generation body and the documented Authorization header', async () => {
    const { client, calls } = make([{ status: 200, body: { credits: '1.500', usd: '0.094' }, corr: 'corr-1' }]);
    const r = await client.estimate('higgsfield-ai/soul/v2/standard', { prompt: 'x' });
    expect(r).toEqual({ usd: 0.094, providerCredits: 1.5, listUsd: 0.094, pricingDescription: null, correlationId: 'corr-1' });
    expect(calls[0]).toMatchObject({
      url: 'https://api.higgsfield.ai/estimate/higgsfield-ai/soul/v2/standard',
      method: 'POST',
      body: { prompt: 'x' },
    });
    expect(calls[0]!.headers.Authorization).toBe(AUTH);
  });

  test('a discount is reported: usd is what is charged, listUsd what it would have been', async () => {
    // Verified 2026-09-29 on Kling 3 std 5 s with sound.
    const { client } = make([{ status: 200, body: { type: 'estimate', credits: '5.544', usd: '0.347', discount: { percentage: '45.00', credits: '4.536', usd: '0.284' } } }]);
    await expect(client.estimate('kling-video/v3.0/std/text-to-video', {})).resolves.toMatchObject({ usd: 0.347, listUsd: 0.631 });
  });

  test('a token-priced model answers with a DESCRIPTION — no number, the text is passed on', async () => {
    const text = 'For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p.';
    const { client } = make([{ status: 200, body: { type: 'description', pricing_description: text } }]);
    await expect(client.estimate('bytedance/seedance-2.5/text-to-video', {})).resolves.toEqual({
      usd: null, providerCredits: null, listUsd: null, pricingDescription: text, correlationId: null,
    });
  });

  test('estimates are retried on 5xx (no side effect at the provider)', async () => {
    const { client, calls } = make([{ status: 503 }, { status: 200, body: { credits: '1', usd: '0.1' } }]);
    await expect(client.estimate('a/b', {})).resolves.toMatchObject({ usd: 0.1 });
    expect(calls).toHaveLength(2);
  });

  test('refuses a path-like endpoint id', async () => {
    const { client, calls } = make([]);
    await expect(client.estimate('../admin', {})).rejects.toMatchObject({ code: 'bad_request' });
    expect(calls).toHaveLength(0);
  });
});

describe('submit — exactly one POST', () => {
  test('encodes the webhook URL into hf_webhook and returns the request id', async () => {
    const { client, calls } = make([{ status: 200, body: { status: 'queued', request_id: 'd7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff' }, corr: 'c9' }]);
    const hook = 'https://myavatar.ge/api/webhooks/higgsfield?job=abc&sig=x_y-z';
    const r = await client.submit('kling-video/v3.0/std/text-to-video', { prompt: 'p' }, { webhookUrl: hook });
    expect(r).toEqual({ requestId: 'd7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff', status: 'queued', correlationId: 'c9' });
    expect(calls[0]!.url).toBe(`https://api.higgsfield.ai/kling-video/v3.0/std/text-to-video?hf_webhook=${encodeURIComponent(hook)}`);
  });

  test('a TIMEOUT is ambiguous and is NOT retried — a second POST would charge twice', async () => {
    const { client, calls } = make([timeoutError(), { status: 200, body: { status: 'queued', request_id: 'r-00000001' } }]);
    const err = await client.submit('a/b', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code: 'timeout', ambiguous: true });
    expect(calls).toHaveLength(1);
  });

  test('a dropped connection is ambiguous too, and not retried', async () => {
    const { client, calls } = make([new TypeError('fetch failed'), { status: 200, body: {} }]);
    await expect(client.submit('a/b', {})).rejects.toMatchObject({ code: 'network', ambiguous: true });
    expect(calls).toHaveLength(1);
  });

  test('a 5xx on submit is NOT retried by the client either (the saga decides)', async () => {
    const { client, calls } = make([{ status: 500, body: { detail: 'boom' } }, { status: 200, body: {} }]);
    await expect(client.submit('a/b', {})).rejects.toMatchObject({ code: 'server', ambiguous: false });
    expect(calls).toHaveLength(1);
  });

  test('2xx without a readable request id → ambiguous (it probably exists)', async () => {
    const { client } = make([{ status: 200, body: { status: 'queued' } }]);
    await expect(client.submit('a/b', {})).rejects.toMatchObject({ code: 'bad_response', ambiguous: true });
  });

  test('refuses a non-https webhook', async () => {
    const { client, calls } = make([]);
    await expect(client.submit('a/b', {}, { webhookUrl: 'http://x' })).rejects.toMatchObject({ code: 'bad_request' });
    expect(calls).toHaveLength(0);
  });
});

describe('error mapping (docs/concepts/errors)', () => {
  test.each([
    [400, 'Maximum number of concurrent requests (4) has been reached', 'concurrency'],
    [400, 'Invalid parameters', 'bad_request'],
    [401, 'Invalid credentials', 'auth'],
    [403, 'Insufficient credits', 'credits_exhausted'],
    [404, 'Not found', 'model_unavailable'],
    [422, '[{"loc":["body","duration"]}]', 'validation'],
    [423, 'blocked', 'model_unavailable'],
    [503, 'disabled', 'model_unavailable'],
    [500, 'x', 'server'],
  ])('%s %s → %s', (status, detail, code) => {
    expect(mapHttpError(status, detail)).toBe(code);
  });

  test('the provider body stays OFF the enumerable error (never serialized to a client)', async () => {
    const { client } = make([{ status: 422, body: { detail: [{ loc: ['body', 'duration'], msg: 'too long' }] } }]);
    const err = (await client.submit('a/b', {}).catch((e) => e)) as ProviderError;
    expect(err.code).toBe('validation');
    expect(err.detail).toContain('too long');
    expect(JSON.stringify(err)).not.toContain('too long');
    expect(Object.keys(err)).not.toContain('detail');
  });
});

describe('status, cancel, upload', () => {
  test('status polls by id, retries a 5xx, and extracts the outputs', async () => {
    const { client, calls } = make([
      { status: 502 },
      { status: 200, body: { status: 'completed', request_id: 'r-12345678', video: { url: 'https://cdn.x/v.mp4' } } },
    ]);
    const r = await client.status('r-12345678');
    expect(r).toMatchObject({ status: 'completed', outputUrls: ['https://cdn.x/v.mp4'] });
    expect(calls.map((c) => c.url)).toEqual(['https://api.higgsfield.ai/requests/r-12345678/status', 'https://api.higgsfield.ai/requests/r-12345678/status']);
  });

  test('status refuses an id that is not an id', async () => {
    const { client } = make([]);
    await expect(client.status('../../etc')).rejects.toMatchObject({ code: 'bad_request' });
  });

  test('cancel: 202 → true, 400 (already processing) → false', async () => {
    const a = make([{ status: 202 }]);
    await expect(a.client.cancel('r-12345678')).resolves.toBe(true);
    const b = make([{ status: 400, body: { detail: 'already started' } }]);
    await expect(b.client.cancel('r-12345678')).resolves.toBe(false);
  });

  test('upload URL: only documented types; returns the headers the PUT must carry', async () => {
    const { client, calls } = make([
      { status: 200, body: { public_url: 'https://cdn.x/in.jpg', upload_url: 'https://s3.x/put', upload_headers: { 'Content-Type': 'image/jpeg', 'x-amz-tagging': 'retention=temporary' } } },
    ]);
    const u = await client.createUpload('image/jpeg');
    expect(u).toEqual({ uploadUrl: 'https://s3.x/put', publicUrl: 'https://cdn.x/in.jpg', headers: { 'Content-Type': 'image/jpeg', 'x-amz-tagging': 'retention=temporary' } });
    expect(calls[0]!.body).toEqual({ content_type: 'image/jpeg' });
    await expect(client.createUpload('application/pdf')).rejects.toMatchObject({ code: 'bad_request' });
  });
});

describe('extractOutputUrls', () => {
  test('status body and webhook payload shapes; https only; de-duplicated', () => {
    expect(extractOutputUrls({ images: [{ url: 'https://a/1.jpg' }, { url: 'https://a/2.jpg' }] })).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
    expect(extractOutputUrls({ payload: { video: { url: 'https://a/v.mp4', content_type: 'video/mp4' } } })).toEqual(['https://a/v.mp4']);
    expect(extractOutputUrls({ audio: { url: 'https://a/s.mp3' }, audios: [{ url: 'https://a/s.mp3' }] })).toEqual(['https://a/s.mp3']);
    expect(extractOutputUrls({ images: [{ url: 'http://plain/x.jpg' }, { url: 'javascript:alert(1)' }] })).toEqual([]);
    expect(extractOutputUrls(null)).toEqual([]);
  });
});
