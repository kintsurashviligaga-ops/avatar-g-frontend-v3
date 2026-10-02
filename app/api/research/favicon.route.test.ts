/** @jest-environment node */
/**
 * The favicon proxy: ONE fixed upstream host, a validated hostname as its only input, image types only, a size cap, redirects
 * followed only to Google's image hosts — and a 204 (the UI's letter badge) for every miss.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../lib/api/rate-limit', () => ({ checkRateLimit: async () => null }));

import { NextRequest } from 'next/server';
import { GET } from './favicon/route';

const realFetch = global.fetch;
let calls: string[];
let handler: (url: string) => Response | Promise<Response>;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const img = (type = 'image/png', body: Uint8Array = PNG) => new Response(body, { status: 200, headers: { 'content-type': type } });
const get = (domain: string) => GET(new NextRequest(`https://myavatar.ge/api/research/favicon?domain=${encodeURIComponent(domain)}`));

beforeEach(() => {
  calls = [];
  handler = () => img();
  global.fetch = jest.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    return handler(String(url));
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
});

test('an icon is fetched from the ONE upstream, served with a long cache, and cached server-side (one upstream call per domain)', async () => {
  const a = await get('reuters.com');
  expect(a.status).toBe(200);
  expect(a.headers.get('content-type')).toBe('image/png');
  expect(a.headers.get('cache-control')).toContain('max-age=604800');
  expect(a.headers.get('x-content-type-options')).toBe('nosniff');
  expect(new Uint8Array(await a.arrayBuffer())).toEqual(PNG);
  await get('reuters.com');
  expect(calls).toEqual(['https://www.google.com/s2/favicons?domain=reuters.com&sz=64']);
});

test('a hostname that is not a public DNS name is a 400 and nothing is fetched', async () => {
  for (const d of ['localhost', '127.0.0.1', 'a.b/../c', 'host.com:22', '169.254.169.254', '']) expect((await get(d)).status).toBe(400);
  expect(calls).toEqual([]);
});

test('the upstream URL can never be steered: the domain is encoded, the host is fixed', async () => {
  await get('ok-site.org');
  expect(new URL(calls[0]!).host).toBe('www.google.com');
  expect(new URL(calls[0]!).pathname).toBe('/s2/favicons');
});

test.each([
  ['an HTML answer', () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })],
  ['an SVG (could carry script)', () => img('image/svg+xml')],
  ['an empty body', () => img('image/png', new Uint8Array())],
  ['an oversized image', () => img('image/png', new Uint8Array(70 * 1024))],
  ['a 404', () => new Response('nope', { status: 404 })],
  ['a network error', () => { throw new TypeError('fetch failed'); }],
])('%s → 204 (the letter badge)', async (name, h) => {
  handler = h as () => Response;
  const r = await get(`miss-${name.replace(/[^a-z]/gi, '').toLowerCase()}.org`);
  expect(r.status).toBe(204);
});

test('a redirect to Google\'s image host is followed; a redirect anywhere else is refused', async () => {
  handler = (url) => (url.includes('/s2/favicons') ? new Response(null, { status: 301, headers: { location: 'https://t1.gstatic.com/faviconV2?url=x' } }) : img());
  expect((await get('follows-ok.org')).status).toBe(200);
  expect(calls[1]).toBe('https://t1.gstatic.com/faviconV2?url=x');

  calls.length = 0;
  handler = () => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } });
  expect((await get('follows-evil.org')).status).toBe(204);
  expect(calls).toHaveLength(1); // the internal address was never requested
});
