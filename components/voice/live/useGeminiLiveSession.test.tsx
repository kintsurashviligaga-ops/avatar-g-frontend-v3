/**
 * The Live call's browser half, driven through a fake WebSocket + fake Web Audio + a fake worklet:
 * setup goes first, audio spoken before setupComplete is flushed after it, a local barge-in stops playback,
 * goAway resumes with the handle, teardown releases everything, transcripts reach onTurn. No network, no provider.
 * The microphone section drives the mic ladder through the hook: specific error codes + the browser's error name,
 * no socket for a call that cannot hear, release-before-acquire, busy back-off, re-mint of a stale token, a track
 * lost mid-call, the pulled capture worklet, Retry after a busy device, the gesture prime, and "tap to start audio".
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { LIVE_SPOKEN_RULE } from '@/lib/agents/profile';
import { MIC_CONSTRAINTS } from '@/lib/voice/micAcquire';
import { MIC_RELEASE_EVENT, type MicReleaseDetail } from '@/lib/voice/micBus';
import { base64ToBytes, bytesToBase64 } from '@/lib/voice/pcm';
import { liveVoicePersona } from '@/lib/voice/voicePrompt';

import {
  LIVE_LANGUAGE_RULE,
  LIVE_MIC_BUSY_RETRY_PAUSE_MS,
  LIVE_TOKEN_FRESH_MS,
  LIVE_TRANSCRIPT_EVENT,
  buildLiveInstruction,
  createPcmDownsampler,
  isMicErrorCode,
  micErrorCodeFor,
  normalizeCaption,
  playbackRateFromMime,
  useGeminiLiveSession,
  type LiveSessionDeps,
  type LiveTurn,
  type UseGeminiLiveSessionOptions,
} from './useGeminiLiveSession';

// ─── Fakes ─────────────────────────────────────────────────────────────────────

type Frame = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

class FakeSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static all: FakeSocket[] = [];
  static get last(): FakeSocket { return FakeSocket.all[FakeSocket.all.length - 1]!; }
  readyState = FakeSocket.CONNECTING;
  binaryType = 'blob';
  sent: Frame[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close(code = 1000, reason = '') {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  receive(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

class FakeNode {
  connections: unknown[] = [];
  disconnected = false;
  connect(n: unknown) { this.connections.push(n); return n; }
  disconnect() { this.disconnected = true; }
}
class FakeGain extends FakeNode { gain = { value: 1 }; }
class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  getByteTimeDomainData(b: Uint8Array) { b.fill(128); }
}
class FakeBuffer {
  data: Float32Array;
  duration: number;
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.data = new Float32Array(length);
    this.duration = length / sampleRate;
  }
  getChannelData() { return this.data; }
}
class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stopped = false;
  start(at: number) { this.startedAt = at; }
  stop() { this.stopped = true; }
}
class FakeAudioContext {
  static all: FakeAudioContext[] = [];
  sampleRate: number;
  currentTime = 0;
  destination = new FakeNode();
  closed = false;
  sources: FakeSource[] = [];
  audioWorklet = { addModule: jest.fn(async (_url: string) => {}) };
  constructor(opts?: AudioContextOptions) {
    this.sampleRate = opts?.sampleRate ?? 48000;
    FakeAudioContext.all.push(this);
  }
  createGain() { return new FakeGain(); }
  createAnalyser() { return new FakeAnalyser(); }
  createBuffer(ch: number, len: number, rate: number) { return new FakeBuffer(ch, len, rate); }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  createMediaStreamSource() { return new FakeNode(); }
  resume() { return Promise.resolve(); }
  close() { this.closed = true; return Promise.resolve(); }
}
class FakeWorklet extends FakeNode {
  port = {
    onmessage: null as null | ((e: { data: unknown }) => void),
    closed: false,
    close() { this.closed = true; },
  };
  constructor(public ctx: FakeAudioContext, public name: string, public opts: AudioWorkletNodeOptions) { super(); }
  emit(samples: Int16Array, rms: number) {
    const copy = samples.slice();
    this.port.onmessage?.({ data: { type: 'pcm16', buffer: copy.buffer, rms } });
  }
}

const future = () => new Date(Date.now() + 30 * 60_000).toISOString();
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const FB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]';
const domErr = (name: string, message = '') => Object.assign(new Error(message), { name });

/** A mic track that can end on its own (the OS pulled it), like a real MediaStreamTrack. */
function makeTrack() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    stop: jest.fn(),
    enabled: true,
    kind: 'audio',
    addEventListener: (type: string, fn: () => void) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn); },
    removeEventListener: (type: string, fn: () => void) => { listeners.get(type)?.delete(fn); },
    fire: (type: string) => { Array.from(listeners.get(type) ?? []).forEach((fn) => fn()); },
  };
}
const streamOf = (track: ReturnType<typeof makeTrack>) => ({ getTracks: () => [track], getAudioTracks: () => [track] }) as unknown as MediaStream;

function harness(mintBody?: (n: number) => unknown, mintStatus = 200) {
  const track = makeTrack();
  const stream = streamOf(track);
  const worklets: FakeWorklet[] = [];
  const mintBodies: Frame[] = [];
  const sleeps: number[] = [];
  let clock = 10_000;
  let n = 0;
  const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
    n += 1;
    mintBodies.push(JSON.parse(String(init?.body ?? '{}')));
    return reply(mintStatus, mintBody ? mintBody(n) : { token: `tok${n}`, model: 'models/gemini-2.5-flash-native-audio-latest', expiresAt: future() });
  });
  const getUserMedia = jest.fn(async (_c: MediaStreamConstraints) => stream);
  const report = jest.fn();
  const deps: Partial<LiveSessionDeps> = {
    fetch: fetchImpl as unknown as typeof fetch,
    getUserMedia,
    enumerateDevices: null,
    queryMicPermission: null,
    isSecureContext: true,
    userAgent: CHROME_UA,
    sleep: jest.fn(async (ms: number) => { sleeps.push(ms); }),
    createAudioContext: ((opts?: AudioContextOptions) => new FakeAudioContext(opts)) as unknown as LiveSessionDeps['createAudioContext'],
    createWorkletNode: ((ctx: FakeAudioContext, name: string, opts: AudioWorkletNodeOptions) => {
      const w = new FakeWorklet(ctx, name, opts);
      worklets.push(w);
      return w;
    }) as unknown as LiveSessionDeps['createWorkletNode'],
    now: () => clock,
    takePrimed: () => null,
    report,
  };
  return {
    deps, track, stream, worklets, fetchImpl, getUserMedia, mintBodies, report, sleeps,
    advance: (ms: number) => { clock += ms; },
    get playCtx() { return FakeAudioContext.all[0]!; },
    get capCtx() { return FakeAudioContext.all[1]!; },
  };
}

const pcm = (len: number, value: number) => new Int16Array(len).fill(value);
const audioFrame = (len = 2400) => ({
  serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: bytesToBase64(new Uint8Array(pcm(len, 1000).buffer)) } }] } },
});
/** The PCM a mediaChunks audio frame carries. */
const framePcm = (f: Frame): Int16Array => {
  const bytes = base64ToBytes(f.realtimeInput.mediaChunks[0].data);
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
};
const isAudioFrame = (f: Frame) => !!f.realtimeInput?.mediaChunks?.[0]?.mimeType?.startsWith('audio/pcm');

async function startCall(opts: UseGeminiLiveSessionOptions) {
  const hook = renderHook((p: UseGeminiLiveSessionOptions) => useGeminiLiveSession(p), { initialProps: opts });
  await act(async () => { await hook.result.current.start(); });
  return hook;
}

async function connected(opts: UseGeminiLiveSessionOptions) {
  const hook = await startCall(opts);
  const ws = FakeSocket.last;
  act(() => ws.open());
  act(() => ws.receive({ setupComplete: {} }));
  return { ...hook, ws };
}

const realWS = (globalThis as { WebSocket?: unknown }).WebSocket;
beforeEach(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
  FakeSocket.all = [];
  FakeAudioContext.all = [];
});
afterEach(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = realWS;
});

// ─── Session lifecycle ─────────────────────────────────────────────────────────

test('setup is the FIRST frame: parity setup (transcription, resumption, compression, tools) on the minted token', async () => {
  const h = harness();
  const { result, unmount } = await startCall({ locale: 'ka', voiceName: 'Charon', systemInstruction: 'SYS', tools: ['google_search'], personaId: 'film-director', deps: h.deps });
  expect(result.current.status).toBe('connecting');
  const ws = FakeSocket.last;
  expect(ws.url).toContain('BidiGenerateContentConstrained?access_token=tok1');
  expect(ws.sent).toHaveLength(0); // nothing before the socket opens

  act(() => ws.open());
  expect(ws.sent).toHaveLength(1);
  const { setup } = ws.sent[0]!;
  expect(setup.model).toBe('models/gemini-2.5-flash-native-audio-latest');
  expect(setup.systemInstruction).toEqual({ parts: [{ text: 'SYS' }] });
  expect(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
  expect(setup.inputAudioTranscription).toEqual({ languageCodes: ['ka-GE'] });
  expect(setup.outputAudioTranscription).toEqual({});
  expect(setup.sessionResumption).toEqual({});
  expect(setup.contextWindowCompression).toEqual({ slidingWindow: {} });
  expect(setup.tools).toEqual([{ googleSearch: {} }]);

  // The mint carries the call's locale/voice/persona for a server-locked setup, never a client-chosen model.
  expect(h.mintBodies[0]).toMatchObject({ locale: 'ka', voice: 'Charon', personaId: 'film-director', transcribe: true });
  expect(h.mintBodies[0]).not.toHaveProperty('model');

  // Capture runs on a 16 kHz context through the AudioWorklet, 40 ms frames.
  expect(h.capCtx.sampleRate).toBe(16000);
  expect(h.capCtx.audioWorklet.addModule).toHaveBeenCalledWith('/worklets/pcm-capture-processor.js');
  expect(h.worklets[0]!.name).toBe('pcm-capture-processor');
  expect(h.worklets[0]!.opts.processorOptions).toEqual({ frameSize: 640 });

  act(() => ws.receive({ setupComplete: {} }));
  expect(result.current.status).toBe('listening');
  unmount();
});

test('audio spoken before setupComplete is HELD and flushed in order right after it', async () => {
  const h = harness();
  const { result, unmount } = await startCall({ deps: h.deps });
  const ws = FakeSocket.last;
  const w = h.worklets[0]!;

  act(() => { w.emit(pcm(640, 1), 0.01); w.emit(pcm(640, 2), 0.01); }); // socket not even open
  act(() => ws.open());
  act(() => { w.emit(pcm(640, 3), 0.01); });                            // open, handshake pending
  expect(ws.sent.filter(isAudioFrame)).toHaveLength(0);

  act(() => ws.receive({ setupComplete: {} }));
  const audio = ws.sent.filter(isAudioFrame);
  expect(audio).toHaveLength(1);
  const flushed = framePcm(audio[0]!);
  expect(flushed).toHaveLength(1920);
  expect([flushed[0], flushed[640], flushed[1280]]).toEqual([1, 2, 3]); // oldest first, nothing lost

  act(() => { w.emit(pcm(640, 4), 0.01); }); // after setup: streamed straight through
  const after = ws.sent.filter(isAudioFrame);
  expect(after).toHaveLength(2);
  expect(framePcm(after[1]!)[0]).toBe(4);
  expect(result.current.status).toBe('listening');
  unmount();
});

test('local barge-in: user speech over the answer stops playback now and drops the rest of that answer', async () => {
  const h = harness();
  const { result, ws, unmount } = await connected({ deps: h.deps });
  const w = h.worklets[0]!;

  act(() => ws.receive(audioFrame()));
  expect(h.playCtx.sources).toHaveLength(1);
  const first = h.playCtx.sources[0]!;
  expect(first.startedAt).toBeCloseTo(0.05); // jitter lead on the first chunk
  expect(first.connections[0]).toBeInstanceOf(FakeGain); // through the gain node
  expect(result.current.status).toBe('speaking');

  // Echo-level input while the model talks is not a barge-in.
  h.advance(400);
  act(() => { for (let i = 0; i < 6; i++) { w.emit(pcm(640, 0), 0.004); h.advance(40); } });
  expect(first.stopped).toBe(false);

  // A clear over-talk sustained past the barge window → stop NOW.
  act(() => { for (let i = 0; i < 6; i++) { w.emit(pcm(640, 9000), 0.5); h.advance(40); } });
  expect(first.stopped).toBe(true);
  expect(result.current.status).toBe('listening');

  // The queued tail of the interrupted answer never plays…
  act(() => ws.receive(audioFrame()));
  expect(h.playCtx.sources).toHaveLength(1);
  // …until the server closes that turn; the next answer plays normally.
  act(() => ws.receive({ serverContent: { interrupted: true } }));
  act(() => ws.receive(audioFrame()));
  expect(h.playCtx.sources).toHaveLength(2);
  expect(h.playCtx.sources[1]!.stopped).toBe(false);
  unmount();
});

test('barging in on the BUFFERED tail (after turnComplete) stops playback but never swallows the next answer', async () => {
  const h = harness();
  const { result, ws, unmount } = await connected({ deps: h.deps });
  const w = h.worklets[0]!;
  // The server finished generating (turnComplete) while the answer is still playing from the local buffer.
  act(() => ws.receive(audioFrame()));
  act(() => ws.receive({ serverContent: { turnComplete: true } }));
  const tail = h.playCtx.sources[0]!;
  expect(tail.stopped).toBe(false);

  h.advance(400);
  act(() => { for (let i = 0; i < 6; i++) { w.emit(pcm(640, 9000), 0.5); h.advance(40); } });
  expect(tail.stopped).toBe(true);
  expect(result.current.status).toBe('listening');

  // No `interrupted` will come (nothing was generating) — the reply to what the user just said must still play.
  act(() => ws.receive(audioFrame()));
  expect(h.playCtx.sources).toHaveLength(2);
  expect(h.playCtx.sources[1]!.stopped).toBe(false);
  unmount();
});

test('the mint asks for everything the locked setup must carry: transcription, compression, the resumption handle', async () => {
  const h = harness();
  const { unmount } = await connected({ deps: h.deps, locale: 'ka' });
  expect(h.mintBodies[0]).toMatchObject({ transcribe: true, compression: true, resumptionHandle: null });
  unmount();
});

test('server interruption flushes playback; playback draining returns to listening', async () => {
  const h = harness();
  const { result, ws, unmount } = await connected({ deps: h.deps });
  act(() => { ws.receive(audioFrame()); ws.receive(audioFrame()); });
  expect(h.playCtx.sources[1]!.startedAt).toBeCloseTo(0.05 + 0.1); // gapless: queued on the cursor
  act(() => ws.receive({ serverContent: { interrupted: true } }));
  expect(h.playCtx.sources.every((s) => s.stopped)).toBe(true);
  expect(result.current.status).toBe('listening');

  act(() => ws.receive(audioFrame()));
  expect(result.current.status).toBe('speaking');
  act(() => h.playCtx.sources[2]!.onended?.());
  expect(result.current.status).toBe('listening');
  unmount();
});

test('goAway resumes on a new socket with the latest handle — same token, audio held across the gap', async () => {
  const h = harness();
  const { result, ws, unmount } = await connected({ deps: h.deps });
  act(() => ws.receive({ sessionResumptionUpdate: { newHandle: 'h-1', resumable: true } }));
  act(() => ws.receive({ sessionResumptionUpdate: { newHandle: 'h-2', resumable: true } }));
  act(() => ws.receive({ goAway: { timeLeft: '9s' } }));

  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  expect(ws.readyState).toBe(FakeSocket.CLOSED);
  expect(result.current.status).toBe('reconnecting');
  const ws2 = FakeSocket.last;
  expect(ws2.url).toContain('access_token=tok1');
  expect(h.fetchImpl).toHaveBeenCalledTimes(1);

  act(() => h.worklets[0]!.emit(pcm(640, 7), 0.01)); // spoken during the resume → held
  act(() => ws2.open());
  expect(ws2.sent[0]!.setup.sessionResumption).toEqual({ handle: 'h-2' });
  act(() => ws2.receive({ setupComplete: {} }));
  expect(framePcm(ws2.sent.filter(isAudioFrame)[0]!)[0]).toBe(7);
  expect(result.current.status).toBe('listening');
  unmount();
});

test('goAway during an answer waits for the turn to finish on the old connection, then resumes', async () => {
  const h = harness();
  const { ws, unmount } = await connected({ deps: h.deps });
  act(() => ws.receive({ sessionResumptionUpdate: { newHandle: 'h-9', resumable: true } }));
  act(() => ws.receive(audioFrame()));
  act(() => ws.receive({ goAway: { timeLeft: '30s' } }));
  expect(FakeSocket.all).toHaveLength(1);
  act(() => ws.receive({ serverContent: { turnComplete: true } }));
  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  act(() => FakeSocket.last.open());
  expect(FakeSocket.last.sent[0]!.setup.sessionResumption).toEqual({ handle: 'h-9' });
  unmount();
});

test('a dropped connection with no handle ends in connection_lost (retry offered), not a silent dead call', async () => {
  const h = harness();
  const { result, ws, unmount } = await connected({ deps: h.deps });
  act(() => ws.close(1011, 'internal'));
  expect(result.current.status).toBe('error');
  expect(result.current.error).toBe('connection_lost');
  expect(h.track.stop).toHaveBeenCalled();
  unmount();
});

test('transcripts become captions (pending → final) and reach onTurn user-first at the turn boundary; usage is reported', async () => {
  const h = harness();
  const turns: LiveTurn[] = [];
  const onUsage = jest.fn();
  const { result, ws, unmount } = await connected({ deps: h.deps, onTurn: (t) => turns.push(t), onUsage });

  act(() => ws.receive({ serverContent: { inputTranscription: { text: 'გამარჯობა' } } }));
  expect(result.current.captions).toEqual([{ id: 'u0', role: 'user', text: 'გამარჯობა', final: false }]);
  act(() => ws.receive({ serverContent: { outputTranscription: { text: 'გამარჯობა,' } } }));
  act(() => ws.receive({ serverContent: { outputTranscription: { text: '  როგორ ხარ?' } } }));
  expect(result.current.captions[1]).toEqual({ id: 'a0', role: 'assistant', text: 'გამარჯობა, როგორ ხარ?', final: false });
  expect(turns).toHaveLength(0);

  act(() => ws.receive({ serverContent: { turnComplete: true }, usageMetadata: { totalTokenCount: 42 } }));
  expect(turns).toEqual([
    { role: 'user', text: 'გამარჯობა' },
    { role: 'assistant', text: 'გამარჯობა, როგორ ხარ?' },
  ]);
  expect(result.current.captions.map((c) => [c.id, c.final])).toEqual([['u0', true], ['a0', true]]);
  expect(onUsage).toHaveBeenCalledWith({ totalTokens: 42 });

  // Ending mid-answer still writes what was said, marked interrupted.
  act(() => ws.receive({ serverContent: { inputTranscription: { text: 'კიდევ' } } }));
  act(() => ws.receive({ serverContent: { outputTranscription: { text: 'რა თქმა' } } }));
  act(() => result.current.stop());
  expect(turns.slice(2)).toEqual([{ role: 'user', text: 'კიდევ' }, { role: 'assistant', text: 'რა თქმა', interrupted: true }]);
  unmount();
});

test('without an onTurn prop, closed turns are dispatched as the window transcript event', async () => {
  const h = harness();
  const seen: LiveTurn[] = [];
  const listener = (e: Event) => seen.push((e as CustomEvent<LiveTurn>).detail);
  window.addEventListener(LIVE_TRANSCRIPT_EVENT, listener);
  const { ws, unmount } = await connected({ deps: h.deps });
  act(() => ws.receive({ serverContent: { inputTranscription: { text: 'hi' }, outputTranscription: { text: 'hello' }, turnComplete: true } }));
  window.removeEventListener(LIVE_TRANSCRIPT_EVENT, listener);
  expect(seen).toEqual([{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }]);
  unmount();
});

test('teardown releases everything: mic track, both AudioContexts, worklet, socket, playback', async () => {
  const h = harness();
  const { result, ws, unmount } = await connected({ deps: h.deps });
  act(() => ws.receive(audioFrame()));
  const src = h.playCtx.sources[0]!;
  const w = h.worklets[0]!;

  act(() => result.current.stop());
  expect(result.current.status).toBe('closed');
  expect(h.track.stop).toHaveBeenCalledTimes(1);
  expect(h.playCtx.closed).toBe(true);
  expect(h.capCtx.closed).toBe(true);
  expect(w.port.closed).toBe(true);
  expect(w.port.onmessage).toBeNull();
  expect(w.disconnected).toBe(true);
  expect(ws.readyState).toBe(FakeSocket.CLOSED);
  expect(src.stopped).toBe(true);

  // Nothing reaches a closed call.
  const sent = ws.sent.length;
  act(() => w.emit(pcm(640, 5), 0.3));
  expect(ws.sent).toHaveLength(sent);
  unmount();
});

test('unmount mid-call releases the same resources', async () => {
  const h = harness();
  const { ws, unmount } = await connected({ deps: h.deps });
  unmount();
  expect(h.track.stop).toHaveBeenCalled();
  expect(h.playCtx.closed && h.capCtx.closed).toBe(true);
  expect(ws.readyState).toBe(FakeSocket.CLOSED);
});

test('reentrancy: a double start is one call; End during the mint releases the mic that resolves afterwards', async () => {
  let release!: (r: Response) => void;
  const h = harness();
  h.fetchImpl.mockImplementationOnce(() => new Promise<Response>((r) => { release = r; }));
  const { result, unmount } = renderHook(() => useGeminiLiveSession({ deps: h.deps }));
  let p1!: Promise<void>;
  let p2!: Promise<void>;
  act(() => { p1 = result.current.start(); p2 = result.current.start(); });
  expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  expect(h.getUserMedia).toHaveBeenCalledTimes(1);

  act(() => result.current.stop());
  await act(async () => {
    release(reply(200, { token: 'late', expiresAt: future() }));
    await p1; await p2;
  });
  await waitFor(() => expect(h.track.stop).toHaveBeenCalled());
  expect(FakeSocket.all).toHaveLength(0); // the late token never opened a socket
  expect(result.current.status).toBe('closed');
  unmount();
});

test('a handshake with no setupComplete times out and retries ONCE on the legacy wire; a second miss is an error', async () => {
  const h = harness();
  const { result, unmount } = await startCall({ deps: h.deps, setupTimeoutMs: 30 });
  act(() => FakeSocket.last.open()); // opens, but Google never answers

  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  expect(h.fetchImpl).toHaveBeenCalledTimes(2); // fresh token for the retry
  expect(result.current.degraded).toBe(true);
  const ws2 = FakeSocket.last;
  expect(ws2.url).toContain('access_token=tok2');
  act(() => ws2.open());
  const legacy = ws2.sent[0]!.setup;
  expect(legacy.systemInstruction).toBeDefined();
  expect(legacy).not.toHaveProperty('inputAudioTranscription');
  expect(legacy).not.toHaveProperty('sessionResumption');
  expect(legacy).not.toHaveProperty('contextWindowCompression');

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.error).toBe('setup_failed');
  expect(h.track.stop).toHaveBeenCalled();
  unmount();
});

test('a rejected setup (socket closed before setupComplete) retries on the legacy wire and connects', async () => {
  const h = harness();
  const { result, unmount } = await startCall({ deps: h.deps, setupTimeoutMs: 5000 });
  act(() => FakeSocket.last.close(1007, 'Invalid JSON payload')); // rejected setup
  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  act(() => FakeSocket.last.open());
  act(() => FakeSocket.last.receive({ setupComplete: {} }));
  expect(result.current.status).toBe('listening');
  expect(result.current.degraded).toBe(true);
  unmount();
});

test('503 from the mint hands off via onUnavailable (the ChatChrome fallback contract): no socket, mic released', async () => {
  const h = harness(() => ({ error: 'gemini_live_disabled' }), 503);
  const onUnavailable = jest.fn();
  const { result, unmount } = await startCall({ deps: h.deps, onUnavailable });
  expect(onUnavailable).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('idle');
  expect(FakeSocket.all).toHaveLength(0);
  await waitFor(() => expect(h.track.stop).toHaveBeenCalled());
  unmount();
});

test('mint errors map to typed codes (401 → auth, 429 → rate_limited)', async () => {
  for (const [status, code] of [[401, 'auth'], [429, 'rate_limited'], [500, 'mint_failed']] as const) {
    FakeSocket.all = [];
    FakeAudioContext.all = [];
    const h = harness(() => ({ error: 'x' }), status);
    const { result, unmount } = await startCall({ deps: h.deps });
    expect(result.current.error).toBe(code);
    expect(result.current.status).toBe('error');
    unmount();
  }
});

test('a server-built setup from the mint is sent as-is (resumption handle added), not rebuilt on the client', async () => {
  const server = { model: 'models/gemini-2.5-flash-native-audio-latest', generationConfig: { responseModalities: ['AUDIO'] }, systemInstruction: { parts: [{ text: 'SERVER' }] } };
  // The route's real response shape: the locked frame travels as `setupMessage`.
  const h = harness((n) => ({ token: `tok${n}`, expiresAt: future(), setupMessage: { setup: server } }));
  const { ws, unmount } = await connected({ deps: h.deps, systemInstruction: 'CLIENT' });
  expect(ws.sent[0]).toEqual({ setup: { ...server, sessionResumption: {} } });
  unmount();
});

test('a tool call nobody handles is answered not_supported, so the model never waits forever', async () => {
  const h = harness();
  const { ws, unmount } = await connected({ deps: h.deps });
  act(() => ws.receive({ toolCall: { functionCalls: [{ id: 'c1', name: 'make_video', args: {} }] } }));
  await waitFor(() => expect(ws.sent[ws.sent.length - 1]).toEqual({
    toolResponse: { functionResponses: [{ id: 'c1', name: 'make_video', response: { error: 'not_supported' } }] },
  }));
  unmount();
});

// ─── Voice-to-action transport (lib/voice/liveTools.ts) ────────────────────────

test('actions: the mint asks for the declarations; the host answers each call by id; a cancellation reaches the host', async () => {
  const h = harness();
  const onToolCall = jest.fn((calls: Array<{ id: string; name: string }>) =>
    calls.map((c) => ({ id: c.id, name: c.name, response: { ok: true, summary: 'done' } })));
  const onToolCallCancellation = jest.fn();
  const { ws, unmount } = await connected({ deps: h.deps, actions: true, onToolCall, onToolCallCancellation });
  expect(h.mintBodies[0]).toMatchObject({ transcribe: true, actions: true });
  expect(h.mintBodies[0]).not.toHaveProperty('tools');

  act(() => ws.receive({ toolCall: { functionCalls: [
    { id: 'c1', name: 'open_studio', args: { tool: 'video' } },
    { id: 'c2', name: 'end_call', args: {} },
  ] } }));
  await waitFor(() => expect(ws.sent[ws.sent.length - 1]).toEqual({ toolResponse: { functionResponses: [
    { id: 'c1', name: 'open_studio', response: { ok: true, summary: 'done' } },
    { id: 'c2', name: 'end_call', response: { ok: true, summary: 'done' } },
  ] } }));
  expect(onToolCall).toHaveBeenCalledTimes(1);

  act(() => ws.receive({ toolCallCancellation: { ids: ['c1'] } }));
  expect(onToolCallCancellation).toHaveBeenCalledWith(['c1']);
  unmount();
});

// ─── Talk to a research report (lib/research/liveContext.ts) ───────────────────

test('researchId: ONLY the id rides in the mint (the server loads the report for the owner); without it the field is absent', async () => {
  const h = harness();
  const { unmount } = await connected({ deps: h.deps, researchId: '22222222-2222-4222-8222-222222222222' });
  expect(h.mintBodies[0]).toMatchObject({ researchId: '22222222-2222-4222-8222-222222222222', transcribe: true });
  expect(JSON.stringify(h.mintBodies[0])).not.toMatch(/report/i);
  unmount();
  FakeSocket.all = [];
  const h2 = harness();
  const { unmount: u2 } = await connected({ deps: h2.deps });
  expect(h2.mintBodies[0]).not.toHaveProperty('researchId');
  u2();
  FakeSocket.all = [];
  const h3 = harness();
  const { unmount: u3 } = await connected({ deps: h3.deps, researchId: '' });
  expect(h3.mintBodies[0]).not.toHaveProperty('researchId');
  u3();
});

test('without the opt-in nothing asks for actions; parity:false mints with tools:false (lock = the tool-less frame)', async () => {
  const h = harness();
  const { unmount } = await connected({ deps: h.deps, onToolCall: () => [] });
  expect(h.mintBodies[0]).not.toHaveProperty('actions');
  unmount();
  FakeSocket.all = [];
  const h2 = harness();
  const { unmount: u2 } = await connected({ deps: h2.deps, parity: false, actions: true });
  expect(h2.mintBodies[0]).toMatchObject({ transcribe: false, tools: false });
  expect(h2.mintBodies[0]).not.toHaveProperty('actions');
  u2();
});

test('a refused handshake WITH actions retries the parity wire WITHOUT them (captions kept), then the tool-less legacy wire', async () => {
  const h = harness();
  const { result, unmount } = await startCall({ deps: h.deps, actions: true, setupTimeoutMs: 5000 });
  act(() => FakeSocket.last.close(1007, 'Invalid argument: function_declarations')); // the session refused the setup
  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  // Step 2: fresh token, still parity, no declarations.
  expect(h.mintBodies[1]).toMatchObject({ transcribe: true, compression: true });
  expect(h.mintBodies[1]).not.toHaveProperty('actions');
  expect(h.mintBodies[1]).not.toHaveProperty('tools');
  expect(result.current.degraded).toBe(false);

  act(() => FakeSocket.last.close(1007, 'still refused'));
  await waitFor(() => expect(FakeSocket.all).toHaveLength(3));
  // Step 3: the legacy wire — its mint locks no tools at all.
  expect(h.mintBodies[2]).toMatchObject({ transcribe: false, tools: false });
  expect(h.mintBodies[2]).not.toHaveProperty('actions');
  expect(result.current.degraded).toBe(true);
  act(() => FakeSocket.last.open());
  expect(FakeSocket.last.sent[0]!.setup).not.toHaveProperty('tools');
  act(() => FakeSocket.last.receive({ setupComplete: {} }));
  expect(result.current.status).toBe('listening');
  unmount();
});

test('a mint that locked no declarations (actions:false) skips the pointless no-actions retry', async () => {
  const h = harness((n) => ({ token: `tok${n}`, model: 'models/gemini-2.5-flash-native-audio-latest', expiresAt: future(), actions: false }));
  const { result, unmount } = await startCall({ deps: h.deps, actions: true, setupTimeoutMs: 5000 });
  act(() => FakeSocket.last.close(1007, 'refused'));
  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  expect(h.fetchImpl).toHaveBeenCalledTimes(2);
  expect(h.mintBodies[1]).toMatchObject({ transcribe: false, tools: false }); // straight to the legacy wire
  expect(result.current.degraded).toBe(true);
  unmount();
});

test('the no-actions retry that connects keeps the parity wire: captions on, resumption asked', async () => {
  const h = harness();
  const { result, unmount } = await startCall({ deps: h.deps, actions: true, setupTimeoutMs: 5000 });
  act(() => FakeSocket.last.close(1007, 'refused'));
  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  const ws2 = FakeSocket.last;
  act(() => ws2.open());
  expect(ws2.sent[0]!.setup.inputAudioTranscription).toBeDefined();
  expect(ws2.sent[0]!.setup.sessionResumption).toEqual({});
  expect(ws2.sent[0]!.setup).not.toHaveProperty('tools');
  act(() => ws2.receive({ setupComplete: {} }));
  expect(result.current.status).toBe('listening');
  expect(result.current.degraded).toBe(false);
  unmount();
});

test('mute stops sending (and holds nothing), tells the server the stream ended, and zeroes the input level', async () => {
  const h = harness();
  const { result, ws, unmount } = await connected({ deps: h.deps });
  act(() => result.current.setMuted(true));
  expect(h.track.enabled).toBe(false);
  expect(ws.sent[ws.sent.length - 1]).toEqual({ realtimeInput: { audioStreamEnd: true } });
  const sent = ws.sent.length;
  act(() => h.worklets[0]!.emit(pcm(640, 3), 0.4));
  expect(ws.sent).toHaveLength(sent);
  expect(result.current.getLevels().input).toBe(0);
  act(() => result.current.toggleMute());
  act(() => h.worklets[0]!.emit(pcm(640, 3), 0.1));
  expect(ws.sent).toHaveLength(sent + 1);
  expect(result.current.getLevels().input).toBeGreaterThan(0);
  unmount();
});

test('a capture context the mic cannot join (Firefox) falls back to the native-rate context + JS downsampling', async () => {
  const h = harness();
  const create = h.deps.createAudioContext!;
  h.deps.createAudioContext = ((opts?: AudioContextOptions) => {
    const ctx = create(opts) as unknown as FakeAudioContext;
    if (opts?.sampleRate === 16000) ctx.createMediaStreamSource = () => { throw new Error('different sample-rate'); };
    return ctx;
  }) as LiveSessionDeps['createAudioContext'];
  const { ws, unmount } = await connected({ deps: h.deps });
  expect(h.capCtx.closed).toBe(true);
  expect(h.worklets[0]!.ctx).toBe(h.playCtx); // 48 kHz
  expect(h.worklets[0]!.opts.processorOptions).toEqual({ frameSize: 1920 });
  act(() => h.worklets[0]!.emit(pcm(1920, 100), 0.01));
  const sent = framePcm(ws.sent.filter(isAudioFrame)[0]!);
  expect(sent.length).toBeGreaterThanOrEqual(639);
  expect(sent.length).toBeLessThanOrEqual(641);
  unmount();
});

// ─── Microphone ────────────────────────────────────────────────────────────────

const flushMicrotasks = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe('microphone', () => {
  test('a denied mic: specific code + the browser\'s error name, NO socket, one telemetry report', async () => {
    const h = harness();
    h.getUserMedia.mockImplementation(async () => { throw domErr('NotAllowedError', 'Permission denied'); });
    const { result, unmount } = await startCall({ deps: h.deps, locale: 'en' });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('mic_denied');
    expect(result.current.errorDetail).toEqual({ name: 'NotAllowedError', message: 'Permission denied' });
    expect(FakeSocket.all).toHaveLength(0); // a call that cannot hear never connects
    expect(h.report).toHaveBeenCalledTimes(1);
    expect(h.report).toHaveBeenCalledWith('mic_denied', { name: 'NotAllowedError', message: 'Permission denied' }, expect.objectContaining({
      attempts: [expect.objectContaining({ step: 'full', name: 'NotAllowedError' })],
      locale: 'en',
      primed: false,
      mints: 1,
    }));
    unmount();
  });

  test('NotFoundError with no audio inputs → mic_not_found', async () => {
    const h = harness();
    h.getUserMedia.mockImplementation(async () => { throw domErr('NotFoundError'); });
    h.deps.enumerateDevices = async () => [];
    const { result, unmount } = await startCall({ deps: h.deps });
    expect(result.current.error).toBe('mic_not_found');
    expect(h.report.mock.calls[0]![2]).toMatchObject({ audioInputs: 0 });
    unmount();
  });

  test('a busy device: other holders are asked to release BEFORE the first request, then 400 ms / 1 s back-off, then it connects', async () => {
    const h = harness();
    const log: string[] = [];
    const onRelease = (e: Event) => log.push(`release:${(e as CustomEvent<MicReleaseDetail>).detail.reason}`);
    window.addEventListener(MIC_RELEASE_EVENT, onRelease);
    h.getUserMedia
      .mockImplementationOnce(async () => { log.push('gum'); throw domErr('NotReadableError', 'Could not start audio source'); })
      .mockImplementationOnce(async () => { log.push('gum'); throw domErr('NotReadableError'); })
      .mockImplementationOnce(async () => { log.push('gum'); return h.stream; });
    const { result, unmount } = await startCall({ deps: h.deps });
    window.removeEventListener(MIC_RELEASE_EVENT, onRelease);
    expect(log[0]).toBe('release:live');
    expect(log.filter((x) => x === 'gum')).toHaveLength(3);
    expect(h.getUserMedia.mock.calls[2]![0]).toEqual({ audio: true });
    expect(h.sleeps).toEqual([400, 1000]);
    const ws = FakeSocket.last;
    act(() => ws.open());
    act(() => ws.receive({ setupComplete: {} }));
    expect(result.current.status).toBe('listening');
    expect(h.report).not.toHaveBeenCalled();
    unmount();
  });

  test('OverconstrainedError steps the constraints down and still connects', async () => {
    const h = harness();
    h.getUserMedia
      .mockRejectedValueOnce(domErr('OverconstrainedError'))
      .mockRejectedValueOnce(domErr('OverconstrainedError'));
    const { unmount } = await startCall({ deps: h.deps });
    expect(h.getUserMedia.mock.calls.map((c) => c[0])).toEqual([MIC_CONSTRAINTS.full, MIC_CONSTRAINTS.basic, MIC_CONSTRAINTS.bare]);
    expect(FakeSocket.all).toHaveLength(1);
    unmount();
  });

  test.each([
    { who: 'in-app browser', ua: FB_UA, code: 'mic_in_app' },
    { who: 'desktop Chrome', ua: CHROME_UA, code: 'mic_unavailable' },
  ])('a getUserMedia that throws TypeError synchronously ($who) → $code, never an uncaught throw', async ({ ua, code }) => {
    const h = harness();
    h.deps.userAgent = ua;
    h.getUserMedia.mockImplementation(() => { throw new TypeError("Cannot read properties of undefined (reading 'getUserMedia')"); });
    const { result, unmount } = await startCall({ deps: h.deps });
    expect(result.current.error).toBe(code);
    expect(result.current.errorDetail?.name).toBe('TypeError');
    unmount();
  });

  test('no getUserMedia at all (an in-app WebView) → mic_in_app; an http page → mic_insecure', async () => {
    const h = harness();
    h.deps.getUserMedia = null;
    h.deps.userAgent = FB_UA;
    const a = await startCall({ deps: h.deps });
    expect(a.result.current.error).toBe('mic_in_app');
    a.unmount();

    const h2 = harness();
    h2.deps.isSecureContext = false;
    const b = await startCall({ deps: h2.deps });
    expect(b.result.current.error).toBe('mic_insecure');
    expect(h2.getUserMedia).not.toHaveBeenCalled();
    b.unmount();
  });

  test('End during the busy back-off: no further request, the call stays closed', async () => {
    const h = harness();
    let wake!: () => void;
    h.deps.sleep = jest.fn(() => new Promise<void>((r) => { wake = r; }));
    h.getUserMedia.mockImplementation(async () => { throw domErr('NotReadableError'); });
    const { result, unmount } = renderHook(() => useGeminiLiveSession({ deps: h.deps }));
    let p!: Promise<void>;
    act(() => { p = result.current.start(); });
    await act(async () => { await flushMicrotasks(); });
    expect(h.deps.sleep).toHaveBeenCalledWith(400);
    act(() => result.current.stop());
    await act(async () => { wake(); await p; });
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('closed');
    expect(FakeSocket.all).toHaveLength(0);
    unmount();
  });

  test('status stays "connecting" and no socket exists while the mic is pending; listening needs mic AND setupComplete', async () => {
    const h = harness();
    let grant!: (s: MediaStream) => void;
    h.getUserMedia.mockImplementationOnce(() => new Promise<MediaStream>((r) => { grant = r; }));
    const { result, unmount } = renderHook(() => useGeminiLiveSession({ deps: h.deps }));
    let p!: Promise<void>;
    act(() => { p = result.current.start(); });
    await act(async () => { await flushMicrotasks(); });
    expect(h.fetchImpl).toHaveBeenCalledTimes(1); // the mint runs in parallel…
    expect(FakeSocket.all).toHaveLength(0); // …but nothing connects before the mic
    expect(result.current.status).toBe('connecting');
    await act(async () => { grant(h.stream); await p; });
    const ws = FakeSocket.last;
    act(() => ws.open());
    expect(result.current.status).toBe('connecting');
    act(() => ws.receive({ setupComplete: {} }));
    expect(result.current.status).toBe('listening');
    unmount();
  });

  test(`a mic granted more than ${LIVE_TOKEN_FRESH_MS / 1000} s after the mint gets a fresh token before the socket opens`, async () => {
    const h = harness();
    let grant!: (s: MediaStream) => void;
    h.getUserMedia.mockImplementationOnce(() => new Promise<MediaStream>((r) => { grant = r; }));
    const { unmount, result } = renderHook(() => useGeminiLiveSession({ deps: h.deps }));
    let p!: Promise<void>;
    act(() => { p = result.current.start(); });
    await act(async () => { await flushMicrotasks(); }); // the first mint lands
    h.advance(LIVE_TOKEN_FRESH_MS + 1000); // the user read the permission prompt for a while
    await act(async () => { grant(h.stream); await p; });
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
    expect(FakeSocket.last.url).toContain('access_token=tok2');
    unmount();
  });

  test('a track that ends mid-call is re-acquired once; a second loss ends the call as mic_lost', async () => {
    const h = harness();
    const track2 = makeTrack();
    const { result, ws, unmount } = await connected({ deps: h.deps });
    h.getUserMedia.mockResolvedValueOnce(streamOf(track2));
    await act(async () => { h.track.fire('ended'); await flushMicrotasks(); });
    expect(h.getUserMedia).toHaveBeenCalledTimes(2);
    expect(h.worklets).toHaveLength(2);
    expect(h.capCtx.audioWorklet.addModule).toHaveBeenCalledTimes(1); // the module is loaded once per context
    expect(result.current.status).toBe('listening');
    const before = ws.sent.filter(isAudioFrame).length;
    act(() => h.worklets[1]!.emit(pcm(640, 3), 0.01));
    expect(ws.sent.filter(isAudioFrame)).toHaveLength(before + 1); // the new mic reaches the socket

    act(() => track2.fire('ended'));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('mic_lost');
    expect(h.report).toHaveBeenCalledWith('mic_lost', expect.anything(), expect.anything());
    unmount();
  });

  test('a lost track whose re-acquire fails → mic_lost with the browser\'s reason', async () => {
    const h = harness();
    const { result, unmount } = await connected({ deps: h.deps });
    h.getUserMedia.mockRejectedValueOnce(domErr('NotAllowedError', 'Permission denied'));
    await act(async () => { h.track.fire('ended'); await flushMicrotasks(); });
    expect(result.current.error).toBe('mic_lost');
    expect(result.current.errorDetail?.name).toBe('NotAllowedError');
    unmount();
  });

  test('the capture worklet is PULLED: one output → a zero gain → the destination', async () => {
    const h = harness();
    const { unmount } = await connected({ deps: h.deps });
    const w = h.worklets[0]!;
    expect(w.opts.numberOfOutputs).toBe(1);
    const sink = w.connections[0] as FakeGain;
    expect(sink).toBeInstanceOf(FakeGain);
    expect(sink.gain.value).toBe(0);
    expect(sink.connections[0]).toBe(h.capCtx.destination);
    unmount();
  });

  test(`Retry after mic_busy asks for release, waits ${LIVE_MIC_BUSY_RETRY_PAUSE_MS} ms, then starts with the context made in the tap`, async () => {
    const h = harness();
    h.getUserMedia.mockImplementation(async () => { throw domErr('NotReadableError'); });
    const { result, unmount } = await startCall({ deps: h.deps });
    expect(result.current.error).toBe('mic_busy');

    let wake!: () => void;
    h.deps.sleep = jest.fn((ms: number) => {
      h.sleeps.push(ms);
      return ms === LIVE_MIC_BUSY_RETRY_PAUSE_MS ? new Promise<void>((r) => { wake = r; }) : Promise.resolve();
    });
    h.getUserMedia.mockReset();
    h.getUserMedia.mockImplementation(async () => h.stream);
    const releases: string[] = [];
    const onRelease = (e: Event) => releases.push((e as CustomEvent<MicReleaseDetail>).detail.reason);
    window.addEventListener(MIC_RELEASE_EVENT, onRelease);
    const ctxsBefore = FakeAudioContext.all.length;
    act(() => result.current.retry());
    expect(releases).toEqual(['live']);
    expect(FakeAudioContext.all).toHaveLength(ctxsBefore + 1); // playback context created INSIDE the tap
    const tapCtx = FakeAudioContext.all[ctxsBefore]!;
    expect(result.current.status).toBe('connecting');
    expect(result.current.error).toBeNull();
    expect(h.sleeps[h.sleeps.length - 1]).toBe(LIVE_MIC_BUSY_RETRY_PAUSE_MS);
    await act(async () => { await flushMicrotasks(); });
    expect(h.getUserMedia).not.toHaveBeenCalled(); // still waiting out the pause

    await act(async () => { wake(); await flushMicrotasks(); await flushMicrotasks(); });
    window.removeEventListener(MIC_RELEASE_EVENT, onRelease);
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    const ws = FakeSocket.last;
    act(() => ws.open());
    act(() => ws.receive({ setupComplete: {} }));
    act(() => ws.receive(audioFrame()));
    expect(tapCtx.sources).toHaveLength(1); // the call plays through the context the tap created
    unmount();
  });

  test('the gesture prime is adopted: its context plays, its mic is used, no second getUserMedia', async () => {
    const h = harness();
    const primedCtx = new FakeAudioContext();
    h.deps.takePrimed = () => ({ playCtx: primedCtx as unknown as AudioContext, mic: Promise.resolve(h.stream), at: 0 });
    const { ws, unmount } = await connected({ deps: h.deps });
    expect(h.getUserMedia).not.toHaveBeenCalled();
    expect(FakeAudioContext.all.filter((c) => c.sampleRate !== 16000)).toEqual([primedCtx]); // no second playback context
    act(() => ws.receive(audioFrame()));
    expect(primedCtx.sources).toHaveLength(1);
    unmount();
    expect(primedCtx.closed).toBe(true);
  });

  test('a failed prime continues the ladder instead of failing the call', async () => {
    const h = harness();
    h.deps.takePrimed = () => ({ playCtx: null, mic: Promise.reject(domErr('NotReadableError')), at: 0 });
    const { unmount } = await startCall({ deps: h.deps });
    expect(h.sleeps).toEqual([400]);
    expect(h.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeSocket.all).toHaveLength(1);
    unmount();
  });

  test('a playback context that will not start without a gesture shows "tap to start"; resumeAudio clears it', async () => {
    jest.useFakeTimers();
    try {
      class GestureCtx extends FakeAudioContext {
        state: AudioContextState = 'suspended';
        allow = false;
        private listeners = new Set<() => void>();
        addEventListener(_t: string, fn: () => void) { this.listeners.add(fn); }
        removeEventListener(_t: string, fn: () => void) { this.listeners.delete(fn); }
        resume() {
          if (this.allow && this.state !== 'running') { this.state = 'running'; this.listeners.forEach((fn) => fn()); }
          return Promise.resolve();
        }
      }
      const h = harness();
      let play!: GestureCtx;
      h.deps.createAudioContext = ((opts?: AudioContextOptions) => {
        if (opts?.sampleRate) return new FakeAudioContext(opts);
        play = new GestureCtx(opts);
        return play;
      }) as unknown as LiveSessionDeps['createAudioContext'];
      const { result, unmount } = await startCall({ deps: h.deps });
      expect(result.current.audioBlocked).toBe(false);
      act(() => { jest.advanceTimersByTime(1200); });
      expect(result.current.audioBlocked).toBe(true);
      play.allow = true; // the next call happens inside a tap
      await act(async () => { result.current.resumeAudio(); await Promise.resolve(); });
      expect(result.current.audioBlocked).toBe(false);
      unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test('mic helpers: failure kinds map to screen codes; every mic code is recognised as one', () => {
    expect(micErrorCodeFor('denied')).toBe('mic_denied');
    expect(micErrorCodeFor('system_denied')).toBe('mic_system_denied');
    expect(micErrorCodeFor('not_found')).toBe('mic_not_found');
    expect(micErrorCodeFor('busy')).toBe('mic_busy');
    expect(micErrorCodeFor('timeout')).toBe('mic_busy');
    expect(micErrorCodeFor('in_app')).toBe('mic_in_app');
    expect(micErrorCodeFor('insecure')).toBe('mic_insecure');
    expect(micErrorCodeFor('no_api')).toBe('mic_unavailable');
    expect(micErrorCodeFor('constraint')).toBe('mic_unavailable');
    expect(isMicErrorCode('mic_lost')).toBe(true);
    expect(isMicErrorCode('connection_lost')).toBe(false);
    expect(isMicErrorCode(null)).toBe(false);
  });
});

// ─── Pure helpers ──────────────────────────────────────────────────────────────

describe('createPcmDownsampler', () => {
  const tone = (hz: number, len: number, offset: number) =>
    Int16Array.from({ length: len }, (_, i) => Math.round(0.5 * 32767 * Math.sin((2 * Math.PI * hz * (offset + i)) / 48000)));
  const run = (hz: number) => {
    const ds = createPcmDownsampler(48000, 16000);
    const out: number[] = [];
    for (let k = 0; k < 10; k++) out.push(...ds(tone(hz, 1920, k * 1920)));
    return out;
  };
  const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + (x / 32767) ** 2, 0) / xs.length);

  it('keeps speech-band audio at 1/3 the samples, continuous across chunk boundaries', () => {
    const out = run(1000);
    expect(out.length).toBeGreaterThanOrEqual(6395);
    expect(out.length).toBeLessThanOrEqual(6400);
    expect(rms(out.slice(200))).toBeCloseTo(0.5 / Math.SQRT2, 1);
    let maxStep = 0;
    for (let i = 201; i < out.length; i++) maxStep = Math.max(maxStep, Math.abs(out[i]! - out[i - 1]!));
    expect(maxStep).toBeLessThan(7000); // a 1 kHz sine at 16 kHz never jumps more than ~6.4k per sample
  });

  it('removes content above the new Nyquist instead of folding it into the speech band', () => {
    expect(rms(run(12000).slice(200))).toBeLessThan(0.01);
  });

  it('is the identity when no rate change is needed', () => {
    const x = new Int16Array([1, 2, 3]);
    expect(createPcmDownsampler(16000, 16000)(x)).toBe(x);
  });
});

test('small helpers', () => {
  expect(playbackRateFromMime('audio/pcm;rate=24000')).toBe(24000);
  expect(playbackRateFromMime('audio/pcm')).toBe(24000);
  expect(playbackRateFromMime('audio/pcm;rate=999999')).toBe(24000);
  expect(normalizeCaption('  a   b \n c ')).toBe('a b c');
});

describe('buildLiveInstruction', () => {
  const now = new Date('2026-09-30T08:00:00Z');

  it('default call: live persona + Google-only platform prompt + spoken-call rules, model-default temperature', () => {
    const r = buildLiveInstruction({ locale: 'ka', now });
    expect(r.systemInstruction.startsWith(liveVoicePersona('ka'))).toBe(true);
    expect(r.systemInstruction).toContain('Veo');
    expect(r.systemInstruction).toContain(LIVE_SPOKEN_RULE);
    expect(r.systemInstruction).toContain(LIVE_LANGUAGE_RULE);
    for (const vendor of ['Runway', 'FLUX', 'HeyGen', 'Udio', 'ElevenLabs']) expect(r.systemInstruction).not.toContain(vendor);
    expect(r).not.toHaveProperty('temperature');
    expect(r.voiceName).toBe('Aoede');
    expect(r.googleSearch).toBe(true);
    expect(r.personaActive).toBe(false);
  });

  it('an active persona adds its block once and sends its temperature', () => {
    const r = buildLiveInstruction({ locale: 'en', personaId: 'film-director', now });
    expect(r.personaActive).toBe(true);
    expect(typeof r.temperature).toBe('number');
    expect(r.systemInstruction.split(LIVE_SPOKEN_RULE)).toHaveLength(2); // exactly once
  });

  it('a persona override replaces only the live persona', () => {
    const r = buildLiveInstruction({ locale: 'ru', personaOverride: 'CUSTOM VOICE', now });
    expect(r.systemInstruction.startsWith('CUSTOM VOICE\n\n')).toBe(true);
    expect(r.systemInstruction).toContain(LIVE_SPOKEN_RULE);
  });
});
