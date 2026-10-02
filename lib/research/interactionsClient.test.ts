/** @jest-environment node */
/**
 * The Interactions client with an injected fetch (no network): the request contract, the key never in a URL, redirects
 * never followed, ONE start POST whatever happens, every doubtful start outcome flagged ambiguous, error bodies key-redacted.
 */
jest.mock('server-only', () => ({}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInteractionsClient, startBody, INTERACTIONS_BASE } from './interactionsClient';

const KEY = 'AQ.test-key-1234567890';
const fx = (n: string) => readFileSync(join(__dirname, '__fixtures__', n), 'utf8');
const json = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });

function harness(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  });
  return { calls, client: createInteractionsClient({ fetch: f as unknown as typeof fetch, apiKey: KEY }) };
}

describe('the start request', () => {
  test('is exactly the verified Deep Research contract', () => {
    expect(startBody({ agent: 'deep-research-preview-04-2026', input: 'Compare X and Y' })).toEqual({
      agent: 'deep-research-preview-04-2026',
      input: 'Compare X and Y',
      background: true,
      store: true,
      agent_config: { type: 'deep-research', thinking_summaries: 'auto', visualization: 'off', collaborative_planning: false },
      tools: [{ type: 'google_search' }, { type: 'url_context' }],
    });
  });

  test('POSTs once to /v1beta/interactions with the key in the HEADER, redirect: manual, no key in the URL', async () => {
    const { client, calls } = harness(() => json(fx('interaction-create.json')));
    const out = await client.start({ agent: 'deep-research-preview-04-2026', input: 'q' });
    expect(out).toEqual({ ok: true, id: 'v1_ChdkZWVwLXJlc2VhcmNoLWZpeHR1cmU' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(INTERACTIONS_BASE);
    expect(calls[0]!.url).not.toMatch(/key=/i);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.redirect).toBe('manual');
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ background: true, store: true, agent: 'deep-research-preview-04-2026' });
    expect(String(calls[0]!.init.body)).not.toContain(KEY);
  });

  test('no configured key → not_configured, and nothing is sent', async () => {
    const f = jest.fn();
    const client = createInteractionsClient({ fetch: f as unknown as typeof fetch, apiKey: '' });
    const prev = { a: process.env.GEMINI_API_KEY, b: process.env.GOOGLE_GENERATIVE_AI_API_KEY, c: process.env.GEMINI_API_KEYS };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    try {
      expect(await client.start({ agent: 'a', input: 'q' })).toMatchObject({ ok: false, failure: 'not_configured', ambiguous: false });
      expect(f).not.toHaveBeenCalled();
    } finally {
      if (prev.a !== undefined) process.env.GEMINI_API_KEY = prev.a;
      if (prev.b !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = prev.b;
      if (prev.c !== undefined) process.env.GEMINI_API_KEYS = prev.c;
    }
  });
});

describe('every start outcome that could have created a run is AMBIGUOUS — and nothing is ever re-sent', () => {
  test.each([
    ['a network error', () => { throw new TypeError('fetch failed'); }],
    ['a timeout', () => { throw new DOMException('timed out', 'TimeoutError'); }],
    ['a 500', () => json('{"error":{"message":"internal"}}', 500)],
    ['a 503', () => json('{"error":{"message":"unavailable"}}', 503)],
    ['a 200 with no id', () => json('{"status":"in_progress"}')],
    ['a 200 with an unusable id', () => json('{"id":"../../etc"}')],
    ['a 200 that is not JSON', () => new Response('<html>', { status: 200 })],
    ['a redirect', () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })],
  ])('%s → ambiguous, ONE request', async (_name, handler) => {
    const { client, calls } = harness(handler as () => Response);
    const out = await client.start({ agent: 'a', input: 'q' });
    expect(out.ok).toBe(false);
    expect(out).toMatchObject({ ambiguous: true });
    expect(calls).toHaveLength(1);
  });

  test('a 400 is a definite refusal (provider_rejected), 429 and 402 map to their classes', async () => {
    expect(await harness(() => json('{"error":{"message":"Invalid input"}}', 400)).client.start({ agent: 'a', input: 'q' })).toMatchObject({ ok: false, ambiguous: false, failure: 'provider_rejected', status: 400 });
    expect(await harness(() => json('{"error":{"message":"Resource has been exhausted"}}', 429)).client.start({ agent: 'a', input: 'q' })).toMatchObject({ ambiguous: false, failure: 'provider_rate_limited' });
    expect(await harness(() => json('{"error":{"message":"billing account required"}}', 402)).client.start({ agent: 'a', input: 'q' })).toMatchObject({ ambiguous: false, failure: 'provider_unfunded' });
    expect(await harness(() => json('{"error":{"message":"API key not valid"}}', 403)).client.start({ agent: 'a', input: 'q' })).toMatchObject({ ambiguous: false, failure: 'provider_unavailable' });
  });

  test('an error body that echoes the key is redacted and bounded', async () => {
    const { client } = harness(() => json(`{"error":{"message":"bad key ${KEY} ${'x'.repeat(2_000)}"}}`, 400));
    const out = await client.start({ agent: 'a', input: 'q' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.detail).not.toContain(KEY);
      expect(out.detail).toContain('[redacted]');
      expect(out.detail.length).toBeLessThan(500);
    }
  });
});

describe('poll', () => {
  test('GETs /interactions/{id} with the header key and parses the answer', async () => {
    const { client, calls } = harness(() => json(fx('interaction-completed-steps.json')));
    const out = await client.poll('v1_ChdkZWVwLXJlc2VhcmNoLWZpeHR1cmU');
    expect(out.ok && out.parsed.status).toBe('completed');
    expect(calls[0]!.url).toBe(`${INTERACTIONS_BASE}/v1_ChdkZWVwLXJlc2VhcmNoLWZpeHR1cmU`);
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.init.redirect).toBe('manual');
    expect(calls[0]!.url).not.toMatch(/key=/i);
  });

  test('a path-escaping id never reaches the network', async () => {
    const { client, calls } = harness(() => json('{}'));
    for (const bad of ['../x', 'a/b', 'a b', 'ab', 'x'.repeat(600), '']) {
      expect(await client.poll(bad)).toMatchObject({ ok: false, kind: 'not_found' });
    }
    expect(calls).toHaveLength(0);
  });

  test.each([
    [404, 'not_found'], [410, 'not_found'], [401, 'auth'], [403, 'auth'], [429, 'transient'], [500, 'transient'], [503, 'transient'], [418, 'transient'],
  ])('HTTP %i → %s', async (status, kind) => {
    const { client } = harness(() => json('{"error":{"message":"x"}}', status));
    expect(await client.poll('abcd1234')).toMatchObject({ ok: false, kind });
  });

  test('a network error and an unreadable body are transient (never a failure of the job)', async () => {
    expect(await harness(() => { throw new TypeError('fetch failed'); }).client.poll('abcd1234')).toMatchObject({ ok: false, kind: 'transient' });
    expect(await harness(() => new Response('not json', { status: 200 })).client.poll('abcd1234')).toMatchObject({ ok: false, kind: 'transient' });
  });
});

describe('cancel', () => {
  test('POSTs /interactions/{id}/cancel and returns the interaction', async () => {
    const { client, calls } = harness(() => json(fx('interaction-cancelled.json')));
    const out = await client.cancel('abcd1234');
    expect(out.ok && out.parsed.status).toBe('cancelled');
    expect(calls[0]!.url).toBe(`${INTERACTIONS_BASE}/abcd1234/cancel`);
    expect(calls[0]!.init.method).toBe('POST');
  });

  test.each([[404, 'not_found'], [400, 'not_running'], [409, 'not_running'], [500, 'transient'], [429, 'transient'], [403, 'transient']])('HTTP %i → %s', async (status, kind) => {
    const { client } = harness(() => json('{}', status));
    expect(await client.cancel('abcd1234')).toMatchObject({ ok: false, kind });
  });

  test('a network error is transient', async () => {
    expect(await harness(() => { throw new Error('boom'); }).client.cancel('abcd1234')).toMatchObject({ ok: false, kind: 'transient' });
  });
});
