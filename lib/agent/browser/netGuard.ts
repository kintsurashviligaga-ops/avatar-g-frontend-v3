/**
 * lib/agent/browser/netGuard.ts — the browser's own network gate (Phase 8.18, GG 2026-11-22: close the IPv6 SSRF gap).
 *
 * Why: the sandbox's network policy (./runner BROWSER_DENY_SUBNETS) can only list IPv4 ranges — Vercel refuses IPv6
 * CIDRs ("Invalid CIDR ::1/128", 2026-11-06). ./policy refuses IPv6 literals in a task's own `goto`, but a page can still
 * redirect, fetch, embed or open a WebSocket to `http://[::1]/`, `http://[fd00::1]/`, an IPv4-mapped `[::ffff:10.0.0.1]`,
 * or a public-looking name whose AAAA (or A) record points inside. Nothing checked those.
 *
 * The fix runs INSIDE the sandbox, next to Chromium, so it sees every connection the browser makes:
 *   1. a tiny forward proxy on 127.0.0.1 (NET_GUARD_JS) is the only way out. Chromium is started with
 *      `--proxy-server=<it>` and `--proxy-bypass-list=<-loopback>` (nothing bypasses it, not even localhost);
 *   2. for each request the proxy resolves the host itself, refuses it when ANY address is not public (IPv4 or IPv6),
 *      then connects to the exact address it checked — so a DNS answer cannot change between check and use;
 *   3. only ports 80 and 443;
 *   4. Chromium's own resolver is switched off (`--host-resolver-rules=MAP * ~NOTFOUND`), QUIC is off (UDP would not
 *      go through the proxy) and WebRTC may not send UDP outside the proxy.
 * If the proxy cannot start, the task does not run (fail closed).
 *
 * `isPublicIp` (TypeScript, for the server and the tests) and the JS copy inside NET_GUARD_JS are the same rules;
 * ./netGuard.test checks them against one table so they cannot drift. Public IPv6 means global unicast 2000::/3 only,
 * minus documentation, Teredo, 6to4 and ORCHID ranges. Everything else (::1, ::, fc00::/7, fe80::/10, ff00::/8,
 * 64:ff9b::/96, ::ffff:0:0/96 unless its IPv4 is public, …) is refused.
 */

/** Chromium switches that make the guard the browser's only route out. */
export function netGuardChromiumArgs(port: number): string[] {
  return [
    `--proxy-server=http://127.0.0.1:${port}`,
    '--proxy-bypass-list=<-loopback>',
    '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1',
    '--disable-quic',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  ];
}

const v4Parts = (ip: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
};

function v4Public(p: number[]): boolean {
  const [a, b, c] = p as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-net, private, loopback, multicast/reserved/broadcast
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  return true;
}

/** Eight 16-bit groups, or null when this is not an IPv6 address. A zone (%eth0) is dropped; a dotted tail is read. */
export function v6Groups(raw: string): number[] | null {
  let ip = raw.toLowerCase().replace(/^\[|\]$/g, '');
  const pct = ip.indexOf('%');
  if (pct >= 0) ip = ip.slice(0, pct);
  if (!/^[0-9a-f:.]+$/.test(ip) || !ip.includes(':')) return null;
  const lastColon = ip.lastIndexOf(':');
  const dotted = ip.slice(lastColon + 1);
  if (dotted.includes('.')) {
    const v4 = v4Parts(dotted);
    if (!v4) return null;
    ip = ip.slice(0, lastColon + 1) + ((v4[0]! << 8) | v4[1]!).toString(16) + ':' + ((v4[2]! << 8) | v4[3]!).toString(16);
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const part = (s: string) => (s === '' ? [] : s.split(':'));
  const head = part(halves[0]!);
  const back = halves.length === 2 ? part(halves[1]!) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + back.length > 7) return null;
  const fill: string[] = halves.length === 2 ? Array(8 - head.length - back.length).fill('0') : [];
  const groups = [...head, ...fill, ...back];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** True only for an address a public website can have. Anything unparsable is not public. */
export function isPublicIp(raw: string): boolean {
  const s = String(raw || '').trim();
  const v4 = v4Parts(s);
  if (v4) return v4Public(v4);
  const g = v6Groups(s);
  if (!g) return false;
  // IPv4-mapped ::ffff:a.b.c.d — judged by its IPv4.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4Public([g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255]);
  const first = g[0]!;
  if ((first & 0xe000) !== 0x2000) return false; // only global unicast 2000::/3
  if (first === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (first === 0x2001 && g[1]! < 0x0200) return false; // 2001::/23 IETF special use (Teredo, ORCHID, benchmarking …)
  if (first === 0x2002) return false; // 6to4 (embeds an IPv4 that may be private)
  if ((first & 0xfff0) === 0x3ff0) return false; // 3fff::/20 documentation (2024)
  return true;
}

/**
 * The guard as plain ESM for the sandbox driver (./script). Defines `startNetGuard(onBlock)` → Promise<port>.
 * The same rules as isPublicIp above (checked by ./netGuard.test). PW_TEST_NET exists only for the offline test,
 * which has no internet: {dns: {host: ip}, public: [ip], anyPort: true}. The sandbox starts with NO env, so it is inert.
 */
export const NET_GUARD_JS = String.raw`
const __net = await import('node:net');
const __http = await import('node:http');
const __dns = await import('node:dns');
const __T = process.env.PW_CORE && process.env.PW_TEST_NET ? JSON.parse(process.env.PW_TEST_NET) : null;

function __v4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
}
function __v4Public(p) {
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}
function __v6(raw) {
  let ip = String(raw).toLowerCase().replace(/^\[|\]$/g, '');
  const pct = ip.indexOf('%');
  if (pct >= 0) ip = ip.slice(0, pct);
  if (!/^[0-9a-f:.]+$/.test(ip) || !ip.includes(':')) return null;
  const lastColon = ip.lastIndexOf(':');
  const dotted = ip.slice(lastColon + 1);
  if (dotted.includes('.')) {
    const v4 = __v4(dotted);
    if (!v4) return null;
    ip = ip.slice(0, lastColon + 1) + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const part = (s) => (s === '' ? [] : s.split(':'));
  const head = part(halves[0]);
  const back = halves.length === 2 ? part(halves[1]) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + back.length > 7) return null;
  const fill = halves.length === 2 ? Array(8 - head.length - back.length).fill('0') : [];
  const groups = [...head, ...fill, ...back];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}
function isPublicIp(raw) {
  const s = String(raw || '').trim();
  if (__T && Array.isArray(__T.public) && __T.public.includes(s)) return true;
  const v4 = __v4(s);
  if (v4) return __v4Public(v4);
  const g = __v6(s);
  if (!g) return false;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return __v4Public([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  const first = g[0];
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && g[1] === 0x0db8) return false;
  if (first === 0x2001 && g[1] < 0x0200) return false;
  if (first === 0x2002) return false;
  if ((first & 0xfff0) === 0x3ff0) return false;
  return true;
}
globalThis.__isPublicIp = isPublicIp;

// Resolve a host and pick the address to connect to. Refuses when ANY answer is not public (mixed A/AAAA tricks).
async function __pick(hostRaw, port) {
  const host = String(hostRaw || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new Error('no host');
  if (!(port === 80 || port === 443 || (__T && __T.anyPort))) throw new Error('port ' + port);
  let addrs;
  if (__net.isIP(host)) addrs = [host];
  else if (__T && __T.dns && __T.dns[host]) addrs = [__T.dns[host]];
  else addrs = (await __dns.promises.lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  if (!addrs.length) throw new Error('no address');
  const bad = addrs.find((a) => !isPublicIp(a));
  if (bad) throw new Error('blocked ' + host + ' -> ' + bad);
  return addrs[0];
}

function startNetGuard(onBlock) {
  const block = (what, why) => { try { onBlock(String(what).slice(0, 200), String(why).slice(0, 200)); } catch {} };
  const server = __http.createServer(async (req, res) => {
    // A plain-http request through the proxy: an absolute URL.
    let u;
    try { u = new URL(req.url); } catch { res.writeHead(400); return res.end(); }
    if (u.protocol !== 'http:') { res.writeHead(403); return res.end(); }
    const port = Number(u.port || 80);
    let ip;
    try { ip = await __pick(u.hostname, port); } catch (e) { block(u.host, e.message); res.writeHead(403, { 'content-type': 'text/plain', 'x-agent-g-guard': 'blocked' }); return res.end('blocked by Agent G network guard'); }
    const headers = { ...req.headers };
    delete headers['proxy-connection']; delete headers['proxy-authorization'];
    const up = __http.request({ host: ip, port, method: req.method, path: u.pathname + u.search, headers, setHost: false }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  // https and wss: a CONNECT tunnel to host:port.
  server.on('connect', async (req, sock, head) => {
    sock.on('error', () => {});
    const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(req.url || '');
    let ip;
    const port = m ? Number(m[2]) : 0;
    try {
      if (!m) throw new Error('bad target');
      ip = await __pick(m[1], port);
    } catch (e) {
      block(req.url, e.message);
      return sock.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    }
    const up = __net.connect({ host: ip, port }, () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    up.on('error', () => sock.destroy());
  });
  server.on('upgrade', (req, sock) => { block(req.url, 'upgrade'); sock.destroy(); });
  server.on('clientError', (_e, sock) => sock.destroy());
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}
`;
