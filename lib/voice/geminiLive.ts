/**
 * lib/voice/geminiLive.ts — browser-direct client for the Gemini Multimodal Live API
 * (BidiGenerateContent over WebSocket). Streams 16 kHz PCM mic audio + JPEG video frames up, and
 * receives 24 kHz PCM audio / text down, with barge-in interruption.
 *
 * ARCHITECTURE NOTE: a persistent WS relay CANNOT live in a Vercel serverless route (the function
 * ends with its response). So the browser connects DIRECTLY to Google using a short-lived EPHEMERAL
 * token minted server-side by /api/voice/live (never the raw API key in the client). This module is
 * the client half; the wire-format builders/parser below are pure + unit-tested, and GeminiLiveSession
 * wraps them around a real WebSocket + the caller's audio/video capture.
 *
 * STATUS: additive + feature-flagged (NEXT_PUBLIC_GEMINI_LIVE_ENABLED). It does not touch the existing
 * VAD/realtime voice stack. The live wire protocol (v1beta, evolving) must be validated end-to-end with
 * a paid Live key + real mic/camera before enabling in production.
 */

export const DEFAULT_LIVE_MODEL = 'models/gemini-2.0-flash-live-001';
// The Live WS host; the API VERSION + METHOD are chosen per-credential in buildLiveUrl, because they
// are NOT interchangeable:
//   • an EPHEMERAL token is honored ONLY by v1alpha + BidiGenerateContentConstrained (the token carries
//     the server-locked liveConnectConstraints minted by /api/voice/live), and
//   • a raw API key uses v1beta + BidiGenerateContent (unconstrained).
// Putting a token on the v1beta/BidiGenerateContent endpoint fails the handshake (that path is api-key
// only) — matches Google's official gemini-live-ephemeral-tokens example.
const LIVE_WS_HOST = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage';
const TOKEN_METHOD = '.v1alpha.GenerativeService.BidiGenerateContentConstrained';
const KEY_METHOD = '.v1beta.GenerativeService.BidiGenerateContent';

export type LiveModality = 'AUDIO' | 'TEXT';

export interface GeminiLiveConfig {
  /** Ephemeral access token from /api/voice/live (preferred — never ship the raw API key to the client). */
  token?: string;
  /** Raw API key — dev/local only; exposes the key in the browser, so guard its use. */
  apiKey?: string;
  model?: string;
  systemInstruction?: string;
  responseModalities?: LiveModality[];
  /** Override the WS base (tests / future version bumps). */
  wsBase?: string;
}

export interface GeminiLiveCallbacks {
  onOpen?: () => void;
  onSetupComplete?: () => void;
  /** A 24 kHz int16 PCM chunk (base64) — the caller decodes + plays it. */
  onAudio?: (pcm24kBase64: string) => void;
  onText?: (text: string) => void;
  /** Server detected user barge-in — flush local playback immediately. */
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (message: string) => void;
}

// ─── Pure wire-format builders (unit-tested) ──────────────────────────────────

/** The first message on the socket: model + generationConfig + optional system instruction. */
export function buildSetupMessage(config: GeminiLiveConfig): Record<string, unknown> {
  const modalities = config.responseModalities?.length ? config.responseModalities : (['AUDIO'] as LiveModality[]);
  const setup: Record<string, unknown> = {
    model: config.model || DEFAULT_LIVE_MODEL,
    generationConfig: { responseModalities: modalities },
  };
  if (config.systemInstruction && config.systemInstruction.trim()) {
    setup.systemInstruction = { parts: [{ text: config.systemInstruction }] };
  }
  return { setup };
}

/** A mic frame: 16 kHz int16 PCM, base64. */
export function buildAudioMessage(pcm16kBase64: string): Record<string, unknown> {
  return { realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: pcm16kBase64 }] } };
}

/** A camera/screen frame (default JPEG), base64. */
export function buildVideoMessage(frameBase64: string, mimeType = 'image/jpeg'): Record<string, unknown> {
  return { realtimeInput: { mediaChunks: [{ mimeType, data: frameBase64 }] } };
}

export type LiveServerEvent =
  | { type: 'setupComplete' }
  | { type: 'audio'; data: string }
  | { type: 'text'; text: string }
  | { type: 'interrupted' }
  | { type: 'turnComplete' }
  | { type: 'unknown' };

interface ServerPart { text?: string; inlineData?: { mimeType?: string; data?: string } }
interface ServerShape {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: ServerPart[] };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
}

/**
 * Normalise one parsed server JSON object into a flat list of events (a single message can carry both
 * an audio part and a turnComplete). Never throws — an unrecognised shape yields [{type:'unknown'}].
 */
export function parseLiveServerEvents(raw: unknown): LiveServerEvent[] {
  if (!raw || typeof raw !== 'object') return [{ type: 'unknown' }];
  const msg = raw as ServerShape;
  const events: LiveServerEvent[] = [];
  if ('setupComplete' in msg && msg.setupComplete !== undefined) events.push({ type: 'setupComplete' });

  const sc = msg.serverContent;
  if (sc) {
    if (sc.interrupted) events.push({ type: 'interrupted' });
    const parts = sc.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (p?.inlineData?.data && (p.inlineData.mimeType || '').includes('audio')) {
          events.push({ type: 'audio', data: p.inlineData.data });
        } else if (typeof p?.text === 'string' && p.text.length > 0) {
          events.push({ type: 'text', text: p.text });
        }
      }
    }
    if (sc.turnComplete) events.push({ type: 'turnComplete' });
  }
  return events.length > 0 ? events : [{ type: 'unknown' }];
}

/**
 * Build the authenticated WS URL. The credential dictates BOTH the query param AND the version+method:
 * ephemeral token → v1alpha/BidiGenerateContentConstrained + ?access_token; api key (dev-only) →
 * v1beta/BidiGenerateContent + ?key. `wsBase` overrides only the host (tests / future host changes).
 */
export function buildLiveUrl(config: GeminiLiveConfig): string {
  const host = config.wsBase || LIVE_WS_HOST;
  if (config.token) return `${host}${TOKEN_METHOD}?access_token=${encodeURIComponent(config.token)}`;
  if (config.apiKey) return `${host}${KEY_METHOD}?key=${encodeURIComponent(config.apiKey)}`;
  return `${host}${KEY_METHOD}`;
}

// ─── Session controller (WebSocket wrapper) ───────────────────────────────────

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private ready = false;
  private closed = false;

  constructor(private config: GeminiLiveConfig, private cb: GeminiLiveCallbacks = {}) {}

  get isReady(): boolean { return this.ready; }

  connect(): void {
    if (this.ws) return;
    if (!this.config.token && !this.config.apiKey) {
      this.cb.onError?.('No Live credential (ephemeral token or API key) provided');
      return;
    }
    let socket: WebSocket;
    try {
      socket = new WebSocket(buildLiveUrl(this.config));
    } catch (e) {
      this.cb.onError?.(e instanceof Error ? e.message : 'WebSocket construct failed');
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.ws = socket;

    socket.onopen = () => {
      this.cb.onOpen?.();
      this.rawSend(buildSetupMessage(this.config));
    };
    socket.onmessage = (ev: MessageEvent) => { void this.handleMessage(ev.data); };
    socket.onerror = () => { this.cb.onError?.('WebSocket error'); };
    socket.onclose = (ev: CloseEvent) => {
      this.ready = false; this.closed = true; this.ws = null;
      this.cb.onClose?.(ev.code, ev.reason);
    };
  }

  private async handleMessage(data: unknown): Promise<void> {
    let text: string;
    if (typeof data === 'string') text = data;
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (typeof Blob !== 'undefined' && data instanceof Blob) text = await data.text();
    else return;

    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return; }

    for (const ev of parseLiveServerEvents(parsed)) {
      switch (ev.type) {
        case 'setupComplete': this.ready = true; this.cb.onSetupComplete?.(); break;
        case 'audio': this.cb.onAudio?.(ev.data); break;
        case 'text': this.cb.onText?.(ev.text); break;
        case 'interrupted': this.cb.onInterrupted?.(); break;
        case 'turnComplete': this.cb.onTurnComplete?.(); break;
        default: break;
      }
    }
  }

  private rawSend(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(obj)); } catch (e) { this.cb.onError?.(e instanceof Error ? e.message : 'send failed'); }
    }
  }

  /** Stream a 16 kHz PCM mic chunk (base64). No-op until the socket is open. */
  sendAudioChunk(pcm16kBase64: string): void {
    if (!pcm16kBase64) return;
    this.rawSend(buildAudioMessage(pcm16kBase64));
  }

  /** Stream one camera/screen frame (base64). */
  sendVideoFrame(frameBase64: string, mimeType = 'image/jpeg'): void {
    if (!frameBase64) return;
    this.rawSend(buildVideoMessage(frameBase64, mimeType));
  }

  /**
   * Local barge-in: the caller flushes its own playback queue immediately (millisecond-reactive) and
   * we keep streaming mic audio, which drives the server's own VAD to interrupt the in-flight turn.
   * (The current Live protocol has no dedicated client "cancel" frame — continued input IS the signal.)
   */
  interrupt(): void { this.cb.onInterrupted?.(); }

  close(): void {
    this.ready = false;
    this.closed = true;
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(1000, 'client closed'); } catch { /* noop */ } }
  }

  get isClosed(): boolean { return this.closed; }
}
