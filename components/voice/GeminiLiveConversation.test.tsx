/**
 * The contract ChatChrome's voice cascade relies on, exercised through the real browser globals (fetch,
 * getUserMedia, AudioContext, AudioWorkletNode, WebSocket — all faked, nothing reaches a network):
 *   • a 503 from the token mint calls onUnavailable (runtime fallback to VoiceConversation) and releases the mic;
 *   • End call releases the mic + socket and calls onClose;
 *   • a closed turn is delivered to onTurn when the host passes one;
 *   • a mic failure reaches the screen as a MICROPHONE error with the browser's error name, opens no socket, and
 *     leaves one telemetry beacon at /api/log-error;
 *   • the Live button's gesture prime (lib/voice/livePrime) is adopted: its context and its mic, no second request.
 */
const mockReportError = jest.fn();
jest.mock('../../lib/observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReportError(...a) }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { __resetLiveTelemetryBudget } from '@/lib/voice/liveTelemetry';
import { primeLive } from '@/lib/voice/livePrime';

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
  mockReportError.mockReset();
  __resetLiveTelemetryBudget();
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

test('a denied mic shows the MICROPHONE screen with the browser error name, opens no socket, and reports once', async () => {
  (navigator.mediaDevices.getUserMedia as jest.Mock).mockImplementation(async () => {
    throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  });
  const s = LIVE_OVERLAY_STRINGS.en;
  render(<GeminiLiveConversation userId="u1" locale="en" onClose={jest.fn()} />);
  expect(await screen.findByRole('heading', { name: s.micHeadline })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe(s.errors.mic_denied);
  expect(screen.getByTestId('live-error-name').textContent).toBe('NotAllowedError');
  expect(screen.queryByText(s.status.error)).toBeNull();
  expect(FakeSocket.all).toHaveLength(0);
  expect(mockReportError).toHaveBeenCalledTimes(1);
  const beacon = (g.fetch as jest.Mock).mock.calls.find((c) => c[0] === '/api/log-error');
  expect(beacon).toBeTruthy();
  const body = JSON.parse(String((beacon![1] as RequestInit).body));
  expect(body.context).toMatchObject({ kind: 'live_failure', code: 'mic_denied', name: 'NotAllowedError', primed: false });
  expect(body.url).not.toContain('?');
});

test('a mic HELD by another app (NotReadableError on every rung) ends on the busy screen with the browser error name — never "connection dropped"', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
  try {
    (navigator.mediaDevices.getUserMedia as jest.Mock).mockImplementation(async () => {
      throw Object.assign(new Error('Could not start audio source'), { name: 'NotReadableError' });
    });
    const s = LIVE_OVERLAY_STRINGS.ka;
    render(<GeminiLiveConversation userId="u1" locale="ka" onClose={jest.fn()} />);
    // The ladder waits between rungs (release → 400 ms → 1 s → a named device); run its timers out.
    for (let i = 0; i < 10 && !screen.queryByTestId('live-error-name'); i++) {
      await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    }
    expect(screen.getByRole('heading', { name: s.micHeadline })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(s.errors.mic_busy);
    expect(screen.getByTestId('live-error-name').textContent).toBe('NotReadableError');
    expect(screen.queryByText(s.status.error)).toBeNull(); // „კავშირი შეწყდა“ is for connection failures only
    expect(FakeSocket.all).toHaveLength(0); // no socket was opened for a call that could never hear the user
  } finally {
    jest.useRealTimers();
  }
});

test('the Live button\'s gesture prime is adopted: one getUserMedia, the primed context plays the call', async () => {
  act(() => primeLive()); // what the Live chip does synchronously in its click
  const gum = navigator.mediaDevices.getUserMedia as jest.Mock;
  expect(gum).toHaveBeenCalledTimes(1);
  const primedCtx = Ctx.all[0]!;
  render(<GeminiLiveConversation userId="u1" locale="en" onClose={jest.fn()} />);
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  expect(gum).toHaveBeenCalledTimes(1);
  // Only the 16 kHz capture context was added; playback is the primed one.
  expect(Ctx.all.filter((c) => c !== primedCtx).every((c) => c.sampleRate === 16000)).toBe(true);
});
