/** @jest-environment node */
import { isAllowedAudioUrl, isOwnSupabaseUrl, readBodyWithCap, fetchAllowlistedAudio, type FetchLike } from './allowlistedAudioFetch';

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

describe('isOwnSupabaseUrl — own-project-host only (stricter than isAllowedAudioUrl)', () => {
  it('allows ONLY the app\'s own project host', () => {
    expect(isOwnSupabaseUrl('https://myproj.supabase.co/storage/v1/object/sign/x.jpg', ENV)).toBe(true);
  });
  it('rejects ANY OTHER Supabase tenant that isAllowedAudioUrl would accept', () => {
    // the attacker-tenant hole: broad suffix rule accepts these, the strict own-host rule does NOT
    expect(isAllowedAudioUrl('https://attacker.supabase.co/x', ENV)).toBe(true);
    expect(isOwnSupabaseUrl('https://attacker.supabase.co/x', ENV)).toBe(false);
    expect(isOwnSupabaseUrl('https://abc.supabase.in/x', ENV)).toBe(false);
  });
  it('rejects non-https, IP-literals, and unknown-project-host (env unset) → caller fails open', () => {
    expect(isOwnSupabaseUrl('http://myproj.supabase.co/x', ENV)).toBe(false);
    expect(isOwnSupabaseUrl('https://169.254.169.254/x', ENV)).toBe(false);
    expect(isOwnSupabaseUrl('https://myproj.supabase.co/x', {} as NodeJS.ProcessEnv)).toBe(false); // no project host known
    expect(isOwnSupabaseUrl('not-a-url', ENV)).toBe(false);
  });
});

// Build a Response whose body streams the given chunks (models a real fetch ReadableStream body).
function streamResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  let i = 0;
  let cancelled = false;
  const body = {
    getReader() {
      return {
        read: async () => (cancelled || i >= chunks.length) ? { done: true, value: undefined } : { done: false, value: chunks[i++] },
        cancel: async () => { cancelled = true; },
      };
    },
  };
  return { headers: new Headers(headers), body, arrayBuffer: async () => Buffer.concat(chunks) } as unknown as Response;
}

describe('readBodyWithCap — hard byte cap DURING download', () => {
  it('returns the full buffer when under the cap', async () => {
    const res = streamResponse([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]);
    const buf = await readBodyWithCap(res, 1000);
    expect(buf).not.toBeNull();
    expect(buf!.byteLength).toBe(5);
  });
  it('aborts and returns null once the streamed total exceeds the cap (no Content-Length / chunked)', async () => {
    // three 4-byte chunks = 12 bytes; cap 8 → must bail mid-stream, never buffering the whole thing
    const res = streamResponse([new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)]);
    const buf = await readBodyWithCap(res, 8);
    expect(buf).toBeNull();
  });
  it('fast-rejects on an honest oversized Content-Length without reading the body', async () => {
    let read = false;
    const res = { headers: new Headers({ 'content-length': String(50_000_000) }),
      body: { getReader() { return { read: async () => { read = true; return { done: true, value: undefined }; }, cancel: async () => {} }; } },
    } as unknown as Response;
    const buf = await readBodyWithCap(res, 12_000_000);
    expect(buf).toBeNull();
    expect(read).toBe(false);
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
