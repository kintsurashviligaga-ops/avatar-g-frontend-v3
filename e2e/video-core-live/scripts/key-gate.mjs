#!/usr/bin/env node
/**
 * A key gate in front of the throwaway Supabase stack, for the Video Core Preview E2E job only
 * (.github/workflows/video-core-preview-e2e.yml): listen on <listenHost>:<listenPort>, pass a request to the stack's
 * gateway at <targetHost>:<targetPort> only when it carries one of THIS run's keys, and answer 403 to anything else.
 *
 * Why: the Vercel Preview has to reach the stack over the internet (a quick tunnel), and the Supabase CLI also accepts
 * its documented default keys. This run starts the stack with a JWT secret made for the run, so its anon and service
 * keys are new; the gate makes sure that only those two keys (header `apikey`, or the `apikey` query parameter of a
 * websocket) get through. Two kinds of request carry no key by design and pass on their own credential: a CORS
 * preflight (no body, no data), and a storage URL the stack itself signed (its `token` is checked by Storage).
 *
 * The keys come from the GATE_KEYS environment variable (comma separated), never from the command line, and are never
 * printed: a refusal logs its method and path only.
 * usage: GATE_KEYS=<anon>,<service> node key-gate.mjs <listenHost> <listenPort> <targetHost> <targetPort>
 */
import http from 'node:http';
import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';

const [listenHost, listenPort, targetHost, targetPort] = process.argv.slice(2);
const keys = (process.env.GATE_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
if (!listenHost || !listenPort || !targetHost || !targetPort || keys.length === 0) {
  console.error('usage: GATE_KEYS=<anon>,<service> key-gate.mjs <listenHost> <listenPort> <targetHost> <targetPort>');
  process.exit(64);
}
if (keys.some((k) => k.startsWith('sb_'))) {
  // The CLI's sb_publishable_/sb_secret_ keys are the documented defaults: never a key of this run.
  console.error('key-gate: refusing a default sb_ key as a gate key');
  process.exit(64);
}

// Paths whose own query token is the credential (Storage verifies it).
const SIGNED = /^\/storage\/v1\/(?:object\/(?:sign|upload\/sign|public)|render\/image\/(?:sign|public))\//;

const same = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const ourKey = (value) => typeof value === 'string' && keys.some((k) => same(value, k));

export function admits(method, rawUrl, headers) {
  const u = new URL(rawUrl, 'http://gate');
  if (method === 'OPTIONS') return true;
  if (SIGNED.test(u.pathname)) return true;
  return ourKey(headers.apikey) || ourKey(u.searchParams.get('apikey'));
}

let refused = 0;
const refuse = (method, rawUrl) => {
  refused += 1;
  if (refused <= 50) console.log(`key-gate: 403 ${method} ${new URL(rawUrl, 'http://gate').pathname}`);
};

const server = http.createServer((req, res) => {
  if (!admits(req.method, req.url, req.headers)) {
    refuse(req.method, req.url);
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end('{"error":"not a key of this run"}');
    req.resume();
    return;
  }
  const headers = { ...req.headers, host: `${targetHost}:${targetPort}`, 'x-forwarded-proto': 'https' };
  if (req.headers.host) headers['x-forwarded-host'] = req.headers.host;
  const upstream = http.request({ host: targetHost, port: Number(targetPort), method: req.method, path: req.url, headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end('{"error":"stack unreachable"}');
  });
  req.pipe(upstream);
});

// Websockets (Realtime): the same rule, then raw bytes both ways.
server.on('upgrade', (req, client, head) => {
  if (!admits(req.method, req.url, req.headers)) {
    refuse(req.method, req.url);
    client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  const upstream = net.connect(Number(targetPort), targetHost, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i];
      lines.push(`${name}: ${name.toLowerCase() === 'host' ? `${targetHost}:${targetPort}` : req.rawHeaders[i + 1]}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    client.pipe(upstream).pipe(client);
  });
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on('error', close);
  upstream.on('error', close);
});

server.listen(Number(listenPort), listenHost, () => console.log(`key-gate ${listenHost}:${listenPort} → ${targetHost}:${targetPort} (${keys.length} keys)`));
process.on('SIGTERM', () => { console.log(`key-gate: ${refused} refused`); process.exit(0); });
