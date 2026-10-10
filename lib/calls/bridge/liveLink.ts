/**
 * lib/calls/bridge/liveLink.ts — one Gemini Live connection for one phone call, on the bridge.
 *
 * It opens the socket with the call's EPHEMERAL token (v1alpha …Constrained, the same handshake the browser uses,
 * lib/voice/geminiLive buildLiveUrl), sends the setup the app built and locked, and turns server frames into the
 * shared parity events (parseLiveServerMessage). Sockets are injected: Node's WebSocket on the bridge, a scripted fake
 * in tests.
 */
import {
  buildLiveUrl,
  buildRealtimeAudio,
  buildRealtimeText,
  buildToolResponse,
  parseLiveServerMessage,
  type LiveFunctionResponse,
  type LiveServerEvent,
  type LiveSetupMessage,
} from '@/lib/voice/geminiLive';
import { pcm16ToBase64 } from './pcm';

export interface LiveSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: ((code: number, reason: string) => void) | null;
  onerror: ((message: string) => void) | null;
}
export type OpenLiveSocket = (url: string) => LiveSocket;

export interface LiveUsage { prompt?: number; response?: number; total?: number }

export interface LiveLinkHandlers {
  onEvent(ev: LiveServerEvent): void;
  onUsage(u: LiveUsage): void;
  onClose(code: number, reason: string): void;
}

const nonNeg = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);

/** usageMetadata with the prompt/response split (the shared parser keeps only the total). */
export function usageOf(raw: string): LiveUsage | null {
  if (!raw.includes('usageMetadata')) return null;
  try {
    const um = (JSON.parse(raw) as { usageMetadata?: Record<string, unknown> }).usageMetadata;
    if (!um || typeof um !== 'object') return null;
    return { prompt: nonNeg(um.promptTokenCount), response: nonNeg(um.responseTokenCount), total: nonNeg(um.totalTokenCount) };
  } catch {
    return null;
  }
}

export class LiveLink {
  private socket: LiveSocket | null = null;
  private isReady = false;

  /** `wsBase` overrides only the host (a local test server); the path and token form stay buildLiveUrl's. */
  constructor(private readonly open: OpenLiveSocket, private readonly h: LiveLinkHandlers, private readonly wsBase?: string) {}

  get ready(): boolean { return this.isReady; }

  /** Open and set up. Resolves true at setupComplete, false if the socket closes or the timeout passes first. */
  connect(token: string, setup: LiveSetupMessage, timeoutMs = 10_000): Promise<boolean> {
    this.close();
    this.isReady = false;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (v: boolean) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
      const timer = setTimeout(() => { done(false); this.close(); }, timeoutMs);
      let s: LiveSocket;
      try {
        s = this.open(buildLiveUrl({ token, ...(this.wsBase ? { wsBase: this.wsBase } : {}) }));
      } catch {
        done(false);
        return;
      }
      this.socket = s;
      s.onopen = () => { if (this.socket === s) s.send(JSON.stringify(setup)); };
      s.onmessage = (data) => {
        if (this.socket !== s) return;
        const usage = usageOf(data);
        if (usage) this.h.onUsage(usage);
        for (const ev of parseLiveServerMessage(data)) {
          if (ev.kind === 'setupComplete') { this.isReady = true; done(true); }
          if (ev.kind !== 'usage') this.h.onEvent(ev);
        }
      };
      s.onerror = () => undefined;
      s.onclose = (code, reason) => {
        if (this.socket !== s) return;
        this.socket = null;
        this.isReady = false;
        done(false);
        this.h.onClose(code, reason);
      };
    });
  }

  sendAudio(pcm16k: Int16Array): boolean {
    if (!this.isReady || !this.socket) return false;
    this.socket.send(JSON.stringify(buildRealtimeAudio(pcm16ToBase64(pcm16k))));
    return true;
  }

  sendToolResponses(responses: readonly LiveFunctionResponse[]): boolean {
    if (!this.isReady || !this.socket || !responses.length) return false;
    this.socket.send(JSON.stringify(buildToolResponse(responses)));
    return true;
  }

  sendText(text: string): boolean {
    if (!this.isReady || !this.socket) return false;
    this.socket.send(JSON.stringify(buildRealtimeText(text)));
    return true;
  }

  /** Close without reporting onClose (our own close, e.g. before a resume or at the end of the call). */
  close(): void {
    const s = this.socket;
    this.socket = null;
    this.isReady = false;
    if (s) { try { s.close(1000, 'bridge'); } catch { /* already closed */ } }
  }
}

/** Node's built-in WebSocket (Node ≥ 22) as a LiveSocket. */
export function nodeLiveSocket(url: string): LiveSocket {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  const s: LiveSocket = {
    send: (d) => ws.send(d),
    close: (c, r) => ws.close(c ?? 1000, r),
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  const dec = new TextDecoder();
  ws.onopen = () => s.onopen?.();
  ws.onmessage = (ev: MessageEvent) => s.onmessage?.(typeof ev.data === 'string' ? ev.data : dec.decode(ev.data as ArrayBuffer));
  ws.onclose = (ev: CloseEvent) => s.onclose?.(ev.code, ev.reason);
  ws.onerror = () => s.onerror?.('websocket error');
  return s;
}
