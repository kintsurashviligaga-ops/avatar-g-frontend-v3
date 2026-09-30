/**
 * The contract ChatChrome's voice cascade relies on, exercised through the real browser globals (fetch,
 * getUserMedia, AudioContext, AudioWorkletNode, WebSocket — all faked, nothing reaches a network):
 *   • a 503 from the token mint calls onUnavailable (runtime fallback to VoiceConversation) and releases the mic;
 *   • End call releases the mic + socket and calls onClose;
 *   • a closed turn is delivered to onTurn when the host passes one.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import GeminiLiveConversation from './GeminiLiveConversation';
import { LIVE_OVERLAY_STRINGS } from './live/LiveModeOverlay';

class FakeSocket {
  static OPEN = 1; static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = 0;
  binaryType = 'blob';
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code: 1000, reason: '' }); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}
class Node { connect(n: unknown) { return n; } disconnect() {} }
class Ctx {
  static all: Ctx[] = [];
  sampleRate: number;
  currentTime = 0;
  destination = new Node();
  closed = false;
  audioWorklet = { addModule: async () => {} };
  constructor(o?: { sampleRate?: number }) { this.sampleRate = o?.sampleRate ?? 48000; Ctx.all.push(this); }
  createGain() { return Object.assign(new Node(), { gain: { value: 1 } }); }
  createAnalyser() { return Object.assign(new Node(), { fftSize: 256, getByteTimeDomainData: (b: Uint8Array) => b.fill(128) }); }
  createMediaStreamSource() { return new Node(); }
  createBuffer() { return { duration: 0.1, getChannelData: () => new Float32Array(2400) }; }
  createBufferSource() { return Object.assign(new Node(), { buffer: null, onended: null, start() {}, stop() {} }); }
  resume() { return Promise.resolve(); }
  close() { this.closed = true; return Promise.resolve(); }
}
class Worklet extends Node { port = { onmessage: null, close() {} }; }

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let track: { stop: jest.Mock; enabled: boolean };
let liveStatus = 200;

beforeEach(() => {
  for (const k of ['WebSocket', 'AudioContext', 'AudioWorkletNode', 'fetch']) saved[k] = g[k];
  FakeSocket.all = [];
  Ctx.all = [];
  liveStatus = 200;
  g.WebSocket = FakeSocket;
  g.AudioContext = Ctx;
  g.AudioWorkletNode = Worklet;
  g.fetch = jest.fn(async (url: string) => {
    if (url === '/api/voice/live') {
      return {
        ok: liveStatus === 200,
        status: liveStatus,
        json: async () => (liveStatus === 200 ? { token: 'tok', model: 'models/gemini-2.5-flash-native-audio-latest', expiresAt: new Date(Date.now() + 1.8e6).toISOString() } : { error: 'gemini_live_disabled' }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  track = { stop: jest.fn(), enabled: true };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track] })) },
  });
});
afterEach(() => {
  for (const k of Object.keys(saved)) g[k] = saved[k];
});

test('503 from the mint → onUnavailable (runtime fallback), mic released, no socket', async () => {
  liveStatus = 503;
  const onUnavailable = jest.fn();
  const onClose = jest.fn();
  render(<GeminiLiveConversation userId="u1" locale="ka" onClose={onClose} onUnavailable={onUnavailable} />);
  await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(track.stop).toHaveBeenCalled());
  expect(FakeSocket.all).toHaveLength(0);
  expect(onClose).not.toHaveBeenCalled();
});

test('End call releases the mic, the audio contexts and the socket, then calls onClose', async () => {
  const onClose = jest.fn();
  const turns: unknown[] = [];
  render(<GeminiLiveConversation userId="u1" locale="en" onClose={onClose} onTurn={(t) => turns.push(t)} />);
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  const ws = FakeSocket.all[0]!;
  expect(ws.url).toContain('access_token=tok');
  act(() => ws.open());
  const setup = ws.sent[0]!.setup as { systemInstruction: { parts: Array<{ text: string }> } };
  expect(setup.systemInstruction.parts[0]!.text).toContain('Veo'); // Google-only platform prompt reached the call
  act(() => ws.receive({ setupComplete: {} }));
  await screen.findByText(LIVE_OVERLAY_STRINGS.en.status.listening);

  act(() => ws.receive({ serverContent: { inputTranscription: { text: 'hi' }, outputTranscription: { text: 'hello' }, turnComplete: true } }));
  expect(turns).toEqual([{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }]);

  await waitFor(() => expect(Ctx.all.length).toBeGreaterThanOrEqual(2));
  fireEvent.click(screen.getByRole('button', { name: LIVE_OVERLAY_STRINGS.en.end }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(track.stop).toHaveBeenCalled();
  expect(ws.readyState).toBe(FakeSocket.CLOSED);
  expect(Ctx.all.every((c) => c.closed)).toBe(true);
});
