/** @jest-environment node */
import { isAllowedAudioUrl, fetchAllowlistedAudio, type FetchLike } from './allowlistedAudioFetch';

const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://myproj.supabase.co' } as NodeJS.ProcessEnv;

describe('isAllowedAudioUrl', () => {
  it('allows HTTPS Supabase-hosted hosts', () => {
    expect(isAllowedAudioUrl('https://myproj.supabase.co/storage/v1/object/sign/x.mp3', ENV)).toBe(true);
    expect(isAllowedAudioUrl('https://abc.supabase.co/x', ENV)).toBe(true);
    expect(isAllowedAudioUrl('https://abc.supabase.in/x', ENV)).toBe(true);
  });
  it('rejects non-https, IP-literals, loopback, and non-Supabase / lookalike hosts', () => {
    expect(isAllowedAudioUrl('http://myproj.supabase.co/x', ENV)).toBe(false);   // not https
    expect(isAllowedAudioUrl('https://169.254.169.254/latest/meta-data', ENV)).toBe(false); // metadata IP
    expect(isAllowedAudioUrl('https://127.0.0.1/x', ENV)).toBe(false);
    expect(isAllowedAudioUrl('https://localhost/x', ENV)).toBe(false);
    expect(isAllowedAudioUrl('https://evil.com/x', ENV)).toBe(false);
    expect(isAllowedAudioUrl('https://supabase.co.evil.com/x', ENV)).toBe(false); // suffix trick
    expect(isAllowedAudioUrl('https://[::1]/x', ENV)).toBe(false);                // IPv6 loopback
    expect(isAllowedAudioUrl('not-a-url', ENV)).toBe(false);
  });
});

// A mock fetch that returns a scripted status/headers per URL substring.
function mockFetch(routes: { match: string; status: number; location?: string }[]): FetchLike {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    const r = routes.find((x) => u.includes(x.match));
    if (!r) return { status: 404, headers: new Headers() } as Response;
    const headers = new Headers();
    if (r.location) headers.set('location', r.location);
    return { status: r.status, headers } as Response;
  }) as unknown as FetchLike;
}

describe('fetchAllowlistedAudio — redirect-safe', () => {
  it('returns the 2xx response for a direct allowlisted URL', async () => {
    const fetchImpl = mockFetch([{ match: 'myproj.supabase.co', status: 200 }]);
    const res = await fetchAllowlistedAudio('https://myproj.supabase.co/x.mp3', { fetchImpl, env: ENV });
    expect(res?.status).toBe(200);
  });

  it('BLOCKS a redirect from an allowlisted host to an INTERNAL address (the SSRF hole)', async () => {
    const fetchImpl = mockFetch([
      { match: 'myproj.supabase.co', status: 302, location: 'https://169.254.169.254/latest/meta-data' },
      { match: '169.254.169.254', status: 200 }, // would succeed IF the guard let us follow — it must NOT
    ]);
    const res = await fetchAllowlistedAudio('https://myproj.supabase.co/x.mp3', { fetchImpl, env: ENV });
    expect(res).toBeNull(); // the redirect target fails re-validation → no fetch to the internal host
  });

  it('follows a LEGIT same-allowlist redirect (storage → CDN) and returns the 2xx', async () => {
    const fetchImpl = mockFetch([
      { match: 'myproj.supabase.co', status: 302, location: 'https://cdn.supabase.co/signed/x.mp3' },
      { match: 'cdn.supabase.co', status: 200 },
    ]);
    const res = await fetchAllowlistedAudio('https://myproj.supabase.co/x.mp3', { fetchImpl, env: ENV });
    expect(res?.status).toBe(200);
  });

  it('rejects a disallowed initial URL without any fetch', async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return { status: 200, headers: new Headers() } as Response; }) as unknown as FetchLike;
    const res = await fetchAllowlistedAudio('https://evil.com/x.mp3', { fetchImpl, env: ENV });
    expect(res).toBeNull();
    expect(called).toBe(false);
  });

  it('gives up after too many redirects', async () => {
    const fetchImpl = mockFetch([{ match: 'supabase.co', status: 302, location: 'https://loop.supabase.co/again' }]);
    const res = await fetchAllowlistedAudio('https://loop.supabase.co/x', { fetchImpl, env: ENV, maxHops: 3 });
    expect(res).toBeNull();
  });
});
