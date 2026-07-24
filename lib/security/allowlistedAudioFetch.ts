/**
 * lib/security/allowlistedAudioFetch.ts
 * ====================================
 * SSRF-safe fetch for server-side audio retrieval (the photo-to-music-video route). Two guards:
 *   • isAllowedAudioUrl — only HTTPS Supabase-hosted hosts (where our generated tracks live); IP-literal /
 *     loopback / lookalike hosts are rejected.
 *   • fetchAllowlistedAudio — follows redirects MANUALLY, re-validating EVERY hop against the allowlist, so an
 *     allowlisted host that 3xx-redirects to an internal address (metadata/loopback/RFC-1918) is never
 *     followed. A default `fetch` follows redirects transparently, which would make validating only the
 *     initial URL an SSRF hole.
 *
 * Pure + fetch-injectable (no server-only) so the guard + the redirect walk are unit-testable.
 */
export type FetchLike = typeof fetch;

/** True iff `raw` is an HTTPS URL on a Supabase-hosted host (project host or *.supabase.co / *.supabase.in). */
export function isAllowedAudioUrl(raw: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  // Reject IP-literal / loopback / IPv6-bracket hosts outright.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost' || host.endsWith('.local') || host.includes(':')) return false;
  let projectHost = '';
  try { projectHost = new URL(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').hostname.toLowerCase(); } catch { /* unset */ }
  if (projectHost && host === projectHost) return true;
  return host.endsWith('.supabase.co') || host.endsWith('.supabase.in');
}

/**
 * STRICTER than isAllowedAudioUrl: true ONLY for an HTTPS URL on the app's OWN Supabase project host (exact
 * hostname match against NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL). Use this where the URL is user-supplied AND we
 * must fetch only content WE hosted — e.g. server-side vision on a user's reference photo — so a caller cannot point
 * us at an arbitrary OTHER Supabase tenant's `*.supabase.co` bucket (which isAllowedAudioUrl's suffix rule allows).
 * Returns false when the project host is unknown (env unset) → the caller fails open (skips the fetch entirely).
 */
export function isOwnSupabaseUrl(raw: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  let projectHost = '';
  try { projectHost = new URL(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').hostname.toLowerCase(); } catch { /* unset */ }
  return !!projectHost && u.hostname.toLowerCase() === projectHost;
}

/**
 * SAFE SSRF pre-check for a server-side fetch of a caller-influenced URL. True ONLY for an http(s) URL
 * whose host is not an obvious internal-network target: localhost, a `.local` mDNS name, an IPv6 literal,
 * or an IPv4 literal in a loopback / private / link-local / metadata / multicast range. Unlike
 * isAllowedAudioUrl this does NOT restrict to an allowlist — it only blocks the well-known SSRF targets,
 * so legitimate PUBLIC external URLs keep working (the conservative subset; a full host allowlist is the
 * stricter, separate guard). CAVEAT: validates only THIS url — for redirect-following fetches a public
 * host can still 3xx into a private one, so pair with redirect:'manual' + per-hop re-check when that matters.
 */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) return false;
  if (host.includes(':')) return false; // IPv6 literal (hostname is unbracketed) → block ::1 / fc00::/7 / fe80::/10
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return false;        // this-host / loopback / private
    if (a === 169 && b === 254) return false;                  // link-local incl. cloud metadata 169.254.169.254
    if (a === 192 && b === 168) return false;                  // private
    if (a === 172 && b >= 16 && b <= 31) return false;         // private
    if (a >= 224) return false;                                // multicast / reserved
  }
  return true;
}

/**
 * Read a fetched Response body into a Buffer with a HARD byte cap enforced DURING the download, not after. An honest
 * Content-Length over the cap short-circuits with no body read; otherwise the body is streamed and the read is
 * aborted the instant the running total exceeds `maxBytes` (this also defeats chunked responses with no
 * Content-Length). Returns null on over-cap / read error. Bounds peak memory to ~maxBytes + one chunk, so a
 * malicious host streaming gigabytes to an unauthenticated route can never OOM the server.
 */
export async function readBodyWithCap(res: Response, maxBytes: number): Promise<Buffer | null> {
  const cl = Number(res.headers.get('content-length'));
  if (Number.isFinite(cl) && cl > maxBytes) return null; // fast reject on an honest oversized Content-Length
  const body = res.body as ReadableStream<Uint8Array> | null;
  if (!body || typeof body.getReader !== 'function') {
    // No stream (e.g. a mock/undici edge case) — fall back to a bounded read; CL was already checked ≤ cap or absent.
    try { const buf = Buffer.from(await res.arrayBuffer()); return buf.byteLength <= maxBytes ? buf : null; }
    catch { return null; }
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength) {
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel().catch(() => {}); return null; } // abort the download mid-stream
        chunks.push(value);
      }
    }
  } catch { try { await reader.cancel(); } catch { /* already closed */ } return null; }
  return Buffer.concat(chunks, total);
}

export interface AllowlistedFetchOpts { fetchImpl?: FetchLike; timeoutMs?: number; maxHops?: number; env?: NodeJS.ProcessEnv }

/**
 * Fetch `url`, following up to `maxHops` redirects MANUALLY and re-validating each hop against
 * isAllowedAudioUrl. Returns the first 2xx Response, or null (disallowed host at any hop / no Location on a
 * 3xx / non-2xx terminal / too many redirects / network error). Never transparently follows a redirect.
 */
export async function fetchAllowlistedAudio(url: string, opts: AllowlistedFetchOpts = {}): Promise<Response | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const maxHops = opts.maxHops ?? 3;
  const env = opts.env ?? process.env;
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    if (!isAllowedAudioUrl(current, env)) return null;
    const res = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      try { current = new URL(loc, current).toString(); } catch { return null; }
      continue;
    }
    return res.status >= 200 && res.status < 300 ? res : null;
  }
  return null; // too many redirects
}
