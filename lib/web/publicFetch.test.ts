/** @jest-environment node */
// lib/web/publicFetch — the SSRF rules for every caller-chosen fetch (Master Task §31). The address rule and the redirect
// walk run offline (fetch + DNS injected); the pinned connection runs against a real local server through its lookup.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { createGuardedLookup, fetchPublic, fetchPublicBytes, isPrivateAddress, pinnedFetch } from './publicFetch';

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];

describe('isPrivateAddress — every form that can point inside', () => {
  test.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '192.0.0.8', '192.0.2.1', '198.51.100.7', '203.0.113.9', '300.1.1.1',
    '::', '::1', '[::1]', 'fe80::1%eth0', 'fc00::1', 'fd12:3456::1', 'ff02::1', 'fec0::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:0a00:0001',
    '::127.0.0.1', '::7f00:1',
    '2002:7f00:1::1', '2002:a9fe:a9fe::',
    '2001:0:4136:e378::1', '2001:db8::1', '64:ff9b::7f00:1', '64:ff9b:1::1', '100::1',
    'not-an-address', '1:2:3', '1::2::3',
  ])('%s is refused', (a) => expect(isPrivateAddress(a)).toBe(true));

  test.each(['93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5', '::ffff:8.8.8.8', '2002:0808:0808::1'])('%s is public', (a) => {
    expect(isPrivateAddress(a)).toBe(false);
  });
});

describe('fetchPublic — the walk', () => {
  test('a public page that redirects to the metadata service is refused at the hop, never fetched', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (u: string) => {
      seen.push(u);
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/computeMetadata/v1/' } });
    }) as unknown as typeof fetch;
    const r = await fetchPublic('https://example.com/a', { fetchImpl, lookupImpl: PUBLIC });
    expect(r).toEqual({ ok: false, error: 'blocked_host' });
    expect(seen).toEqual(['https://example.com/a']);
  });

  test('a name that resolves to a private address is refused before any fetch', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const r = await fetchPublic('https://rebind.example/', { fetchImpl, lookupImpl: async () => [{ address: '10.0.0.5', family: 4 }] });
    expect(r).toEqual({ ok: false, error: 'blocked_host' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a connection refused by the pinned lookup reads as blocked_host', async () => {
    const fetchImpl = (async () => { throw Object.assign(new Error('x'), { cause: { code: 'EBLOCKEDHOST' } }); }) as unknown as typeof fetch;
    expect(await fetchPublic('https://example.com/', { fetchImpl, lookupImpl: PUBLIC })).toEqual({ ok: false, error: 'blocked_host' });
  });

  test('hops are capped and credentials never ride along', async () => {
    const inits: RequestInit[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      inits.push(init);
      return new Response(null, { status: 301, headers: { location: '/again' } });
    }) as unknown as typeof fetch;
    expect(await fetchPublic('https://example.com/', { fetchImpl, lookupImpl: PUBLIC, maxHops: 2 })).toEqual({ ok: false, error: 'too_many_redirects' });
    expect(inits).toHaveLength(3);
    for (const i of inits) { expect(i.redirect).toBe('manual'); expect(i.credentials).toBe('omit'); }
  });

  test('localhost, IPv6 literals and embedded credentials are invalid before DNS', async () => {
    for (const u of ['http://localhost/', 'http://[::1]/', 'https://bank.ge@evil.example/', 'file:///etc/passwd']) {
      const r = await fetchPublic(u, { fetchImpl: jest.fn() as unknown as typeof fetch, lookupImpl: PUBLIC });
      expect(r.ok).toBe(false);
    }
  });

  test('fetchPublicBytes keeps the type rule and the cap', async () => {
    const fetchImpl = (async () => new Response('x'.repeat(50), { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    expect(await fetchPublicBytes('https://example.com/f.jpg', { fetchImpl, lookupImpl: PUBLIC, maxBytes: 10, accept: /^image\// })).toEqual({ ok: false, error: 'wrong_type' });
    const img = (async () => new Response(new Uint8Array(50), { status: 200, headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
    expect(await fetchPublicBytes('https://example.com/f.jpg', { fetchImpl: img, lookupImpl: PUBLIC, maxBytes: 10, accept: /^image\// })).toEqual({ ok: false, error: 'too_large' });
    const ok = await fetchPublicBytes('https://example.com/f.jpg', { fetchImpl: img, lookupImpl: PUBLIC, maxBytes: 100, accept: /^image\// });
    expect(ok.ok && ok.bytes.length).toBe(50);
  });

  test("the caller's own rule holds on every hop: a redirect onto a refused address stops there, unfetched", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (u: string) => {
      seen.push(u);
      return new Response(null, { status: 302, headers: { location: 'https://www.youtube.com/watch?v=x' } });
    }) as unknown as typeof fetch;
    const allowUrl = (u: string) => !/youtube\.com/.test(new URL(u).hostname);
    expect(await fetchPublic('https://short.example/abc', { fetchImpl, lookupImpl: PUBLIC, allowUrl })).toEqual({
      ok: false, error: 'refused_url', url: 'https://www.youtube.com/watch?v=x',
    });
    expect(seen).toEqual(['https://short.example/abc']);
    const never = jest.fn() as unknown as typeof fetch;
    expect(await fetchPublic('https://youtube.com/a', { fetchImpl: never, lookupImpl: PUBLIC, allowUrl })).toMatchObject({ ok: false, error: 'refused_url' });
    expect(never).not.toHaveBeenCalled();
  });

  test('HEAD asks for the headers only; the default is GET', async () => {
    const methods: Array<string | undefined> = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      methods.push(init.method);
      return new Response(null, { status: 200, headers: { 'content-type': 'video/mp4' } });
    }) as unknown as typeof fetch;
    await fetchPublic('https://example.com/a.mp4', { fetchImpl, lookupImpl: PUBLIC, method: 'HEAD' });
    await fetchPublic('https://example.com/a.mp4', { fetchImpl, lookupImpl: PUBLIC });
    expect(methods).toEqual(['HEAD', undefined]);
  });
});

describe('pinnedFetch — the connection goes through the guarded lookup', () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/gz') {
        res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
        res.end(zlib.gzipSync('hello, decoded'));
        return;
      }
      if (req.url === '/redirect') { res.writeHead(302, { location: '/elsewhere' }); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/plain', 'x-seen-cookie': String(req.headers.cookie ?? '') });
      res.end('plain');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const toLoopback = (_h: string, _o: unknown, cb: (e: NodeJS.ErrnoException | null, a: Array<{ address: string; family: number }>) => void) =>
    cb(null, [{ address: '127.0.0.1', family: 4 }]);

  test('a name that resolves privately at connect time is refused (the rebinding case)', async () => {
    const f = pinnedFetch(createGuardedLookup(toLoopback));
    await expect(f(`http://rebind.example:${port}/`)).rejects.toMatchObject({ code: 'EBLOCKEDHOST' });
  });

  test('an allowed address connects, sends no cookie, decodes gzip and does not follow redirects', async () => {
    const f = pinnedFetch(createGuardedLookup(toLoopback, () => true));
    const plain = await f(`http://allowed.example:${port}/`);
    expect(await plain.text()).toBe('plain');
    expect(plain.headers.get('x-seen-cookie')).toBe('');
    const gz = await f(`http://allowed.example:${port}/gz`);
    expect(await gz.text()).toBe('hello, decoded');
    const redir = await f(`http://allowed.example:${port}/redirect`);
    expect(redir.status).toBe(302);
    expect(redir.headers.get('location')).toBe('/elsewhere');
  });

  test('it only reads', async () => {
    const f = pinnedFetch(createGuardedLookup(toLoopback, () => true));
    await expect(f(`http://allowed.example:${port}/`, { method: 'POST' })).rejects.toThrow(/only reads/);
  });
});
