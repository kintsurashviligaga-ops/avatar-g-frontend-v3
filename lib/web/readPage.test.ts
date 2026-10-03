/** @jest-environment node */
// lib/web/readPage — the voice agent's page reader. Every SSRF rule is tested offline (fetch + DNS injected).

import { decodeEntities, extractPage, isPrivateAddress, readWebPage } from './readPage';

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];
const html = (body: string, head = '<title>Tbilisi — News</title><meta name="description" content="Today &amp; tomorrow">') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const ok = (text: string, type = 'text/html; charset=utf-8') =>
  new Response(text, { status: 200, headers: { 'content-type': type } });

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fc00::1', 'fd12::3', 'fe80::1', '::ffff:10.0.0.1', '64:ff9b::a00:1', 'not-an-ip'])('%s is not public', (a) => {
    expect(isPrivateAddress(a)).toBe(true);
  });
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8'])('%s is public', (a) => {
    expect(isPrivateAddress(a)).toBe(false);
  });
});

describe('readWebPage', () => {
  it('reads the title, description, main text and links — resolved against the page', async () => {
    const fetchImpl = jest.fn(async () => ok(html(`
      <nav><a href="/menu">Menu</a></nav>
      <main><h1>Weather</h1><p>Sunny in Tbilisi.</p><ul><li>Mon</li><li>Tue</li></ul>
        <a href="/forecast?d=1">Forecast &raquo;</a><a href="javascript:alert(1)">bad</a><a href="#top">top</a></main>
      <script>alert('x')</script>`)));
    const r = await readWebPage('https://example.ge/weather', { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: PUBLIC });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.page).toMatchObject({ url: 'https://example.ge/weather', title: 'Tbilisi — News', description: 'Today & tomorrow', truncated: false });
    expect(r.page.text).toContain('## Weather');
    expect(r.page.text).toContain('Sunny in Tbilisi.');
    expect(r.page.text).toContain('• Mon');
    expect(r.page.text).not.toContain('alert');
    expect(r.page.links).toEqual(expect.arrayContaining([{ text: 'Forecast »', url: 'https://example.ge/forecast?d=1' }]));
    expect(r.page.links.some((l) => l.url.startsWith('javascript'))).toBe(false);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toMatchObject({ redirect: 'manual', credentials: 'omit' });
  });

  it('refuses a private address, and a public NAME that resolves to one (DNS rebinding) — without fetching', async () => {
    const fetchImpl = jest.fn();
    expect(await readWebPage('http://10.0.0.5/', { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: PUBLIC })).toEqual({ ok: false, error: 'invalid_url' });
    expect(await readWebPage('https://rebind.example.com/', {
      fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }],
    })).toEqual({ ok: false, error: 'blocked_host' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('follows a redirect by hand and re-checks it — a hop into the private network is refused', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://good.example.com/b' } }))
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/latest/meta-data' } }));
    const r = await readWebPage('https://good.example.com/a', { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: PUBLIC });
    expect(r).toEqual({ ok: false, error: 'blocked_host' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stops after too many redirects', async () => {
    const fetchImpl = jest.fn(async () => new Response(null, { status: 302, headers: { location: 'https://loop.example.com/' } }));
    expect(await readWebPage('https://loop.example.com/', { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: PUBLIC, maxHops: 2 }))
      .toEqual({ ok: false, error: 'too_many_redirects' });
  });

  it('reads only pages: a file is refused; an error status is reported; a huge body is cut off', async () => {
    const pdf = jest.fn(async () => ok('%PDF', 'application/pdf'));
    expect(await readWebPage('https://x.example.com/a.pdf', { fetchImpl: pdf as unknown as typeof fetch, lookupImpl: PUBLIC })).toMatchObject({ ok: false, error: 'not_html' });
    const err = jest.fn(async () => new Response('no', { status: 403, headers: { 'content-type': 'text/html' } }));
    expect(await readWebPage('https://x.example.com/', { fetchImpl: err as unknown as typeof fetch, lookupImpl: PUBLIC })).toEqual({ ok: false, error: 'http_error', status: 403 });
    const big = jest.fn(async () => ok('x'.repeat(5000)));
    expect(await readWebPage('https://x.example.com/', { fetchImpl: big as unknown as typeof fetch, lookupImpl: PUBLIC, maxBytes: 1000 })).toEqual({ ok: false, error: 'too_large' });
  });

  it('plain text is read as is, and long text is truncated with a mark', async () => {
    const t = jest.fn(async () => ok('a'.repeat(100), 'text/plain'));
    const r = await readWebPage('https://x.example.com/r.txt', { fetchImpl: t as unknown as typeof fetch, lookupImpl: PUBLIC, maxText: 10 });
    expect(r).toMatchObject({ ok: true, page: { truncated: true, text: `${'a'.repeat(10)} …` } });
  });

  it('a network failure and a timeout are told apart', async () => {
    const down = jest.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await readWebPage('https://x.example.com/', { fetchImpl: down as unknown as typeof fetch, lookupImpl: PUBLIC })).toEqual({ ok: false, error: 'fetch_failed' });
    const slow = jest.fn(async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; });
    expect(await readWebPage('https://x.example.com/', { fetchImpl: slow as unknown as typeof fetch, lookupImpl: PUBLIC })).toEqual({ ok: false, error: 'timeout' });
  });
});

describe('extractPage / decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &#8212; &#x10D0; &unknown;')).toBe('a & b — ა &unknown;');
  });
  it('falls back to the body without its chrome when there is no main', () => {
    const p = extractPage(html('<header>Logo</header><div>Body text here</div><footer>© 2026</footer>'), 'https://x.example.com/', 1000, 10);
    expect(p.text).toBe('Body text here');
  });
});
