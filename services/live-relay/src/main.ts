/**
 * live-relay — the Vertex AI Live relay (MASTER TASK v3.1 P0, Phase 3). Browsers open a Gemini Live session here with a
 * ticket from /api/voice/live; the relay opens Vertex AI with its Cloud Run service account and pipes frames both ways.
 * The rules (ticket, setup lock, allowed frames, limits, logging) live in lib/voice/relay and are unit-tested there.
 *
 * Env:
 *   LIVE_RELAY_TICKET_SECRET   shared with the app (≥ 32 chars). Tickets without its signature are refused.
 *   GOOGLE_CLOUD_PROJECT       the Vertex project (Cloud Run does not set it; pass it at deploy).
 *   VERTEX_LIVE_LOCATION       Vertex region (default us-central1), or `global`.
 *   LIVE_RELAY_MODELS          Vertex model ids the relay opens, comma-separated (required; nothing opens without it).
 *   LIVE_RELAY_MODEL_MAP       app id=Vertex id pairs, comma-separated (e.g. gemini-2.5-flash-native-audio-latest=gemini-live-2.5-flash-native-audio).
 *   LIVE_RELAY_MODEL_LOCATIONS Vertex id=region pairs for models served elsewhere (e.g. gemini-3.8-live=us-central1).
 *   LIVE_RELAY_ALLOWED_ORIGINS browser origins allowed to connect, comma-separated (e.g. https://myavatar.ge). Empty = any.
 *   LIVE_RELAY_MAX_SESSION_MS, LIVE_RELAY_IDLE_MS, LIVE_RELAY_MAX_FRAME_BYTES, LIVE_RELAY_MAX_CLIENT_BYTES   limits.
 *   PORT                       set by Cloud Run (default 8080).
 *
 * The Google token comes from the metadata server (the Cloud Run service account). No key file, no API key.
 */
import http from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { verifyTicket, TICKET_SECRET_MIN_LENGTH } from '@/lib/voice/relay/ticket';
import { RELAY_DEFAULTS, RelaySession, UsedTickets, type RelayConfig, type RelaySocket } from '@/lib/voice/relay/session';

const env = process.env;
const log = (e: string, d: Record<string, string | number | boolean> = {}) => console.log(JSON.stringify({ severity: 'INFO', t: new Date().toISOString(), e, ...d }));
const list = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

const secret = (env.LIVE_RELAY_TICKET_SECRET ?? '').trim();
const cfg: RelayConfig = {
  project: (env.GOOGLE_CLOUD_PROJECT ?? '').trim(),
  location: (env.VERTEX_LIVE_LOCATION ?? 'us-central1').trim(),
  modelMap: Object.fromEntries(list(env.LIVE_RELAY_MODEL_MAP).map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && p[0] && p[1])),
  modelLocations: Object.fromEntries(list(env.LIVE_RELAY_MODEL_LOCATIONS).map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && p[0] && /^[a-z0-9-]+$/.test(p[1] ?? ''))),
  allowedModels: new Set(list(env.LIVE_RELAY_MODELS)),
  maxSessionMs: num(env.LIVE_RELAY_MAX_SESSION_MS, RELAY_DEFAULTS.maxSessionMs),
  idleMs: num(env.LIVE_RELAY_IDLE_MS, RELAY_DEFAULTS.idleMs),
  maxFrameBytes: num(env.LIVE_RELAY_MAX_FRAME_BYTES, RELAY_DEFAULTS.maxFrameBytes),
  maxClientBytes: num(env.LIVE_RELAY_MAX_CLIENT_BYTES, RELAY_DEFAULTS.maxClientBytes),
};
const origins = new Set(list(env.LIVE_RELAY_ALLOWED_ORIGINS));
if (secret.length < TICKET_SECRET_MIN_LENGTH || !cfg.project || !/^[a-z0-9-]+$/.test(cfg.location) || cfg.allowedModels.size === 0) {
  log('config_invalid', { secret: secret.length >= TICKET_SECRET_MIN_LENGTH, project: !!cfg.project, location: cfg.location, models: cfg.allowedModels.size });
  process.exit(1);
}

// ── Google access token from the metadata server, cached until a minute before it expires ──
let cached: { token: string; until: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`metadata token ${res.status}`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('metadata token empty');
  cached = { token: j.access_token, until: Date.now() + Math.max(0, (j.expires_in ?? 300) - 60) * 1000 };
  return cached.token;
}

const text = (d: RawData): Buffer => (Buffer.isBuffer(d) ? d : Array.isArray(d) ? Buffer.concat(d) : Buffer.from(d));

function openUpstream(session: () => RelaySession | null) {
  return async (url: string): Promise<RelaySocket> => {
    const token = await accessToken();
    return new Promise<RelaySocket>((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` }, handshakeTimeout: 10_000, maxPayload: 32 * 1024 * 1024 });
      let opened = false;
      ws.on('open', () => {
        opened = true;
        resolve({ send: (d, binary) => ws.send(d, { binary }), close: (c, r) => ws.close(c, r) });
      });
      ws.on('unexpected-response', (_req, res) => reject(new Error(`vertex handshake ${res.statusCode}`)));
      ws.on('error', (e) => { if (!opened) reject(e); });
      ws.on('message', (d, isBinary) => session()?.onUpstreamMessage(text(d), isBinary));
      ws.on('close', (code, reason) => { if (opened) session()?.onUpstreamClose(code, reason.toString('utf8')); });
    });
  };
}

const used = new UsedTickets();
let active = 0;
let draining = false;

const server = http.createServer((req, res) => {
  // Not /healthz: Cloud Run reserves paths that end in z.
  if (req.url === '/health') {
    res.writeHead(draining ? 503 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ ok: !draining, active }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: cfg.maxFrameBytes });

server.on('upgrade', (req, socket, head) => {
  const refuse = (status: number, why: string) => {
    log('relay.refused', { status, why });
    socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status] ?? ''}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  };
  if (draining) return refuse(503, 'draining');
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origins.size && !origins.has(origin)) return refuse(403, 'origin');
  const url = new URL(req.url ?? '/', 'http://relay');
  if (url.pathname !== '/v1/live') return refuse(404, 'path');
  const check = verifyTicket(secret, url.searchParams.get('ticket') ?? '', Date.now());
  if (!check.ok) return refuse(401, check.reason);

  wss.handleUpgrade(req, socket, head, (client) => {
    active++;
    let session: RelaySession | null = null;
    session = new RelaySession({
      claims: check.claims,
      cfg,
      used,
      now: () => Date.now(),
      client: { send: (d, binary) => { if (client.readyState === WebSocket.OPEN) client.send(d, { binary }); }, close: (c, r) => client.close(c, r) },
      openUpstream: openUpstream(() => session),
      setTimer: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); },
      log,
    });
    client.on('message', (d) => session?.onClientMessage(text(d)));
    client.on('close', () => { active--; session?.onClientClose(); });
    client.on('error', () => { /* a close follows */ });
    session.onClientOpen();
  });
});

const port = num(env.PORT, 8080);
server.listen(port, () => log('relay.listening', {
  port,
  location: cfg.location,
  models: [...cfg.allowedModels].join(','),
  modelLocations: Object.entries(cfg.modelLocations ?? {}).map(([m, l]) => `${m}=${l}`).join(','),
  origins: origins.size,
}));

// Cloud Run sends SIGTERM before it stops an instance: refuse new sessions, let live ones finish (Cloud Run allows 10 s).
process.on('SIGTERM', () => {
  draining = true;
  log('relay.draining', { active });
  setTimeout(() => process.exit(0), 9_000).unref();
});
