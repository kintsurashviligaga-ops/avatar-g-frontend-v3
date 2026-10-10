/**
 * lib/calls/bridge/callBridge.ts — ONE WhatsApp call on the media bridge, from Meta's SDP offer to hang-up.
 *
 *   start      our SDP answer (media adapter) → app `answer` (Meta pre_accept + accept) → app `session` (a locked,
 *              ephemeral Gemini Live token) → Live socket set up.
 *   caller     Opus → 48 kHz PCM (adapter) → 16 kHz → Gemini. While Live reconnects, up to 2 s is held, not lost.
 *   Agent G    Gemini 24 kHz → 48 kHz → 20 ms frames, paced in real time by tick(). `interrupted` (the caller spoke
 *              over Agent G) drops everything not yet sent: barge-in.
 *   words      the caller's transcribed words go to the app (`heard`) BEFORE any tool of the same turn runs, so a
 *              spoken "yes" is on record when the confirm tool reads it (phoneTools' spoken-approval check).
 *   tools      each function call is executed BY THE APP for the ticket's user (`tool`); the bridge only relays.
 *   resume     Google ends a connection after ~10 min (goAway) or it drops: a new token is asked for with the
 *              latest resumption handle, after any running tool call (a session cannot resume mid-call).
 *   limits     a wrap-up note 30 s before the call's cap, the cap itself, 20 s to connect media, 5 s of lost media.
 *   end        app `event:end` with the measurements (Meta hang-up, record closed, charge by Meta's duration).
 *
 * There is no second Agent G here: no prompt, no key, no rules, no prices. All of that is the app's.
 */
import { pcm16FromBase64, toLiveInput, fromLiveOutput, Resampler, LIVE_OUT_RATE, WA_RATE } from './pcm';
import { Playout, SILENCE_FRAME } from './playout';
import { CallMeter } from './meter';
import { LiveLink, type OpenLiveSocket } from './liveLink';
import { isCallOver, type AppClient, type EndReason } from './appClient';
import type { LiveFunctionResponse, LiveServerEvent } from '@/lib/voice/geminiLive';

export type PeerState = 'connected' | 'disconnected' | 'failed' | 'closed';

/** The WebRTC side (services/wa-call-bridge weriftPeer: ICE + DTLS-SRTP + Opus). PCM in and out, 48 kHz mono. */
export interface MediaPeer {
  /** Apply Meta's SDP offer; resolve our SDP answer with its ICE candidates. */
  answer(sdpOffer: string): Promise<string>;
  onAudio: ((pcm48: Int16Array, at: number) => void) | null;
  onState: ((s: PeerState) => void) | null;
  /** One 20 ms frame (960 samples) → Opus → RTP. */
  sendFrame(pcm48: Int16Array): void;
  close(): void;
}

export interface CallBridgeDeps {
  app: AppClient;
  peer: MediaPeer;
  openLive: OpenLiveSocket;
  now(): number;
  /** Structured log line. Never a ticket, token, SDP or transcript. */
  log(event: string, data?: Record<string, string | number | boolean>): void;
}

export const MEDIA_CONNECT_TIMEOUT_MS = 20_000;
export const MEDIA_LOST_GRACE_MS = 5_000;
export const WRAP_UP_BEFORE_S = 30;
export const METRICS_EVERY_MS = 10_000;
const INPUT_HOLD_CHUNKS = 50; // 50 × 40 ms = 2 s held while Live reconnects
const SEND_CHUNK = 640; // 40 ms at 16 kHz
/** Typed into the call 30 s before its cap (realtimeInput text, the model reads it as a note, not as the caller). */
export const WRAP_UP_NOTE = '[call note] About 30 seconds of this call remain. Tell the caller briefly, in their language, and close politely; the result and any report will arrive in their WhatsApp chat.';

export type CallPhase = 'starting' | 'live' | 'ending' | 'ended';

export class CallBridge {
  phase: CallPhase = 'starting';
  readonly meter = new CallMeter();
  endReason: EndReason | null = null;
  onEnded: (() => void) | null = null;

  private readonly live: LiveLink;
  private readonly down = toLiveInput();
  private readonly ups = new Map<number, Resampler>();
  private readonly playout = new Playout();
  private startedAt = 0;
  private answeredAt = 0;
  private maxSeconds = 0;
  private mediaAt = 0;
  private mediaLostAt = 0;
  private activePosted = false;
  private handle: string | null = null;
  private generation = 0;
  private held: Int16Array[] = [];
  private acc = new Int16Array(0);
  private accAt = 0;
  private answerOpen = false;
  private heardText = '';
  private heardAt = 0;
  private heardChain: Promise<void> = Promise.resolve();
  private pendingTools = 0;
  private readonly cancelled = new Set<string>();
  private wantResume = false;
  private resuming = false;
  private wrapNoted = false;
  private lastMetricsAt = 0;

  constructor(private readonly d: CallBridgeDeps) {
    this.live = new LiveLink(d.openLive, {
      onEvent: (ev) => this.onLive(ev),
      onUsage: (u) => this.meter.usage(u),
      onClose: (code) => this.onLiveClosed(code),
    });
  }

  async start(sdpOffer: string): Promise<void> {
    this.startedAt = this.d.now();
    this.d.peer.onAudio = (pcm, at) => this.onCallerAudio(pcm, at);
    this.d.peer.onState = (s) => this.onPeerState(s);
    let sdp: string;
    try {
      sdp = await this.d.peer.answer(sdpOffer);
    } catch {
      this.d.log('media_answer_failed');
      await this.finish('media_failed');
      return;
    }
    const a = await this.d.app.answer(sdp);
    if (!a.ok) {
      // The app has already decided the call (refused, failed at Meta, or over): nothing more to post.
      this.d.log('answer_refused', { status: a.status, error: a.error });
      this.teardown();
      return;
    }
    if (this.phase !== 'starting') return;
    this.answeredAt = this.d.now();
    this.maxSeconds = a.maxSeconds;
    this.phase = 'live';
    this.maybeActive();
    if (!(await this.openSession(null)) && this.phase === 'live') await this.finish('live_failed');
  }

  /** Called every 20 ms by the runtime: pace one frame out, and the call's clocks. */
  tick(): void {
    if (this.phase !== 'live' && this.phase !== 'starting') return;
    const now = this.d.now();
    if (this.phase === 'live' && this.mediaAt && !this.mediaLostAt) {
      const f = this.playout.next();
      if (f) {
        this.d.peer.sendFrame(f.pcm);
        if (f.firstOfTurn) {
          this.meter.answerStarted(now);
          this.meter.outputPath(now - f.receivedAt);
        }
      } else {
        this.d.peer.sendFrame(SILENCE_FRAME);
      }
    }
    if (!this.mediaAt && now - this.startedAt > MEDIA_CONNECT_TIMEOUT_MS) { void this.finish('media_failed'); return; }
    if (this.mediaLostAt && now - this.mediaLostAt > MEDIA_LOST_GRACE_MS) { void this.finish('hangup'); return; }
    if (this.phase !== 'live') return;
    const elapsedMs = now - this.answeredAt;
    if (this.maxSeconds > 0) {
      if (!this.wrapNoted && elapsedMs >= (this.maxSeconds - WRAP_UP_BEFORE_S) * 1000) this.wrapNoted = this.live.sendText(WRAP_UP_NOTE);
      if (elapsedMs >= this.maxSeconds * 1000) { void this.finish('max_duration'); return; }
    }
    if (now - this.lastMetricsAt >= METRICS_EVERY_MS) {
      this.lastMetricsAt = now;
      void this.d.app.event({ type: 'metrics', metrics: this.meter.snapshot() }).then((r) => { if (isCallOver(r)) this.teardown(); });
    }
  }

  /** End the call from our side (cap, media lost, Live failed, caller gone). Idempotent. */
  async finish(reason: EndReason): Promise<void> {
    if (this.phase === 'ending' || this.phase === 'ended') return;
    this.phase = 'ending';
    this.endReason = reason;
    this.playout.flush();
    this.live.close();
    const r = await this.d.app.event({ type: 'end', reason, metrics: this.meter.snapshot() });
    this.d.log('call_end', { reason, posted: r.ok });
    this.teardown();
  }

  private teardown(): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.live.close();
    try { this.d.peer.close(); } catch { /* already closed */ }
    this.onEnded?.();
  }

  // ── Gemini Live ───────────────────────────────────────────────────────────

  private async openSession(handle: string | null): Promise<boolean> {
    const s = await this.d.app.session(handle);
    if (!s.ok) {
      this.d.log('session_refused', { status: s.status, error: s.error });
      if (isCallOver(s)) this.teardown();
      return false;
    }
    if (this.phase !== 'live') return false;
    this.generation += 1;
    const ok = await this.live.connect(s.token, s.setupMessage);
    if (ok) {
      for (const chunk of this.held.splice(0)) this.live.sendAudio(chunk);
    } else {
      this.d.log('live_connect_failed', { resumed: !!handle });
    }
    return ok;
  }

  private onLiveClosed(code: number): void {
    if (this.phase !== 'live') return;
    this.d.log('live_closed', { code });
    this.wantResume = true;
    void this.maybeResume();
  }

  private async maybeResume(): Promise<void> {
    if (!this.wantResume || this.resuming || this.pendingTools > 0 || this.phase !== 'live') return;
    this.wantResume = false;
    this.resuming = true;
    this.live.close();
    this.meter.reconnects += 1;
    if (!this.handle) this.d.log('resume_without_handle');
    const ok = await this.openSession(this.handle);
    this.resuming = false;
    if (!ok && this.phase === 'live') await this.finish('live_failed');
  }

  private onLive(ev: LiveServerEvent): void {
    if (this.phase !== 'live') return;
    const now = this.d.now();
    switch (ev.kind) {
      case 'audio': {
        const rate = Number(/rate=(\d+)/.exec(ev.mimeType)?.[1] ?? LIVE_OUT_RATE);
        if (!Number.isInteger(rate) || rate <= 0 || WA_RATE % rate !== 0) { this.d.log('audio_rate_unsupported', { rate }); return; }
        let up = this.ups.get(rate);
        if (!up) { up = rate === LIVE_OUT_RATE ? fromLiveOutput() : new Resampler(WA_RATE / rate, 1); this.ups.set(rate, up); }
        const first = !this.answerOpen;
        this.answerOpen = true;
        if (first) this.flushHeard();
        this.playout.push(up.process(pcm16FromBase64(ev.data)), now, first);
        return;
      }
      case 'interrupted': {
        const dropped = this.playout.flush();
        if (dropped > 0 || this.answerOpen) this.meter.bargeIns += 1;
        this.answerOpen = false;
        this.ups.clear(); // the old answer's filter history must not bleed into the next one
        return;
      }
      case 'turnComplete':
        this.playout.endTurn();
        this.answerOpen = false;
        this.flushHeard();
        return;
      case 'inputTranscript':
        if (ev.text) { this.heardText += ev.text; this.heardAt = now; }
        if (ev.final) this.flushHeard();
        return;
      case 'toolCall':
        void this.runTools(ev.calls);
        return;
      case 'toolCallCancellation':
        for (const id of ev.ids) this.cancelled.add(id);
        return;
      case 'resumption':
        if (ev.resumable && ev.handle) this.handle = ev.handle;
        return;
      case 'goAway':
        this.d.log('live_go_away', { timeLeftMs: ev.timeLeftMs ?? -1 });
        this.wantResume = true;
        void this.maybeResume();
        return;
      case 'error':
        this.d.log('live_error');
        return;
      default:
        return;
    }
  }

  /** Post what the caller said so far (in order). Tools await this before they run. */
  private flushHeard(): Promise<void> {
    const text = this.heardText.replace(/\s+/g, ' ').trim();
    const at = this.heardAt;
    this.heardText = '';
    this.heardAt = 0;
    if (text) {
      this.heardChain = this.heardChain.then(async () => {
        const r = await this.d.app.heard(text, at);
        if (isCallOver(r)) this.teardown();
      });
    }
    return this.heardChain;
  }

  private async runTools(calls: ReadonlyArray<{ id: string; name: string; args: unknown }>): Promise<void> {
    this.pendingTools += 1;
    const gen = this.generation;
    try {
      await this.flushHeard();
      const out: LiveFunctionResponse[] = [];
      for (const c of calls) {
        if (this.phase !== 'live') return;
        if (this.cancelled.has(c.id)) continue;
        const r = await this.d.app.tool(c.name, c.args);
        if (!r.ok) {
          if (isCallOver(r)) { this.teardown(); return; }
          out.push({ id: c.id, name: c.name, response: { error: 'unavailable' } });
          continue;
        }
        out.push({ id: c.id, name: c.name, response: r.response });
      }
      const send = out.filter((r) => !this.cancelled.has(r.id));
      // A response for a session that is gone would answer a call the new session never made.
      if (gen === this.generation) this.live.sendToolResponses(send);
      else this.d.log('tool_response_dropped_after_reconnect', { count: send.length });
    } finally {
      this.pendingTools -= 1;
      if (this.wantResume) void this.maybeResume();
    }
  }

  // ── WhatsApp media ────────────────────────────────────────────────────────

  private onCallerAudio(pcm48: Int16Array, at: number): void {
    if (this.phase !== 'live') return;
    const pcm16 = this.down.process(pcm48);
    this.meter.heardChunk(pcm16, at);
    const joined = new Int16Array(this.acc.length + pcm16.length);
    joined.set(this.acc);
    joined.set(pcm16, this.acc.length);
    if (!this.acc.length) this.accAt = at;
    let i = 0;
    for (; i + SEND_CHUNK <= joined.length; i += SEND_CHUNK) {
      const chunk = joined.slice(i, i + SEND_CHUNK);
      if (this.live.sendAudio(chunk)) {
        this.meter.inputPath(this.d.now() - this.accAt);
      } else {
        this.held.push(chunk);
        if (this.held.length > INPUT_HOLD_CHUNKS) this.held.shift();
      }
      this.accAt = at;
    }
    this.acc = joined.slice(i);
  }

  /** `active` once media flows AND the app has answered at Meta (ICE can connect between pre_accept and accept). */
  private maybeActive(): void {
    if (this.activePosted || !this.mediaAt || !this.answeredAt || this.phase !== 'live') return;
    this.activePosted = true;
    void this.d.app.event({ type: 'active' }).then((r) => { if (isCallOver(r)) this.teardown(); });
  }

  private onPeerState(s: PeerState): void {
    if (this.phase === 'ending' || this.phase === 'ended') return;
    const now = this.d.now();
    if (s === 'connected') {
      this.mediaLostAt = 0;
      if (!this.mediaAt) this.mediaAt = now;
      this.maybeActive();
      return;
    }
    if (s === 'disconnected') { if (!this.mediaLostAt) this.mediaLostAt = now; return; }
    void this.finish(this.mediaAt ? 'hangup' : 'media_failed');
  }
}
