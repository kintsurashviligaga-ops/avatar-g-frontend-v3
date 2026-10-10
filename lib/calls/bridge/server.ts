/**
 * lib/calls/bridge/server.ts — the bridge's own HTTP surface, as a pure handler (services/wa-call-bridge main.ts only
 * reads the socket and calls this).
 *
 *   POST /calls   { ticket, callId, sdpOffer }  from OUR app only: HMAC `x-call-signature` over the body, ±60 s
 *                 (lib/calls/whatsapp/ticket signBridgeRequest). A call id is taken once (no replayed offers).
 *   GET  /health  200 while there is room for another call, 503 when full (the app then refuses the call politely
 *                 instead of ringing into a full bridge).
 *
 * Nothing else is served. No ticket, token or SDP is logged.
 */
import { verifyBridgeRequest } from '@/lib/calls/whatsapp/ticket';
import { SDP_MAX_CHARS } from '@/lib/calls/whatsapp/events';
import { createAppClient } from './appClient';
import { CallBridge, type MediaPeer } from './callBridge';
import type { OpenLiveSocket } from './liveLink';

export const BRIDGE_REQUEST_MAX_BYTES = 65_536;
const CALL_ID_RE = /^[A-Za-z0-9._:=+/-]{4,256}$/;
const SEEN_TTL_MS = 15 * 60_000;

export interface BridgeServerDeps {
  /** CALL_BRIDGE_SECRET (shared with the app, ≥ 32 chars); empty → every offer is refused. */
  secret: string;
  /** The app's https origin, where the bridge sends its five requests. */
  appOrigin: string;
  capacity: number;
  now(): number;
  newPeer(): MediaPeer;
  openLive: OpenLiveSocket;
  fetch?: typeof fetch;
  log(event: string, data?: Record<string, string | number | boolean>): void;
}

export interface HttpIn { method: string; path: string; header(name: string): string | null; body: string }
export interface HttpOut { status: number; body: Record<string, unknown> }

export class BridgeServer {
  readonly calls = new Map<string, CallBridge>();
  private readonly seen = new Map<string, number>();

  constructor(private readonly d: BridgeServerDeps) {}

  get full(): boolean { return this.calls.size >= this.d.capacity; }

  async handle(req: HttpIn): Promise<HttpOut> {
    const path = req.path.split('?')[0];
    if (req.method === 'GET' && path === '/health') {
      return { status: this.full ? 503 : 200, body: { ok: !this.full, active: this.calls.size, capacity: this.d.capacity } };
    }
    if (req.method !== 'POST' || path !== '/calls') return { status: 404, body: { error: 'not_found' } };
    if (Buffer.byteLength(req.body) > BRIDGE_REQUEST_MAX_BYTES) return { status: 413, body: { error: 'too_large' } };
    const now = this.d.now();
    if (!verifyBridgeRequest(req.body, req.header('x-call-signature'), this.d.secret, now)) {
      this.d.log('offer_refused', { why: 'signature' });
      return { status: 401, body: { error: 'bad_signature' } };
    }
    let b: Record<string, unknown>;
    try {
      const v = JSON.parse(req.body) as unknown;
      b = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
      return { status: 400, body: { error: 'bad_json' } };
    }
    const { ticket, callId, sdpOffer } = b;
    if (typeof ticket !== 'string' || ticket.length > 2048 || !ticket.includes('.')) return { status: 400, body: { error: 'bad_ticket' } };
    if (typeof callId !== 'string' || !CALL_ID_RE.test(callId)) return { status: 400, body: { error: 'bad_call_id' } };
    if (typeof sdpOffer !== 'string' || !sdpOffer.startsWith('v=0') || sdpOffer.length > SDP_MAX_CHARS) return { status: 400, body: { error: 'bad_sdp' } };

    this.forgetOld(now);
    if (this.calls.has(callId) || this.seen.has(callId)) {
      this.d.log('offer_refused', { why: 'duplicate' });
      return { status: 409, body: { error: 'duplicate_call' } };
    }
    if (this.full) return { status: 503, body: { error: 'busy' } };

    this.seen.set(callId, now);
    const bridge = new CallBridge({
      app: createAppClient({ origin: this.d.appOrigin, ticket, fetch: this.d.fetch }),
      peer: this.d.newPeer(),
      openLive: this.d.openLive,
      now: this.d.now,
      log: (event, data) => this.d.log(event, { ...data, call: shortId(callId) }),
    });
    this.calls.set(callId, bridge);
    bridge.onEnded = () => { this.calls.delete(callId); };
    void bridge.start(sdpOffer).catch(() => bridge.finish('media_failed'));
    this.d.log('call_accepted', { call: shortId(callId), active: this.calls.size });
    return { status: 202, body: { accepted: true } };
  }

  /** The 20 ms clock for every call. */
  tick(): void {
    for (const c of this.calls.values()) c.tick();
  }

  private forgetOld(now: number): void {
    for (const [id, at] of this.seen) if (now - at > SEEN_TTL_MS) this.seen.delete(id);
  }
}

/** The last 6 characters of a call id: enough to follow one call through the logs. */
export const shortId = (callId: string): string => callId.slice(-6);
