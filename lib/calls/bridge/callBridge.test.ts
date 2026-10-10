/**
 * @jest-environment node
 *
 * ONE WhatsApp call end to end, with nothing real outside this process: a MOCKED Meta, a FAKE media peer, a SCRIPTED
 * Gemini Live socket. Everything between them is the real code: the call webhook handler, the gates and ticket
 * (lib/calls/whatsapp/callService), the bridge API (bridgeApi.ts) reached through the bridge's own HTTP client, the
 * phone tools, and the bridge (callBridge.ts) with its resampling, playout, barge-in, resume and limits.
 *
 * Simulated, not proven: real WebRTC with Meta, real Opus, real Gemini Live, real Georgian speech. Those need a funded
 * call (owner's word) and stay BUILT_NOT_PROVEN.
 */
import { handleBridgeRequest, type BridgeApiDeps } from '@/lib/calls/whatsapp/bridgeApi';
import { handleCallEvents, MAX_LIVE_MINTS, type CallServiceDeps } from '@/lib/calls/whatsapp/callService';
import { memoryKv, readCall, readHeard } from '@/lib/calls/whatsapp/callStore';
import { parseCallEvents } from '@/lib/calls/whatsapp/events';
import type { PhoneToolDeps } from '@/lib/calls/whatsapp/phoneTools';
import { SDP_ANSWER, SDP_OFFER, connectPayload, terminatePayload } from '@/lib/calls/whatsapp/testFixtures';
import type { TaskView } from '@/lib/tasks/taskView';
import { createAppClient } from './appClient';
import { CallBridge, WRAP_UP_NOTE, type MediaPeer, type PeerState } from './callBridge';
import type { LiveSocket } from './liveLink';
import { FRAME_48K, pcm16FromBase64, pcm16ToBase64, rms } from './pcm';

const SECRET = 'bridge-e2e-secret-for-tests-'.padEnd(48, 'q');
const T0 = 1_760_000_000_000;
const CALL = 'wacid.E2E';

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void };
const deferred = <T,>(): Deferred<T> => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const settle = async (n = 30) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

function world(opts: { tasks?: TaskView[]; balance?: () => Promise<number | null>; session?: (n: number) => Promise<void> } = {}) {
  const kv = memoryKv();
  const clock = { t: T0 + 1000 };
  const offers: string[] = [];
  const metaCalls: string[] = [];
  const mints: Array<string | null> = [];
  const ops: string[] = [];
  const cancelled: string[] = [];
  const call: CallServiceDeps = {
    kv, now: () => clock.t, policy: { enabled: true, creditsPerMinute: 10, minFundedMinutes: 2, outboundPerDay: 2 }, secret: SECRET,
    origin: 'https://myavatar.example',
    findLink: async () => ({ state: 'linked', userId: 'u1' }),
    readCallPrefs: async () => ({ calls: { enabled: true, perCallMinutes: 15, dailyMinutes: 30 }, timezone: 'Asia/Tbilisi' }),
    balance: async () => 500, minutesToday: async () => 0,
    bridge: { ready: async () => true, offer: async (x) => { offers.push(x.ticket); return true; } },
    meta: async (x) => { metaCalls.push(x.action); return { ok: true, status: 200, errorCode: null }; },
    tell: async () => undefined, audit: async () => undefined,
  };
  const tools = {
    now: () => clock.t, scope: 'service', mediaOpen: async () => false,
    balance: opts.balance ?? (async () => 42),
    listTasks: async () => opts.tasks ?? [],
    cancelTask: async (_u: string, id: string) => { cancelled.push(id); return 'cancelled'; },
    heard: (id: string) => readHeard(kv, id),
    plans: { list: async () => [], add: async () => { throw new Error('x'); } },
    planMp3: async () => ({ ok: false, error: 'x' }), startFree: async () => ({ ok: false, error: 'x' }), sendConfirm: async () => false,
    deliver: async () => ({ sent: false, mode: 'none' }), scheduleCallback: async () => 'unavailable',
  } as PhoneToolDeps;
  const deps: BridgeApiDeps = {
    call, tools,
    session: async (_t, handle) => {
      mints.push(handle);
      await opts.session?.(mints.length);
      return { ok: true, token: `tok-${mints.length}`, setupMessage: { setup: { model: 'models/test-live' } } as never, expiresAt: 'x' };
    },
  };
  // The bridge's HTTP client, routed straight into the app's handler (no network).
  const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const op = String(url).split('/').pop()!;
    const auth = (init?.headers as Record<string, string>).Authorization ?? '';
    ops.push(op);
    const r = await handleBridgeRequest(deps, op, auth.startsWith('Bearer ') ? auth.slice(7) : null, JSON.parse(String(init?.body ?? '{}')));
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof globalThis.fetch;
  return { kv, clock, offers, metaCalls, mints, ops, cancelled, deps, fetch };
}

interface Frame {
  setup?: unknown;
  realtimeInput?: { audio?: { mimeType: string; data: string }; text?: string };
  toolResponse?: { functionResponses: Array<{ id: string; name: string; response: Record<string, unknown> }> };
}

class FakeSocket implements LiveSocket {
  sent: Frame[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((d: string) => void) | null = null;
  onclose: ((c: number, r: string) => void) | null = null;
  onerror: ((m: string) => void) | null = null;
  constructor(readonly url: string) {}
  send(d: string) {
    const m = JSON.parse(d) as Frame;
    this.sent.push(m);
    if (m.setup) queueMicrotask(() => this.emit({ setupComplete: {} }));
  }
  close() { this.closed = true; }
  emit(obj: unknown) { this.onmessage?.(JSON.stringify(obj)); }
  drop(code = 1011) { this.onclose?.(code, 'gone'); }
  audioIn() { return this.sent.filter((m) => m.realtimeInput?.audio); }
}

class FakeLive {
  sockets: FakeSocket[] = [];
  open = (url: string): LiveSocket => {
    const s = new FakeSocket(url);
    this.sockets.push(s);
    queueMicrotask(() => s.onopen?.());
    return s;
  };
  get cur(): FakeSocket { return this.sockets[this.sockets.length - 1]!; }
}

class FakePeer implements MediaPeer {
  onAudio: ((pcm: Int16Array, at: number) => void) | null = null;
  onState: ((s: PeerState) => void) | null = null;
  sent: Int16Array[] = [];
  closed = false;
  constructor(private readonly clock: { t: number }, private readonly fail = false) {}
  async answer(offer: string) { if (this.fail || !offer.startsWith('v=0')) throw new Error('ice'); return SDP_ANSWER; }
  sendFrame(f: Int16Array) { this.sent.push(f); }
  close() { this.closed = true; }
  /** The caller talks (a 220 Hz voice-like tone) or is silent, in 20 ms frames. */
  speak(ms: number, voiced = true) {
    for (let i = 0; i < ms / 20; i += 1) {
      const f = new Int16Array(FRAME_48K);
      if (voiced) for (let k = 0; k < f.length; k += 1) f[k] = Math.round(9000 * Math.sin((2 * Math.PI * 220 * k) / 48000));
      this.onAudio?.(f, this.clock.t);
      this.clock.t += 20;
    }
  }
}

const answerAudio = (ms: number) => {
  const n = (24000 * ms) / 1000;
  const x = new Int16Array(n);
  for (let i = 0; i < n; i += 1) x[i] = Math.round(7000 * Math.sin((2 * Math.PI * 300 * i) / 24000));
  return { serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm16ToBase64(x) } }] } } };
};

async function liveCall(w: ReturnType<typeof world>, o: { connect?: boolean; peerFails?: boolean } = {}) {
  await handleCallEvents(w.deps.call, parseCallEvents(connectPayload({ callId: CALL, atSec: T0 / 1000 })));
  const ticket = w.offers[0]!;
  const peer = new FakePeer(w.clock, o.peerFails);
  const live = new FakeLive();
  const logs: Array<[string, Record<string, unknown> | undefined]> = [];
  const bridge = new CallBridge({ app: createAppClient({ origin: 'https://myavatar.example', ticket, fetch: w.fetch }), peer, openLive: live.open, now: () => w.clock.t, log: (e, d) => logs.push([e, d]) });
  await bridge.start(SDP_OFFER);
  await settle();
  if (o.connect !== false && bridge.phase === 'live') { peer.onState!('connected'); await settle(); }
  return { ticket, peer, live, bridge, logs };
}

const voicedFrames = (frames: Int16Array[]) => frames.filter((f) => rms(f) > 0).length;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('one call through the real app and a simulated Gemini', () => {
  it('answer → Live → caller speaks → words on record → tool → answer audio → hang-up, with measurements', async () => {
    const w = world();
    const { peer, live, bridge, logs, ticket } = await liveCall(w);
    expect(w.metaCalls).toEqual(['pre_accept', 'accept']);
    expect(bridge.phase).toBe('live');
    expect(w.mints).toEqual([null]);
    expect(live.cur.url).toMatch(/BidiGenerateContentConstrained\?access_token=tok-1$/);
    expect(live.cur.sent[0]).toEqual({ setup: { model: 'models/test-live' } });
    expect(await readCall(w.kv, CALL)).toMatchObject({ state: 'active' });

    // 600 ms of speech, 400 ms of silence → 16 kHz chunks of 40 ms to Gemini.
    peer.speak(600);
    peer.speak(400, false);
    const audio = live.cur.audioIn();
    expect(audio.length).toBeGreaterThanOrEqual(24);
    expect(audio[0]!.realtimeInput!.audio!.mimeType).toBe('audio/pcm;rate=16000');
    expect(pcm16FromBase64(audio[0]!.realtimeInput!.audio!.data)).toHaveLength(640);

    // Gemini transcribes the question (two fragments) and calls a tool in the next frame.
    live.cur.emit({ serverContent: { inputTranscription: { text: 'რა ბალანსი ' } } });
    live.cur.emit({ serverContent: { inputTranscription: { text: 'მაქვს?' } } });
    live.cur.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'account_summary', args: {} }] } });
    await settle();
    expect(w.ops.slice(-2)).toEqual(['heard', 'tool']);
    expect(await readHeard(w.kv, CALL)).toEqual([{ text: 'რა ბალანსი მაქვს?', at: expect.any(Number) }]);
    expect(live.cur.sent[live.cur.sent.length - 1]).toEqual({ toolResponse: { functionResponses: [{ id: 'c1', name: 'account_summary', response: { balance_credits: 42, running_tasks: 0, recent_tasks: 0 } }] } });

    // Agent G answers: 300 ms of 24 kHz speech, then the turn ends with its usage.
    live.cur.emit(answerAudio(300));
    live.cur.emit({ serverContent: { turnComplete: true }, usageMetadata: { promptTokenCount: 5200, responseTokenCount: 180, totalTokenCount: 5380 } });
    const before = peer.sent.length;
    for (let i = 0; i < 25; i += 1) { w.clock.t += 20; bridge.tick(); }
    const out = peer.sent.slice(before);
    expect(out).toHaveLength(25);
    expect(out.every((f) => f.length === FRAME_48K)).toBe(true);
    expect(voicedFrames(out)).toBe(15); // 300 ms = 15 frames, then silence keeps the stream steady
    expect(voicedFrames(out.slice(15))).toBe(0);

    // The caller hangs up.
    peer.onState!('closed');
    await settle();
    expect(bridge.phase).toBe('ended');
    expect(w.metaCalls[w.metaCalls.length - 1]).toBe('terminate');
    const rec = await readCall(w.kv, CALL);
    expect(rec).toMatchObject({ state: 'ended', metrics: { promptTokens: 5200, responseTokens: 180, totalTokens: 5380, bargeIns: 0, reconnects: 0 } });
    // Reply latency: end of speech (≈ the 600 ms mark) → first answer frame, all on the simulated clock.
    expect(rec!.metrics!.replyLatencyP50Ms).toBeGreaterThan(400);
    expect(rec!.metrics!.replyLatencyP50Ms).toBeLessThan(600);
    expect(peer.closed).toBe(true);
    expect(live.cur.closed).toBe(true);
    // Nothing secret in the bridge's logs.
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain(ticket);
    expect(logged).not.toMatch(/tok-1|v=0|ბალანსი/);
  });

  it('barge-in: the caller talks over Agent G and the rest of the answer is dropped at once', async () => {
    const w = world();
    const { peer, live, bridge } = await liveCall(w);
    live.cur.emit(answerAudio(2000));
    for (let i = 0; i < 10; i += 1) { w.clock.t += 20; bridge.tick(); }
    expect(voicedFrames(peer.sent)).toBe(10);
    live.cur.emit({ serverContent: { interrupted: true } });
    const before = peer.sent.length;
    for (let i = 0; i < 5; i += 1) { w.clock.t += 20; bridge.tick(); }
    expect(voicedFrames(peer.sent.slice(before))).toBe(0);
    expect(bridge.meter.bargeIns).toBe(1);
  });

  it('a spoken "კი" is on record before stop_task reads it; without it nothing is stopped', async () => {
    const task = { id: 'task-1', service: 'video', label: 'ვიდეო', status: 'running' } as TaskView;
    const w = world({ tasks: [task] });
    const { live } = await liveCall(w);
    live.cur.emit({ toolCall: { functionCalls: [{ id: 's0', name: 'stop_task', args: { task: 1 } }] } });
    await settle();
    expect(live.cur.sent[live.cur.sent.length - 1]!.toolResponse!.functionResponses[0]!.response).toEqual({ stopped: false, reason: 'not_heard_yes' });
    expect(w.cancelled).toEqual([]);

    live.cur.emit({ serverContent: { inputTranscription: { text: 'კი' } } });
    live.cur.emit({ toolCall: { functionCalls: [{ id: 's1', name: 'stop_task', args: { task: 1 } }] } });
    await settle();
    expect(live.cur.sent[live.cur.sent.length - 1]!.toolResponse!.functionResponses[0]!.response).toEqual({ stopped: true });
    expect(w.cancelled).toEqual(['task-1']);
  });

  it('goAway: resumes with the latest handle on a new token; the caller\'s audio during the gap is held, not lost', async () => {
    const gate = deferred<void>();
    const w = world({ session: async (n) => { if (n === 2) await gate.promise; } });
    const { peer, live, bridge } = await liveCall(w);
    live.cur.emit({ sessionResumptionUpdate: { newHandle: 'handle-1', resumable: true } });
    live.cur.emit({ goAway: { timeLeft: '5s' } });
    await settle();
    expect(w.mints).toEqual([null, 'handle-1']);
    expect(live.sockets[0]!.closed).toBe(true);
    peer.speak(400); // while the new token is being minted
    gate.resolve();
    await settle();
    expect(live.sockets).toHaveLength(2);
    expect(live.cur.url).toMatch(/access_token=tok-2$/);
    expect(live.cur.audioIn().length).toBeGreaterThanOrEqual(9);
    expect(bridge.meter.reconnects).toBe(1);
    expect(bridge.phase).toBe('live');
  });

  it('goAway during a tool call waits for the tool: its answer reaches the session that asked, then it resumes', async () => {
    const slow = deferred<number | null>();
    const w = world({ balance: () => slow.promise });
    const { live } = await liveCall(w);
    const first = live.cur;
    first.emit({ sessionResumptionUpdate: { newHandle: 'h-tool', resumable: true } });
    first.emit({ toolCall: { functionCalls: [{ id: 't1', name: 'account_summary', args: {} }] } });
    first.emit({ goAway: { timeLeft: '9s' } });
    await settle();
    expect(w.mints).toEqual([null]);
    slow.resolve(7);
    await settle();
    expect(first.sent.some((m) => m.toolResponse?.functionResponses?.[0]?.id === 't1')).toBe(true);
    expect(w.mints).toEqual([null, 'h-tool']);
    expect(live.sockets).toHaveLength(2);
  });

  it('a dropped Live socket resumes; past the per-call session cap the call ends as live_failed (not charged)', async () => {
    const w = world();
    const { live, bridge } = await liveCall(w);
    live.cur.emit({ sessionResumptionUpdate: { newHandle: 'h-drop', resumable: true } });
    for (let i = 1; i < MAX_LIVE_MINTS; i += 1) { live.cur.drop(); await settle(); }
    expect(w.mints).toHaveLength(MAX_LIVE_MINTS);
    expect(bridge.phase).toBe('live');
    live.cur.drop();
    await settle();
    expect(bridge.phase).toBe('ended');
    expect(bridge.endReason).toBe('live_failed');
    expect(await readCall(w.kv, CALL)).toMatchObject({ state: 'failed' });
  });

  it('a cancelled tool call is never answered', async () => {
    const slow = deferred<number | null>();
    const w = world({ balance: () => slow.promise });
    const { live } = await liveCall(w);
    live.cur.emit({ toolCall: { functionCalls: [{ id: 'x1', name: 'account_summary', args: {} }] } });
    await settle();
    live.cur.emit({ toolCallCancellation: { ids: ['x1'] } });
    slow.resolve(1);
    await settle();
    expect(live.cur.sent.some((m) => m.toolResponse)).toBe(false);
  });
});

describe('limits and failures', () => {
  it('30 s before the cap a wrap-up note goes to Gemini; at the cap the call ends (max_duration) and Meta hangs up', async () => {
    const w = world();
    const { live, bridge } = await liveCall(w);
    const answeredAt = w.clock.t;
    w.clock.t = answeredAt + (900 - 30) * 1000;
    bridge.tick();
    expect(live.cur.sent.some((m) => m.realtimeInput?.text === WRAP_UP_NOTE)).toBe(true);
    w.clock.t = answeredAt + 900 * 1000;
    bridge.tick();
    await settle();
    expect(bridge.endReason).toBe('max_duration');
    expect(w.metaCalls[w.metaCalls.length - 1]).toBe('terminate');
    expect(await readCall(w.kv, CALL)).toMatchObject({ state: 'ended' });
  });

  it('media that never connects ends the call as media_failed after 20 s', async () => {
    const w = world();
    const { bridge, peer } = await liveCall(w, { connect: false });
    w.clock.t += 21_000;
    bridge.tick();
    await settle();
    expect(bridge.endReason).toBe('media_failed');
    expect(peer.sent).toHaveLength(0);
    expect(await readCall(w.kv, CALL)).toMatchObject({ state: 'failed' });
  });

  it('a short media gap is ridden out; 5 s of lost media ends the call', async () => {
    const w = world();
    const { bridge, peer } = await liveCall(w);
    peer.onState!('disconnected');
    w.clock.t += 2000; bridge.tick();
    peer.onState!('connected');
    w.clock.t += 6000; bridge.tick();
    expect(bridge.phase).toBe('live');
    peer.onState!('disconnected');
    w.clock.t += 5100; bridge.tick();
    await settle();
    expect(bridge.endReason).toBe('hangup');
  });

  it('our SDP answer failing ends the call before Meta is asked to accept', async () => {
    const w = world();
    const { bridge } = await liveCall(w, { peerFails: true });
    expect(bridge.endReason).toBe('media_failed');
    expect(w.metaCalls).not.toContain('accept');
    expect(await readCall(w.kv, CALL)).toMatchObject({ state: 'failed' });
  });

  it('the caller hung up at Meta: the next bridge request is refused (call over) and the bridge stops quietly', async () => {
    const w = world();
    const { live, bridge, peer } = await liveCall(w);
    await handleCallEvents(w.deps.call, parseCallEvents(terminatePayload({ callId: CALL, atSec: (w.clock.t + 30_000) / 1000, duration: 30 })));
    live.cur.emit({ toolCall: { functionCalls: [{ id: 'z', name: 'account_summary', args: {} }] } });
    await settle();
    expect(bridge.phase).toBe('ended');
    expect(peer.closed).toBe(true);
    expect(w.ops[w.ops.length - 1]).toBe('tool');
    expect(live.cur.sent.some((m) => m.toolResponse)).toBe(false);
  });
});
