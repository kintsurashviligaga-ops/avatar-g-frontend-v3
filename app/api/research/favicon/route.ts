/**
 * GET /api/research/favicon?domain=example.com — a source's favicon, fetched BY US so the user's browser never tells a third
 * party which pages a report cited (lib/research/favicon.ts says why). 200 an image · 204 "no icon" (the UI draws a letter
 * badge) · 400 a hostname that is not a public DNS name. IP-rate-limited; a small in-memory cache spares the upstream.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { FAVICON_IMAGE_TYPES, FAVICON_MAX_BYTES, FAVICON_UPSTREAM, isAllowedFaviconRedirect, validFaviconDomain } from '@/lib/research/favicon';
import { RESEARCH_FAVICON_IP } from '@/lib/research/rateLimits';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const cache = new Map<string, { at: number; type: string; body: Uint8Array | null }>();
const HIT_TTL = 24 * 60 * 60_000;
const MISS_TTL = 60 * 60_000;
const CACHE_MAX = 500;
const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=3600' } });

async function fetchIcon(domain: string): Promise<{ type: string; body: Uint8Array } | null> {
  let url = `${FAVICON_UPSTREAM}?domain=${encodeURIComponent(domain)}&sz=64`;
  for (let hop = 0; hop < 3; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(4_000), headers: { Accept: 'image/*' } });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') ?? '';
      await res.body?.cancel().catch(() => undefined);
      if (!isAllowedFaviconRedirect(loc, url)) return null;
      url = new URL(loc, url).toString();
      continue;
    }
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!FAVICON_IMAGE_TYPES.has(type)) return null;
    const buf = new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
    if (buf.byteLength === 0 || buf.byteLength > FAVICON_MAX_BYTES) return null;
    return { type, body: buf };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, RESEARCH_FAVICON_IP);
  if (limited) return limited;
  const domain = validFaviconDomain(new URL(req.url).searchParams.get('domain'));
  if (!domain) return NextResponse.json({ error: 'invalid_domain' }, { status: 400 });

  const now = Date.now();
  const hit = cache.get(domain);
  if (hit && now - hit.at < (hit.body ? HIT_TTL : MISS_TTL)) {
    return hit.body ? new NextResponse(hit.body as unknown as BodyInit, { headers: { 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff' } }) : noContent();
  }
  const icon = await fetchIcon(domain);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(domain, { at: now, type: icon?.type ?? '', body: icon?.body ?? null });
  if (!icon) return noContent();
  return new NextResponse(icon.body as unknown as BodyInit, { headers: { 'Content-Type': icon.type, 'Cache-Control': 'public, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
