/** @jest-environment node */
// lib/pipeline/qaAgent — keepLiveClips probes caller-supplied clip URLs before the film stitch (/api/video/assemble), so the
// probe holds the same public-host rule as the ffmpeg download (lib/web/publicFetch). Fetch and DNS are injected: offline.
jest.mock('server-only', () => ({}));
import { keepLiveClips } from './qaAgent';

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];

function fakeFetch(statusFor: (url: string) => number | { status: number; location: string }) {
  const seen: Array<{ url: string; method: string }> = [];
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    seen.push({ url: u, method: String(init?.method ?? 'GET') });
    const s = statusFor(u);
    if (typeof s === 'number') return new Response(null, { status: s });
    return new Response(null, { status: s.status, headers: { location: s.location } });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

describe('keepLiveClips — the probe before the stitch', () => {
  test('a private or local host is never contacted; the clip is kept (the ffmpeg download refuses it with the same guard)', async () => {
    const { fetchImpl, seen } = fakeFetch(() => 404);
    const lookupImpl = async (host: string) =>
      host === 'inside.example' ? [{ address: '10.0.0.5', family: 4 }] : [{ address: '93.184.216.34', family: 4 }];
    const items = [
      { url: 'https://169.254.169.254/latest/meta-data/' },
      { url: 'https://inside.example/a.mp4' },
      { url: 'https://localhost/b.mp4' },
      { url: 'https://cdn.example.com/c.mp4' },
    ];
    const kept = await keepLiveClips(items, { fetchImpl, lookupImpl });
    expect(seen.map((s) => s.url)).toEqual(['https://cdn.example.com/c.mp4']);
    expect(kept.map((k) => k.url)).toEqual(items.slice(0, 3).map((i) => i.url));
  });

  test('a public clip that answers a hard 403 / 404 / 410 is dropped, a 5xx is kept, and the probe is a HEAD', async () => {
    const codes: Record<string, number> = { a: 200, b: 404, c: 500, d: 410, e: 403 };
    const { fetchImpl, seen } = fakeFetch((u) => codes[u.slice(-5, -4)] ?? 200);
    const items = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ url: `https://cdn.example.com/${k}.mp4` }));
    const kept = await keepLiveClips(items, { fetchImpl, lookupImpl: PUBLIC });
    expect(kept.map((k) => k.url)).toEqual(['https://cdn.example.com/a.mp4', 'https://cdn.example.com/c.mp4']);
    expect(new Set(seen.map((s) => s.method))).toEqual(new Set(['HEAD']));
  });

  test('a redirect to the metadata service is not followed and does not count as dead', async () => {
    const { fetchImpl, seen } = fakeFetch((u) =>
      u.includes('cdn.example.com/r') ? { status: 302, location: 'http://169.254.169.254/computeMetadata/v1/' } : 200);
    const items = [{ url: 'https://cdn.example.com/r.mp4' }, { url: 'https://cdn.example.com/ok.mp4' }];
    const kept = await keepLiveClips(items, { fetchImpl, lookupImpl: PUBLIC });
    expect(seen.map((s) => s.url)).not.toContain('http://169.254.169.254/computeMetadata/v1/');
    expect(kept).toHaveLength(2);
  });

  test('never empties a non-empty list and never probes a single clip', async () => {
    const { fetchImpl, seen } = fakeFetch(() => 404);
    const two = [{ url: 'https://cdn.example.com/x.mp4' }, { url: 'https://cdn.example.com/y.mp4' }];
    expect(await keepLiveClips(two, { fetchImpl, lookupImpl: PUBLIC })).toEqual(two);
    seen.length = 0;
    const one = [{ url: 'https://cdn.example.com/z.mp4' }];
    expect(await keepLiveClips(one, { fetchImpl, lookupImpl: PUBLIC })).toEqual(one);
    expect(seen).toHaveLength(0);
  });
});
