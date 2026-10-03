/**
 * The contract ChatChrome's voice cascade relies on, exercised through the real browser globals (fetch,
 * getUserMedia, AudioContext, AudioWorkletNode, WebSocket — all faked, nothing reaches a network):
 *   • a 503 from the token mint calls onUnavailable (runtime fallback to VoiceConversation) and releases the mic;
 *   • End call releases the mic + socket and calls onClose;
 *   • a closed turn is delivered to onTurn when the host passes one;
 *   • a mic failure reaches the screen as a MICROPHONE error with the browser's error name, opens no socket, and
 *     leaves one telemetry beacon at /api/log-error;
 *   • the Live button's gesture prime (lib/voice/livePrime) is adopted: its context and its mic, no second request;
 *   • voice-to-action: the call asks for the functions, each toolCall becomes the window event + an immediate
 *     toolResponse (ok:false when no studio took it), a card per action, Open ends the call and reveals the studio,
 *     a cancellation drops the card, end_call hangs up after the goodbye.
 */
const mockReportError = jest.fn();
jest.mock('../../lib/observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReportError(...a) }));

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';

import { __resetLiveTelemetryBudget } from '@/lib/voice/liveTelemetry';
import { primeLive } from '@/lib/voice/livePrime';
import { LIVE_ACTION_EVENT, LIVE_FUNCTION_DECLARATIONS, OPEN_ARTIFACT_EVENT, type LiveActionEventDetail } from '@/lib/voice/liveTools';

import GeminiLiveConversation from './GeminiLiveConversation';
import { LIVE_ACTION_STRINGS } from './live/LiveActionCards';
import { LIVE_END_CALL_GRACE_MS, LIVE_END_CALL_MAX_WAIT_MS } from './live/liveActions';
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

// ─── Voice-to-action (lib/voice/liveTools.ts → live/liveActions.ts → the overlay strip) ─────────────────────────

describe('voice-to-action', () => {
  const S = LIVE_ACTION_STRINGS.en;
  const live: Array<{ detail: LiveActionEventDetail; took: boolean }> = [];
  let studioOnPage = true;
  // Stands in for OmniStudio's one listener: applies, then preventDefault() as the receipt.
  const studio = (e: Event) => {
    const detail = (e as CustomEvent<LiveActionEventDetail>).detail;
    const took = studioOnPage && (detail.type === 'prepare_generation' || detail.type === 'open_studio');
    live.push({ detail, took });
    if (took) e.preventDefault();
  };
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    live.length = 0;
    studioOnPage = true;
    window.addEventListener(LIVE_ACTION_EVENT, studio);
  });
  afterEach(() => {
    window.removeEventListener(LIVE_ACTION_EVENT, studio);
    MotionGlobalConfig.skipAnimations = false;
  });

  async function connectedCall(onClose = jest.fn()) {
    render(<GeminiLiveConversation userId="u1" locale="en" onClose={onClose} />);
    await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    const ws = FakeSocket.all[0]!;
    act(() => ws.open());
    act(() => ws.receive({ setupComplete: {} }));
    await screen.findByText(LIVE_OVERLAY_STRINGS.en.status.listening);
    return { ws, onClose };
  }
  const lastToolResponse = (ws: FakeSocket) =>
    [...ws.sent].reverse().find((f) => 'toolResponse' in f) as { toolResponse: { functionResponses: Array<{ id: string; name: string; response: Record<string, unknown> }> } } | undefined;

  test('the call asks for the actions and its frame declares them', async () => {
    const { ws } = await connectedCall();
    const mint = (g.fetch as jest.Mock).mock.calls.find((c) => c[0] === '/api/voice/live')!;
    expect(JSON.parse(String((mint[1] as RequestInit).body))).toMatchObject({ actions: true, transcribe: true });
    // (This mint mock returns no server setup, so the hook builds the frame: declarations first, then the persona's search.)
    const tools = (ws.sent[0]!.setup as { tools?: unknown[] }).tools;
    expect(tools?.[0]).toEqual({ functionDeclarations: LIVE_FUNCTION_DECLARATIONS });
  });

  test('prepare_generation → the studio event, an ok:true answer, a card; Open ends the call and reveals the studio', async () => {
    const { ws, onClose } = await connectedCall();
    act(() => ws.receive({ toolCall: { functionCalls: [{ id: 'c1', name: 'prepare_generation', args: { tool: 'video', prompt: 'A cat surfing', aspectRatio: 'portrait' } }] } }));
    await waitFor(() => expect(lastToolResponse(ws)).toBeTruthy());
    expect(live[0]).toEqual({ detail: { type: 'prepare_generation', tool: 'video', prompt: 'A cat surfing', aspectRatio: '9:16' }, took: true });
    const r = lastToolResponse(ws)!.toolResponse.functionResponses;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'c1', name: 'prepare_generation', response: { ok: true } });
    expect(String(r[0]!.response.summary)).toMatch(/no credits were spent/);
    // Nothing but the answer went to Google: no render, no second call — and no avatar-poster request either (the
    // agent on the call is the rocket, not the user's photo).
    expect((g.fetch as jest.Mock).mock.calls.filter((c) => c[0] !== '/api/voice/live')).toEqual([]);

    // The call DOCKS so the user sees the prepared studio while still talking (components/voice/live/LiveDock.tsx).
    expect(await screen.findByTestId('live-dock')).toBeTruthy();
    expect(document.documentElement.dataset.liveDocked).toBe('1');
    expect(screen.queryByRole('dialog')).toBeNull();
    // Back to the full call: the card says what was done and offers Open.
    fireEvent.click(screen.getByTestId('live-dock-expand'));
    expect(document.documentElement.dataset.liveDocked).toBeUndefined();
    expect(await screen.findByText('Prepared a video prompt')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Prepared a video prompt. Not started — you run it from the studio.');
    fireEvent.click(screen.getByRole('button', { name: S.openStudioLabel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(FakeSocket.CLOSED);
    await waitFor(() => expect(live.some((e) => e.detail.reveal === true)).toBe(true));
    expect(live[live.length - 1]!.detail).toEqual({ type: 'prepare_generation', tool: 'video', prompt: 'A cat surfing', aspectRatio: '9:16', reveal: true });
  });

  test('no studio on the page → ok:false studio_unavailable and no card; junk args → invalid_args', async () => {
    studioOnPage = false;
    const { ws } = await connectedCall();
    act(() => ws.receive({ toolCall: { functionCalls: [
      { id: 'a', name: 'open_studio', args: { tool: 'video' } },
      { id: 'b', name: 'prepare_generation', args: { tool: 'hologram', prompt: 'x' } },
      { id: 'c', name: 'buy_credits', args: {} },
      { id: 'd', name: 'show_code', args: { title: 'T', language: 'go', code: 'package main' } },
    ] } }));
    await waitFor(() => expect(lastToolResponse(ws)).toBeTruthy());
    expect(lastToolResponse(ws)!.toolResponse.functionResponses.map((f) => [f.id, f.response.ok, f.response.error])).toEqual([
      ['a', false, 'studio_unavailable'],
      ['b', false, 'invalid_args'],
      ['c', false, 'unknown_tool'],
      ['d', false, 'canvas_unavailable'], // no canvas on this page either: never "it's on your screen"
    ]);
    expect(screen.queryByTestId('live-action-card')).toBeNull();
  });

  test('show_code → the canvas gets {title, language, code}; a toolCallCancellation removes the card', async () => {
    const artifacts: unknown[] = [];
    // A canvas on the page takes it (preventDefault = its receipt, as ArtifactCanvas does).
    const canvas = (e: Event) => { artifacts.push((e as CustomEvent).detail); e.preventDefault(); };
    window.addEventListener(OPEN_ARTIFACT_EVENT, canvas);
    try {
      const { ws } = await connectedCall();
      act(() => ws.receive({ toolCall: { functionCalls: [{ id: 'k1', name: 'show_code', args: { title: 'Hello', language: 'TypeScript', code: 'export const x = 1;' } }] } }));
      await waitFor(() => expect(lastToolResponse(ws)).toBeTruthy());
      expect(artifacts).toEqual([{ title: 'Hello', language: 'typescript', code: 'export const x = 1;' }]);
      expect(lastToolResponse(ws)!.toolResponse.functionResponses[0]).toMatchObject({ id: 'k1', response: { ok: true } });
      expect(await screen.findByText('Hello')).toBeTruthy();

      act(() => ws.receive({ toolCallCancellation: { ids: ['k1'] } }));
      await waitFor(() => expect(screen.queryByTestId('live-action-card')).toBeNull());
    } finally {
      window.removeEventListener(OPEN_ARTIFACT_EVENT, canvas);
    }
  });

  test('the call shows the rocket, never the user\'s enrolled avatar photo (no /api/avatar/core request)', async () => {
    await connectedCall();
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-testid="live-orb-rocket"]')?.getAttribute('src')).toBe('/brand/rocket-mark-512.png');
    expect(dialog.querySelector('[data-testid="live-orb-backdrop"]')).not.toBeNull();
    for (const img of Array.from(dialog.querySelectorAll('img'))) expect(img.getAttribute('src')).toMatch(/^\/brand\/rocket-mark/);
    expect((g.fetch as jest.Mock).mock.calls.some((c) => c[0] === '/api/avatar/core')).toBe(false);
  });

  test('open_url → an honest answer and a link card; the tab opens only on the user\'s tap, and the call goes on', async () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    try {
      const { ws, onClose } = await connectedCall();
      act(() => ws.receive({ toolCall: { functionCalls: [{ id: 'w1', name: 'open_url', args: { url: 'https://www.youtube.com/results?search_query=cats', title: 'YouTube: cats' } }] } }));
      await waitFor(() => expect(lastToolResponse(ws)).toBeTruthy());
      const r = lastToolResponse(ws)!.toolResponse.functionResponses[0]!;
      expect(r).toMatchObject({ id: 'w1', name: 'open_url', response: { ok: true } });
      expect(String(r.response.summary)).toMatch(/A link to youtube\.com is on the user's screen; they tap it/);
      expect(String(r.response.summary)).toMatch(/cannot open tabs by itself/);
      // The studio is not involved, and nothing was opened from the socket message.
      expect(live).toEqual([]);
      expect(open).not.toHaveBeenCalled();
      // The call stays full screen; the card offers the link.
      expect(screen.getByRole('dialog')).toBeTruthy();
      const card = await screen.findByText('YouTube: cats');
      expect(card).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: S.openLinkLabel('youtube.com') }));
      expect(open).toHaveBeenCalledWith('https://www.youtube.com/results?search_query=cats', '_blank', 'noopener,noreferrer');
      expect(onClose).not.toHaveBeenCalled();
      expect(ws.readyState).toBe(FakeSocket.OPEN);

      // Docked (the agent changed the screen), the link rides along as a chip under the capsule.
      act(() => ws.receive({ toolCall: { functionCalls: [{ id: 'w2', name: 'open_studio', args: { tool: 'video' } }] } }));
      const chip = await screen.findByTestId('live-dock-link');
      expect(chip).toHaveTextContent('YouTube: cats');
      fireEvent.click(screen.getByTestId('live-dock-link-open'));
      expect(open).toHaveBeenCalledTimes(2);
      // Opened → the chip gives its room back; the call is still on.
      await waitFor(() => expect(screen.queryByTestId('live-dock-link')).toBeNull());
      expect(screen.getByTestId('live-dock')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
    }
  });

  test('docked, the dock names the call, ends with a pill (not a red ✕), and shows the agent\'s step', async () => {
    const { ws, onClose } = await connectedCall();
    act(() => ws.receive({ toolCall: { functionCalls: [{ id: 's1', name: 'open_studio', args: { tool: 'music' } }] } }));
    const dock = await screen.findByTestId('live-dock');
    expect(dock).toHaveTextContent('Live call');
    expect(dock).toHaveTextContent('Agent G');
    // The step the agent just took, with its check.
    const line = screen.getByTestId('live-dock-line');
    expect(line).toHaveTextContent('Studio opened');
    expect(line.querySelector('[data-mark="done"]')).not.toBeNull();
    const end = screen.getByTestId('live-dock-end');
    expect(end).toHaveTextContent('End');
    fireEvent.click(end);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('end_call hangs up after the goodbye: a short grace when nothing plays, bounded while the goodbye plays', async () => {
    const { ws, onClose } = await connectedCall();
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
    try {
      act(() => ws.receive({ toolCall: { functionCalls: [{ id: 'e1', name: 'end_call', args: {} }] } }));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(lastToolResponse(ws)!.toolResponse.functionResponses[0]).toMatchObject({ id: 'e1', response: { ok: true } });
      // The goodbye starts playing → wait for it (bounded), not the short grace.
      act(() => ws.receive({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAAAAAAAAAA=' } }] } } }));
      act(() => { jest.advanceTimersByTime(LIVE_END_CALL_GRACE_MS + 100); });
      expect(onClose).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(LIVE_END_CALL_MAX_WAIT_MS); });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(ws.readyState).toBe(FakeSocket.CLOSED);
      act(() => { jest.advanceTimersByTime(LIVE_END_CALL_MAX_WAIT_MS); });
      expect(onClose).toHaveBeenCalledTimes(1); // hung up once
    } finally {
      jest.useRealTimers();
    }
  });

  test('end_call with nothing playing → hangs up after the short grace', async () => {
    const { ws, onClose } = await connectedCall();
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
    try {
      act(() => ws.receive({ toolCall: { functionCalls: [{ id: 'e2', name: 'end_call' }] } }));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      act(() => { jest.advanceTimersByTime(LIVE_END_CALL_GRACE_MS - 50); });
      expect(onClose).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(100); });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
