/**
 * wa-call-bridge — the WhatsApp Calling media bridge (Option A: Meta WhatsApp Calling → this bridge → the app's
 * Gemini Live → Agent G). One process, many calls. It holds no Google key, no prompt and no prices: every call runs on
 * a ticket the app issued, and every decision is the app's (lib/calls/whatsapp).
 *
 * Env:
 *   CALL_BRIDGE_SECRET  shared with the app (≥ 32 chars). Offers without its signature are refused.
 *   APP_ORIGIN          the app, https (e.g. https://myavatar.ge).
 *   PORT                local HTTP port (default 8080, bound to 127.0.0.1; TLS is terminated in front, see README).
 *   PUBLIC_IP           the VM's public address, added as an ICE host candidate.
 *   RTC_PORT_MIN/MAX    UDP range for media (default 40000–40999); open it in the firewall.
 *   BRIDGE_MAX_CALLS    concurrent calls (default 4, sized for an e2-small; see README); /health answers 503 when full.
 */
import http from 'node:http';
import { BridgeServer, BRIDGE_REQUEST_MAX_BYTES } from '@/lib/calls/bridge/server';
import { nodeLiveSocket } from '@/lib/calls/bridge/liveLink';
import { weriftPeer } from './weriftPeer';

const env = process.env;
const log = (e: string, d?: Record<string, string | number | boolean>) => console.log(JSON.stringify({ t: new Date().toISOString(), e, ...d }));

const secret = (env.CALL_BRIDGE_SECRET ?? '').trim();
const appOrigin = (env.APP_ORIGIN ?? '').trim().replace(/\/+$/, '');
if (secret.length < 32 || !/^https:\/\/[^\s/]+$/.test(appOrigin)) {
  log('config_invalid', { secret: secret.length >= 32, appOrigin: /^https:\/\//.test(appOrigin) });
  process.exit(1);
}
const portMin = Number(env.RTC_PORT_MIN ?? 40000);
const portMax = Number(env.RTC_PORT_MAX ?? 40999);

const bridge = new BridgeServer({
  secret,
  appOrigin,
  capacity: Math.max(1, Number(env.BRIDGE_MAX_CALLS ?? 4) || 4),
  now: () => Date.now(),
  newPeer: () => weriftPeer({ publicIp: env.PUBLIC_IP?.trim() || undefined, portRange: [portMin, portMax] }),
  openLive: nodeLiveSocket,
  log,
});

let draining = false;
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > BRIDGE_REQUEST_MAX_BYTES) { res.writeHead(413).end(); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    if (draining && req.method === 'POST') { res.writeHead(503, { 'content-type': 'application/json' }).end('{"error":"draining"}'); return; }
    const body = Buffer.concat(chunks).toString('utf8');
    void bridge
      .handle({ method: req.method ?? 'GET', path: req.url ?? '/', header: (n) => { const v = req.headers[n]; return typeof v === 'string' ? v : null; }, body })
      .then((out) => {
        const status = draining && out.status === 200 && req.url?.startsWith('/health') ? 503 : out.status;
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(out.body));
      })
      .catch(() => res.writeHead(500).end());
  });
});
server.listen(Number(env.PORT ?? 8080), '127.0.0.1', () => log('listening', { port: Number(env.PORT ?? 8080) }));

// One 20 ms clock for every call (paces Agent G's audio, checks every call's limits).
setInterval(() => bridge.tick(), 20);

// Deploys drain: no new calls, running calls finish (at most their cap).
process.on('SIGTERM', () => {
  draining = true;
  log('draining', { active: bridge.calls.size });
  const wait = setInterval(() => { if (bridge.calls.size === 0) { clearInterval(wait); process.exit(0); } }, 1000);
});
