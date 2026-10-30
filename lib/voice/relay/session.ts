/**
 * lib/voice/relay/session.ts — one browser ↔ Vertex AI Live session inside the Live relay (services/live-relay).
 *
 * The relay is a pipe with rules, nothing more. It owns no prompt and no prices: the app built the setup and locked it
 * into the ticket (lib/voice/relay/ticket). Per connection the relay:
 *   1. waits for the browser's first frame, a `setup`, and accepts it only when its digest is one the ticket names
 *      (and, for a NEW session, only before `nse` and only once per ticket);
 *   2. rewrites `setup.model` to the Vertex resource (projects/…/locations/…/publishers/google/models/…), after mapping
 *      the app's model id (LIVE_RELAY_MODEL_MAP) and checking it against the relay's own allowlist;
 *   3. opens Vertex with the service account's token and sends that setup first;
 *   4. forwards only `realtimeInput`, `clientContent` and `toolResponse` frames from the browser (a second `setup`
 *      would replace the lock), and every Vertex frame back unchanged;
 *   5. ends the session on its limits (length, idle, frame size, bytes) and logs one line per session, with the
 *      token usage Vertex reported, so every paid call is accounted for.
 *
 * Sockets and the clock are injected, so all of this runs under unit tests without a network.
 */
import { setupDigest, type TicketClaims } from './ticket';

export interface RelayConfig {
  project: string;
  /** Vertex region, e.g. `us-central1`, or `global`. */
  location: string;
  /** Vertex model id (bare, after the map) → the region that serves it, when not `location`. gemini-3.8-live (the
   *  talking avatar) is served in us-central1 only (europe-west4 → close 1008 "publisher model not found", 2026-10-25),
   *  while voice calls stay on the relay's own, nearer region. */
  modelLocations?: Record<string, string>;
  /** App model id → Vertex model id (bare ids). Unlisted ids pass through unchanged. */
  modelMap: Record<string, string>;
  /** Vertex model ids (bare, after the map) the relay will open. */
  allowedModels: ReadonlySet<string>;
  maxSessionMs: number;
  idleMs: number;
  maxFrameBytes: number;
  maxClientBytes: number;
}

export const RELAY_DEFAULTS = {
  maxSessionMs: 15 * 60_000,
  idleMs: 60_000,
  maxFrameBytes: 512 * 1024,
  maxClientBytes: 64 * 1024 * 1024,
} as const;

/** The Vertex AI Live WebSocket for a region (`global` has no region prefix). */
export function vertexLiveUrl(location: string): string {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `wss://${host}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;
}

/** `models/x`, `x` or a full Vertex resource → the bare id `x`. */
export function bareModelId(model: string): string {
  const m = model.trim();
  const i = m.lastIndexOf('/models/');
  if (i >= 0) return m.slice(i + '/models/'.length);
  return m.startsWith('models/') ? m.slice('models/'.length) : m;
}

export function vertexModelResource(cfg: Pick<RelayConfig, 'project' | 'location'>, bareId: string): string {
  return `projects/${cfg.project}/locations/${cfg.location}/publishers/google/models/${bareId}`;
}

/** Remembers which tickets already started a new session, until they expire. Per relay instance. */
export class UsedTickets {
  private used = new Map<string, number>();
  /** True the first time a jti is claimed; false when it was claimed before. */
  claim(jti: string, expMs: number, nowMs: number): boolean {
    if (this.used.size > 1000) for (const [k, exp] of this.used) if (exp <= nowMs) this.used.delete(k);
    if (this.used.has(jti)) return false;
    this.used.set(jti, expMs);
    return true;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export type SetupCheck =
  | { ok: true; upstreamFrame: string; resume: boolean; model: string; location: string }
  | { ok: false; code: number; reason: string };

/** Close codes the relay itself uses. 4xxx are application codes a browser can read. */
export const RELAY_CLOSE = {
  badSetup: 4400,
  ticketUsed: 4401,
  ticketLate: 4402,
  modelRefused: 4403,
  badFrame: 4404,
  upstreamUnavailable: 4502,
  sessionLimit: 4408,
  idle: 4409,
  tooBig: 1009,
  bytesLimit: 4413,
} as const;

/** Validates the browser's first frame against the ticket and builds the frame Vertex gets. */
export function checkSetupFrame(raw: string, claims: TicketClaims, cfg: RelayConfig, used: UsedTickets, nowMs: number): SetupCheck {
  let msg: unknown;
  try { msg = JSON.parse(raw); } catch { return { ok: false, code: RELAY_CLOSE.badSetup, reason: 'setup_not_json' }; }
  if (!isObj(msg) || !isObj(msg.setup) || Object.keys(msg).length !== 1) return { ok: false, code: RELAY_CLOSE.badSetup, reason: 'first_frame_not_setup' };
  const setup = msg.setup;
  if (!claims.d.includes(setupDigest(setup))) return { ok: false, code: RELAY_CLOSE.badSetup, reason: 'setup_not_locked' };

  const sr = setup.sessionResumption;
  if (sr !== undefined && !(isObj(sr) && Object.keys(sr).every((k) => k === 'handle' || k === 'transparent'))) {
    return { ok: false, code: RELAY_CLOSE.badSetup, reason: 'bad_resumption' };
  }
  const resume = isObj(sr) && typeof sr.handle === 'string' && sr.handle.length > 0;
  if (!resume) {
    if (nowMs >= claims.nse) return { ok: false, code: RELAY_CLOSE.ticketLate, reason: 'new_session_window_over' };
    if (!used.claim(claims.jti, claims.exp, nowMs)) return { ok: false, code: RELAY_CLOSE.ticketUsed, reason: 'ticket_used' };
  }

  if (typeof setup.model !== 'string' || !setup.model.trim()) return { ok: false, code: RELAY_CLOSE.badSetup, reason: 'no_model' };
  const appModel = bareModelId(setup.model);
  const model = cfg.modelMap[appModel] ?? appModel;
  if (!cfg.allowedModels.has(model)) return { ok: false, code: RELAY_CLOSE.modelRefused, reason: 'model_not_allowed' };

  const location = cfg.modelLocations?.[model] ?? cfg.location;
  const upstream = { setup: { ...setup, model: vertexModelResource({ project: cfg.project, location }, model) } };
  return { ok: true, upstreamFrame: JSON.stringify(upstream), resume, model, location };
}

const FORWARDED = new Set(['realtimeInput', 'clientContent', 'toolResponse']);

/** A browser frame after setup: exactly one of the forwarded kinds. */
export function clientFrameAllowed(raw: string): boolean {
  let msg: unknown;
  try { msg = JSON.parse(raw); } catch { return false; }
  if (!isObj(msg)) return false;
  const keys = Object.keys(msg);
  return keys.length === 1 && FORWARDED.has(keys[0] as string);
}

/** A close code a browser may receive: codes the WebSocket API reserves (1005, 1006, 1015, …) become 1011. */
export function forwardableCloseCode(code: number): number {
  if ((code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999)) return code;
  return 1011;
}

/** Close reasons are capped at 123 bytes by the protocol. */
export function closeReason(reason: string): string {
  let r = reason.slice(0, 120);
  while (Buffer.byteLength(r, 'utf8') > 120) r = r.slice(0, -1);
  return r;
}

export interface RelaySocket {
  send(data: string | Buffer, binary: boolean): void;
  close(code: number, reason: string): void;
}

export interface RelayDeps {
  claims: TicketClaims;
  cfg: RelayConfig;
  used: UsedTickets;
  now(): number;
  client: RelaySocket;
  /** Opens Vertex and resolves when it is open. The relay sends the setup itself, right after. */
  openUpstream(url: string): Promise<RelaySocket>;
  setTimer(fn: () => void, ms: number): () => void;
  log(event: string, data: Record<string, string | number | boolean>): void;
}

type State = 'awaiting_setup' | 'connecting' | 'open' | 'closed';

/** Frames the browser sends while Vertex is still opening are held, up to this many. */
const PENDING_CAP = 256;

export class RelaySession {
  private state: State = 'awaiting_setup';
  private upstream: RelaySocket | null = null;
  private pending: string[] = [];
  private startedAt: number;
  private bytesIn = 0;
  private bytesOut = 0;
  private framesDropped = 0;
  private totalTokens = 0;
  private model = '';
  private location = '';
  private resume = false;
  // When the setup frame arrived, Vertex's socket opened and its setupComplete came back (0 = never). Logged as
  // durations so a slow call shows WHERE it waited (GG 2026-10-25: half the calls sat ~15 s and the browser gave up).
  private setupAt = 0;
  private upstreamAt = 0;
  private readyAt = 0;
  private stopSession: () => void = () => {};
  private stopIdle: () => void = () => {};

  constructor(private readonly d: RelayDeps) {
    this.startedAt = d.now();
    this.armIdle();
  }

  get isClosed(): boolean { return this.state === 'closed'; }

  onClientMessage(data: string | Buffer): void {
    if (this.state === 'closed') return;
    const size = typeof data === 'string' ? Buffer.byteLength(data, 'utf8') : data.length;
    if (size > this.d.cfg.maxFrameBytes) return this.end(RELAY_CLOSE.tooBig, 'frame_too_big', 'relay');
    this.bytesIn += size;
    if (this.bytesIn > this.d.cfg.maxClientBytes) return this.end(RELAY_CLOSE.bytesLimit, 'bytes_limit', 'relay');
    this.armIdle();
    const text = typeof data === 'string' ? data : data.toString('utf8');

    if (this.state === 'awaiting_setup') return this.startUpstream(text);
    if (!clientFrameAllowed(text)) {
      this.framesDropped++;
      return this.end(RELAY_CLOSE.badFrame, 'frame_not_allowed', 'relay');
    }
    if (this.state === 'connecting') {
      if (this.pending.length >= PENDING_CAP) this.pending.shift();
      this.pending.push(text);
      return;
    }
    this.upstream?.send(text, false);
  }

  onClientClose(): void {
    this.end(1000, 'client_closed', 'client');
  }

  onUpstreamMessage(data: string | Buffer, binary: boolean): void {
    if (this.state !== 'open') return;
    if (this.readyAt === 0 && (typeof data === 'string' ? data : data.toString('utf8')).includes('"setupComplete"')) this.readyAt = this.d.now();
    const size = typeof data === 'string' ? Buffer.byteLength(data, 'utf8') : data.length;
    this.bytesOut += size;
    this.countUsage(data);
    this.d.client.send(data, binary);
  }

  onUpstreamClose(code: number, reason: string): void {
    if (this.state === 'closed') return;
    this.end(forwardableCloseCode(code), reason || 'upstream_closed', 'upstream', code);
  }

  private startUpstream(text: string): void {
    const check = checkSetupFrame(text, this.d.claims, this.d.cfg, this.d.used, this.d.now());
    if (!check.ok) return this.end(check.code, check.reason, 'relay');
    this.state = 'connecting';
    this.setupAt = this.d.now();
    this.model = check.model;
    this.location = check.location;
    this.resume = check.resume;
    const remaining = Math.min(this.d.cfg.maxSessionMs, Math.max(0, this.d.claims.exp - this.d.now()));
    this.stopSession = this.d.setTimer(() => this.end(RELAY_CLOSE.sessionLimit, 'session_limit', 'relay'), remaining);
    this.d.openUpstream(vertexLiveUrl(check.location)).then(
      (up) => {
        if (this.state === 'closed') { up.close(1000, 'client_gone'); return; }
        this.upstream = up;
        this.state = 'open';
        this.upstreamAt = this.d.now();
        up.send(check.upstreamFrame, false);
        for (const f of this.pending) up.send(f, false);
        this.pending = [];
      },
      (err: unknown) => {
        this.d.log('relay.upstream_open_failed', { sub: this.d.claims.sub, error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' });
        this.end(RELAY_CLOSE.upstreamUnavailable, 'upstream_unavailable', 'relay');
      },
    );
  }

  /** Sums usageMetadata.totalTokenCount from Vertex frames (only frames that mention it are parsed). */
  private countUsage(data: string | Buffer): void {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    if (!text.includes('usageMetadata')) return;
    try {
      const msg = JSON.parse(text) as { usageMetadata?: { totalTokenCount?: unknown } };
      const n = msg.usageMetadata?.totalTokenCount;
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) this.totalTokens += n;
    } catch { /* not JSON: nothing to count */ }
  }

  private armIdle(): void {
    this.stopIdle();
    this.stopIdle = this.d.setTimer(() => this.end(RELAY_CLOSE.idle, 'idle', 'relay'), this.d.cfg.idleMs);
  }

  private end(code: number, reason: string, by: 'client' | 'upstream' | 'relay', upstreamCode?: number): void {
    if (this.state === 'closed') return;
    const wasOpen = this.state === 'open';
    this.state = 'closed';
    this.stopIdle();
    this.stopSession();
    const r = closeReason(reason);
    if (by !== 'client') try { this.d.client.close(code, r); } catch { /* already gone */ }
    if (by !== 'upstream') try { this.upstream?.close(1000, r); } catch { /* already gone */ }
    this.upstream = null;
    this.pending = [];
    this.d.log('relay.session_end', {
      sub: this.d.claims.sub,
      jti: this.d.claims.jti.slice(0, 8),
      model: this.model || 'none',
      ...(this.location && this.location !== this.d.cfg.location ? { location: this.location } : {}),
      resume: this.resume,
      opened: wasOpen,
      by,
      code,
      ...(upstreamCode !== undefined ? { upstreamCode } : {}),
      reason: r,
      durationMs: this.d.now() - this.startedAt,
      // -1 = that step never happened: no setup frame, Vertex never opened, or no setupComplete.
      setupMs: this.setupAt ? this.setupAt - this.startedAt : -1,
      upstreamMs: this.upstreamAt ? this.upstreamAt - this.setupAt : -1,
      readyMs: this.readyAt ? this.readyAt - this.setupAt : -1,
      bytesIn: this.bytesIn,
      bytesOut: this.bytesOut,
      framesDropped: this.framesDropped,
      totalTokens: this.totalTokens,
    });
  }
}
