/**
 * lib/web/publicFetch.ts — the ONE way server code fetches an address a caller or a model chose (Master Task §31).
 *
 * A server-side fetch of a caller-chosen URL is an SSRF door: the caller points it at 127.0.0.1, at the cloud metadata
 * service (169.254.169.254, metadata.google.internal), at a private network — or at a public name that redirects there,
 * or that RESOLVES there (DNS rebinding: public when we check, private when we connect). So every rule applies at once:
 *
 *   • the address must pass validateLiveUrl (http/https, no credentials, no localhost / local names / private IPv4
 *     literals, no IPv6 literals) — the same rule the voice agent's open_url uses;
 *   • its host must RESOLVE only to public addresses (isPrivateAddress — v4 and every v6 form that can carry a v4);
 *   • redirects are followed BY HAND, each hop re-checked the same way, at most `maxHops`;
 *   • the connection itself is PINNED: `pinnedFetch` connects through a DNS lookup that refuses a private answer at the
 *     moment of connecting, so a name that flips between our check and the fetch is still refused (the check above
 *     only gives a clear error early);
 *   • bodies are read under a hard byte cap during the download (readBodyWithCap), within one deadline;
 *   • nothing of ours rides along: no cookies, no credentials.
 *
 * `fetchImpl` / `lookupImpl` are injectable so the rules are unit-tested offline. Never throws.
 */
import { lookup as dnsLookupCb, type LookupAddress } from 'node:dns';
import { createWriteStream } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { Readable, Transform, pipeline } from 'node:stream';
import { pipeline as pipelineAsync } from 'node:stream/promises';
import zlib from 'node:zlib';
import { readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';
import { validateLiveUrl } from '@/lib/voice/liveTools';

// ── addresses ────────────────────────────────────────────────────────────────────────────────────────────────────────

function v4IsPrivate(o: readonly number[]): boolean {
  const [p, q, r] = o as [number, number, number, number];
  return p === 0 || p === 10 || p === 127 || p >= 224
    || (p === 100 && q >= 64 && q <= 127) // CGNAT
    || (p === 169 && q === 254) // link-local, cloud metadata
    || (p === 172 && q >= 16 && q <= 31)
    || (p === 192 && q === 168)
    || (p === 192 && q === 0 && (r === 0 || r === 2)) // IETF assignments, TEST-NET-1
    || (p === 198 && (q === 18 || q === 19)) // benchmarking
    || (p === 198 && q === 51 && r === 100) || (p === 203 && q === 0 && r === 113); // TEST-NET-2/3
}

/** "::ffff:7f00:1" → its eight 16-bit groups, or null when it is not an IPv6 address. Accepts a dotted v4 tail. */
function expandV6(raw: string): number[] | null {
  let s = raw.replace(/^\[|\]$/g, '').split('%')[0]!;
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (tail) {
    const n = tail.slice(1).map(Number);
    if (n.some((x) => x > 255)) return null;
    s = `${s.slice(0, tail.index)}${((n[0]! << 8) | n[1]!).toString(16)}:${((n[2]! << 8) | n[3]!).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * Any address in a loopback, private, link-local, CGNAT, multicast, documentation or otherwise non-public range — v4 or
 * v6, including every v6 form that carries a v4 inside it (mapped „::ffff:7f00:1", compatible „::127.0.0.1", 6to4
 * „2002:7f00:1::", NAT64) and Teredo. Anything it cannot read is treated as private: refused.
 */
export function isPrivateAddress(address: string): boolean {
  const a = address.trim().toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (v4) {
    const o = v4.slice(1).map(Number);
    return o.some((x) => x > 255) || v4IsPrivate(o);
  }
  if (!a.includes(':')) return true;
  const g = expandV6(a);
  if (!g) return true;
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  const v4of = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  if (zeros(8)) return true; // ::
  if (zeros(7) && g[7] === 1) return true; // ::1
  if (zeros(5) && g[5] === 0xffff) return v4IsPrivate(v4of(g[6]!, g[7]!)); // ::ffff:a.b.c.d
  if (zeros(6)) return v4IsPrivate(v4of(g[6]!, g[7]!)); // ::a.b.c.d (deprecated compatible form)
  if (g[0] === 0x2002) return v4IsPrivate(v4of(g[1]!, g[2]!)); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo — tunnels to anywhere
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64 (well-known and local-use)
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only 100::/64
  const top = g[0]!;
  if ((top & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((top & 0xffc0) === 0xfe80 || (top & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((top & 0xff00) === 0xff00) return true; // multicast
  return false;
}

type LookupFn = (host: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = (host) => new Promise((resolve, reject) => {
  dnsLookupCb(host, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs)));
});

/** True when `host` is a public IPv4 literal or a name that resolves ONLY to public addresses. */
export async function hostIsPublic(host: string, lookupFn: LookupFn = defaultLookup): Promise<boolean> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return !isPrivateAddress(host);
  try {
    const addrs = await lookupFn(host);
    return addrs.length > 0 && addrs.every((x) => !isPrivateAddress(x.address));
  } catch {
    return false;
  }
}

// ── the pinned connection ───────────────────────────────────────────────────────────────────────────────────────────

type ResolveCb = (host: string, opts: { all: true; verbatim: true }, cb: (err: NodeJS.ErrnoException | null, addrs: LookupAddress[]) => void) => void;
type NodeLookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

export const BLOCKED_HOST_CODE = 'EBLOCKEDHOST';

/**
 * A `lookup` for node:http(s) that resolves the name itself and REFUSES the connection when any answer is private.
 * Because it runs when the socket connects, the address we check is the address we connect to (no rebinding window).
 */
export function createGuardedLookup(resolve: ResolveCb = dnsLookupCb as unknown as ResolveCb, allow: (address: string) => boolean = (x) => !isPrivateAddress(x)) {
  return (hostname: string, options: unknown, callback: NodeLookupCb): void => {
    const all = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true;
    resolve(hostname, { all: true, verbatim: true }, (err, addrs) => {
      if (err) { callback(err, ''); return; }
      if (!addrs?.length || addrs.some((x) => !allow(x.address))) {
        const e = new Error(`blocked host: ${hostname}`) as NodeJS.ErrnoException;
        e.code = BLOCKED_HOST_CODE;
        callback(e, '');
        return;
      }
      if (all) callback(null, addrs);
      else callback(null, addrs[0]!.address, addrs[0]!.family);
    });
  };
}

/**
 * A minimal fetch over node:http(s) whose connections go through `lookup` (default: createGuardedLookup). It never
 * follows redirects (the caller walks them), sends no cookies, and decodes gzip / deflate / br. GET and HEAD only.
 */
export function pinnedFetch(lookup = createGuardedLookup()): typeof fetch {
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => new Promise((resolve, reject) => {
    let url: URL;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); } catch (e) { reject(e); return; }
    const mod = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
    if (!mod) { reject(new TypeError(`unsupported protocol ${url.protocol}`)); return; }
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') { reject(new TypeError('pinnedFetch only reads (GET / HEAD)')); return; }
    const headers: Record<string, string> = { 'accept-encoding': 'gzip, deflate, br' };
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    const req = mod.request(url, { method, headers, lookup: lookup as never, signal: init?.signal ?? undefined, agent: false }, (res) => {
      const status = res.statusCode ?? 0;
      const h = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (v === undefined) continue;
        for (const x of Array.isArray(v) ? v : [v]) h.append(k, x);
      }
      const nullBody = method === 'HEAD' || status === 204 || status === 205 || status === 304;
      let body: Readable | null = nullBody ? null : res;
      const enc = String(res.headers['content-encoding'] ?? '').toLowerCase().trim();
      const decoder = enc === 'gzip' || enc === 'x-gzip' ? zlib.createGunzip() : enc === 'deflate' ? zlib.createInflate() : enc === 'br' ? zlib.createBrotliDecompress() : null;
      if (body && decoder) {
        pipeline(res, decoder, () => { /* errors surface on the decoded stream */ });
        body = decoder;
        h.delete('content-encoding');
        h.delete('content-length');
      }
      if (!body) res.resume();
      try {
        resolve(new Response(body ? (Readable.toWeb(body) as unknown as ReadableStream) : null, {
          status: status >= 200 && status <= 599 ? status : 502,
          statusText: res.statusMessage,
          headers: h,
        }));
      } catch (e) {
        res.destroy();
        reject(e);
      }
    });
    req.on('error', reject);
    req.end();
  });
  return impl as typeof fetch;
}

// ── the redirect walk ───────────────────────────────────────────────────────────────────────────────────────────────

export type PublicFetchError = 'invalid_url' | 'blocked_host' | 'too_many_redirects' | 'http_error' | 'timeout' | 'fetch_failed';
export type PublicFetchResult = { ok: true; res: Response; url: string } | { ok: false; error: PublicFetchError; status?: number };

export interface PublicFetchOptions {
  /** Default: pinnedFetch() — the connection-time DNS guard. Tests inject a fake. */
  fetchImpl?: typeof fetch;
  lookupImpl?: LookupFn;
  timeoutMs?: number;
  maxHops?: number;
  headers?: Record<string, string>;
  /** The caller's own cancel (a route deadline); combined with the timeout. */
  signal?: AbortSignal;
}

/** Media a pipeline downloads (a clip, a track, a still) — or a storage host that names no type. */
export const MEDIA_TYPES = /^(?:$|video\/|audio\/|image\/|application\/(?:octet-stream|mp4)$|binary\/octet-stream$)/;

const isBlockedError = (e: unknown): boolean => {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code === BLOCKED_HOST_CODE || x?.cause?.code === BLOCKED_HOST_CODE;
};

/**
 * GET a caller-chosen public address: every hop validated and DNS-checked, redirects walked by hand, one deadline.
 * Resolves the final 2xx Response (its body unread — read it with readBodyWithCap) or why not. Never throws.
 */
export async function fetchPublic(rawUrl: string, opts: PublicFetchOptions = {}): Promise<PublicFetchResult> {
  const doFetch = opts.fetchImpl ?? pinnedFetch();
  const lookupFn = opts.lookupImpl ?? defaultLookup;
  const maxHops = opts.maxHops ?? 4;
  const deadline = Date.now() + (opts.timeoutMs ?? 8000);

  const first = validateLiveUrl(rawUrl);
  if (!first.ok) return { ok: false, error: 'invalid_url' };
  let url = first.url;

  for (let hop = 0; ; hop++) {
    if (hop > maxHops) return { ok: false, error: 'too_many_redirects' };
    const checked = validateLiveUrl(url);
    if (!checked.ok) return { ok: false, error: 'blocked_host' };
    if (!(await hostIsPublic(new URL(checked.url).hostname, lookupFn))) return { ok: false, error: 'blocked_host' };

    let res: Response;
    try {
      res = await doFetch(checked.url, {
        redirect: 'manual',
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyAvatarReader/1.0; +https://myavatar.ge)', ...(opts.headers ?? {}) },
        signal: opts.signal
          ? AbortSignal.any([opts.signal, AbortSignal.timeout(Math.max(500, deadline - Date.now()))])
          : AbortSignal.timeout(Math.max(500, deadline - Date.now())),
      });
    } catch (e) {
      if (isBlockedError(e)) return { ok: false, error: 'blocked_host' };
      const name = (e as { name?: string } | null)?.name ?? '';
      return { ok: false, error: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'fetch_failed' };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      void res.body?.cancel().catch(() => undefined);
      if (!loc) return { ok: false, error: 'http_error', status: res.status };
      try { url = new URL(loc, checked.url).href; } catch { return { ok: false, error: 'invalid_url' }; }
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      void res.body?.cancel().catch(() => undefined);
      return { ok: false, error: 'http_error', status: res.status };
    }
    return { ok: true, res, url: checked.url };
  }
}

export type PublicBytesError = PublicFetchError | 'wrong_type' | 'too_large';

/**
 * The bytes of a caller-chosen public file (a reference photo, a face), capped while downloading, of an allowed type.
 * For server code that hands the bytes on (sharp, a provider upload) — never the response status to the caller.
 */
export async function fetchPublicBytes(
  rawUrl: string,
  opts: PublicFetchOptions & { maxBytes: number; accept: RegExp },
): Promise<{ ok: true; bytes: Buffer; contentType: string; url: string } | { ok: false; error: PublicBytesError }> {
  const r = await fetchPublic(rawUrl, opts);
  if (!r.ok) return { ok: false, error: r.error };
  const contentType = (r.res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase();
  if (!opts.accept.test(contentType)) {
    void r.res.body?.cancel().catch(() => undefined);
    return { ok: false, error: 'wrong_type' };
  }
  const bytes = await readBodyWithCap(r.res, opts.maxBytes);
  if (!bytes) return { ok: false, error: 'too_large' };
  return { ok: true, bytes, contentType, url: r.url };
}

/**
 * A caller-chosen public media file streamed to `path` (for ffmpeg, which then reads only that local file), of an
 * allowed type, capped while downloading. The deadline covers the whole download, body included.
 */
export async function fetchPublicToFile(
  rawUrl: string,
  path: string,
  opts: PublicFetchOptions & { maxBytes: number; accept: RegExp },
): Promise<{ ok: true; bytes: number; contentType: string } | { ok: false; error: PublicBytesError }> {
  const r = await fetchPublic(rawUrl, opts);
  if (!r.ok) return { ok: false, error: r.error };
  const contentType = (r.res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase();
  const cl = Number(r.res.headers.get('content-length'));
  const refuse = !opts.accept.test(contentType) ? 'wrong_type' : Number.isFinite(cl) && cl > opts.maxBytes ? 'too_large' : null;
  if (refuse || !r.res.body) {
    void r.res.body?.cancel().catch(() => undefined);
    return { ok: false, error: refuse ?? 'fetch_failed' };
  }
  let total = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total > opts.maxBytes) cb(new Error('too_large'));
      else cb(null, chunk);
    },
  });
  try {
    await pipelineAsync(Readable.fromWeb(r.res.body as never), cap, createWriteStream(path));
    return { ok: true, bytes: total, contentType };
  } catch (e) {
    if (total > opts.maxBytes) return { ok: false, error: 'too_large' };
    const name = (e as { name?: string } | null)?.name ?? '';
    return { ok: false, error: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'fetch_failed' };
  }
}
