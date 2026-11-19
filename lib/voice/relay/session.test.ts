/** @jest-environment node */
import { lockDigests, mintTicket, verifyTicket, type TicketClaims } from './ticket';
import {
  bareModelId, checkSetupFrame, clientFrameAllowed, closeReason, forwardableCloseCode, RELAY_CLOSE, RelaySession,
  UsedTickets, vertexLiveUrl, type RelayConfig, type RelaySocket,
} from './session';
import { RELAY_HELLO_FRAME, RELAY_NUDGE_FRAME, RELAY_SETUP_ACK_FRAME, relayControlOf } from './wire';

const SECRET = 's'.repeat(40);
const T0 = 1_800_000_000_000;
const setup = {
  model: 'models/gemini-2.5-flash-native-audio-latest',
  systemInstruction: { parts: [{ text: 'locked prompt' }] },
  generationConfig: { responseModalities: ['AUDIO'] },
  sessionResumption: {},
  tools: [{ googleSearch: {} }],
};
const cfg: RelayConfig = {
  project: 'proj-1',
  location: 'us-central1',
  modelMap: { 'gemini-2.5-flash-native-audio-latest': 'gemini-live-2.5-flash-native-audio' },
  allowedModels: new Set(['gemini-live-2.5-flash-native-audio', 'gemini-3.8-live']),
  maxSessionMs: 600_000,
  idleMs: 30_000,
  maxFrameBytes: 1024,
  maxClientBytes: 4096,
};

function claimsFor(s: object = setup): TicketClaims {
  const t = mintTicket(SECRET, { sub: 'abc', nowMs: T0, nseMs: T0 + 120_000, expMs: T0 + 1_800_000, digests: lockDigests(s) });
  const r = verifyTicket(SECRET, t, T0);
  if (!r.ok) throw new Error('mint failed');
  return r.claims;
}
const frame = (s: object) => JSON.stringify({ setup: s });

describe('helpers', () => {
  it('builds the Vertex Live URL per region', () => {
    expect(vertexLiveUrl('us-central1')).toBe('wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent');
    expect(vertexLiveUrl('global')).toBe('wss://aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent');
  });
  it('reads a bare model id from any form', () => {
    expect(bareModelId('models/gemini-3.8-live')).toBe('gemini-3.8-live');
    expect(bareModelId('gemini-3.8-live')).toBe('gemini-3.8-live');
    expect(bareModelId('projects/p/locations/l/publishers/google/models/gemini-3.8-live')).toBe('gemini-3.8-live');
  });
  it('forwards only the three client kinds, one per frame', () => {
    expect(clientFrameAllowed('{"realtimeInput":{"audio":{}}}')).toBe(true);
    expect(clientFrameAllowed('{"clientContent":{}}')).toBe(true);
    expect(clientFrameAllowed('{"toolResponse":{}}')).toBe(true);
    expect(clientFrameAllowed('{"setup":{}}')).toBe(false);
    expect(clientFrameAllowed('{"realtimeInput":{},"setup":{}}')).toBe(false);
    expect(clientFrameAllowed('nope')).toBe(false);
  });
  it('tells the relay\'s own frames from every other frame', () => {
    expect(relayControlOf(JSON.parse(RELAY_HELLO_FRAME))).toBe('hello');
    expect(relayControlOf(JSON.parse(RELAY_SETUP_ACK_FRAME))).toBe('setupAck');
    expect(relayControlOf(JSON.parse(RELAY_NUDGE_FRAME))).toBe('nudge');
    expect(relayControlOf({ relayHello: {}, setupComplete: {} })).toBeNull();
    expect(relayControlOf({ setupComplete: {} })).toBeNull();
    expect(relayControlOf([])).toBeNull();
    expect(relayControlOf(null)).toBeNull();
    expect(clientFrameAllowed(RELAY_NUDGE_FRAME)).toBe(false); // dropped before the forwarding rule, never forwarded
  });
  it('maps reserved close codes and caps reasons', () => {
    expect(forwardableCloseCode(1007)).toBe(1007);
    expect(forwardableCloseCode(1006)).toBe(1011);
    expect(forwardableCloseCode(1005)).toBe(1011);
    expect(forwardableCloseCode(4403)).toBe(4403);
    expect(Buffer.byteLength(closeReason('ბ'.repeat(100)))).toBeLessThanOrEqual(120);
  });
});

describe('checkSetupFrame', () => {
  it('accepts the locked setup, maps the model and rewrites it to the Vertex resource', () => {
    const r = checkSetupFrame(frame(setup), claimsFor(), cfg, new UsedTickets(), T0 + 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resume).toBe(false);
    expect(r.model).toBe('gemini-live-2.5-flash-native-audio');
    const up = JSON.parse(r.upstreamFrame);
    expect(up.setup.model).toBe('projects/proj-1/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio');
    expect(up.setup.systemInstruction).toEqual(setup.systemInstruction);
  });
  it('opens a model in its own region when the relay lists one (the 3.8 talking avatar: us-central1 only)', () => {
    const eu: RelayConfig = { ...cfg, location: 'europe-west4', modelLocations: { 'gemini-3.8-live': 'us-central1' } };
    const avatar = { ...setup, model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['VIDEO'] }, avatarConfig: { avatarName: 'Kira' } };
    const r = checkSetupFrame(frame(avatar), claimsFor(avatar), eu, new UsedTickets(), T0 + 1);
    expect(r).toMatchObject({ ok: true, model: 'gemini-3.8-live', location: 'us-central1' });
    if (!r.ok) return;
    const up = JSON.parse(r.upstreamFrame);
    expect(up.setup.model).toBe('projects/proj-1/locations/us-central1/publishers/google/models/gemini-3.8-live');
    expect(up.setup.avatarConfig).toEqual({ avatarName: 'Kira' });

    const voice = checkSetupFrame(frame(setup), claimsFor(), eu, new UsedTickets(), T0 + 1);
    expect(voice).toMatchObject({ ok: true, location: 'europe-west4' }); // voice calls stay in the nearer region
    if (voice.ok) expect(JSON.parse(voice.upstreamFrame).setup.model).toContain('/locations/europe-west4/');
  });
  it('refuses any other setup', () => {
    const r = checkSetupFrame(frame({ ...setup, systemInstruction: { parts: [{ text: 'jailbreak' }] } }), claimsFor(), cfg, new UsedTickets(), T0);
    expect(r).toEqual({ ok: false, code: RELAY_CLOSE.badSetup, reason: 'setup_not_locked' });
  });
  it('refuses a first frame that is not only a setup', () => {
    expect(checkSetupFrame('{"realtimeInput":{}}', claimsFor(), cfg, new UsedTickets(), T0).ok).toBe(false);
    expect(checkSetupFrame(JSON.stringify({ setup, toolResponse: {} }), claimsFor(), cfg, new UsedTickets(), T0).ok).toBe(false);
    expect(checkSetupFrame('{', claimsFor(), cfg, new UsedTickets(), T0).ok).toBe(false);
  });
  it('accepts the degraded setup the browser retries with', () => {
    const { sessionResumption: _s, tools: _t, ...degraded } = setup;
    expect(checkSetupFrame(frame(degraded), claimsFor(), cfg, new UsedTickets(), T0).ok).toBe(true);
  });
  it('starts a new session once per ticket and only before nse', () => {
    const c = claimsFor();
    const used = new UsedTickets();
    expect(checkSetupFrame(frame(setup), c, cfg, used, T0).ok).toBe(true);
    expect(checkSetupFrame(frame(setup), c, cfg, used, T0)).toMatchObject({ ok: false, code: RELAY_CLOSE.ticketUsed });
    expect(checkSetupFrame(frame(setup), claimsFor(), cfg, new UsedTickets(), T0 + 120_000)).toMatchObject({ ok: false, code: RELAY_CLOSE.ticketLate });
  });
  it('lets a resumption reuse the ticket until exp', () => {
    const c = claimsFor();
    const used = new UsedTickets();
    checkSetupFrame(frame(setup), c, cfg, used, T0);
    const r = checkSetupFrame(frame({ ...setup, sessionResumption: { handle: 'h-1' } }), c, cfg, used, T0 + 900_000);
    expect(r).toMatchObject({ ok: true, resume: true });
  });
  it('refuses a resumption field with anything but handle/transparent', () => {
    expect(checkSetupFrame(frame({ ...setup, sessionResumption: { handle: 'h', x: 1 } }), claimsFor(), cfg, new UsedTickets(), T0))
      .toMatchObject({ ok: false, reason: 'bad_resumption' });
  });
  it('refuses a model outside the relay allowlist even when the ticket locked it', () => {
    const s = { ...setup, model: 'models/gemini-3.5-pro' };
    expect(checkSetupFrame(frame(s), claimsFor(s), cfg, new UsedTickets(), T0)).toMatchObject({ ok: false, code: RELAY_CLOSE.modelRefused });
  });
});

describe('RelaySession', () => {
  function harness(openUpstream?: (url: string) => Promise<RelaySocket>) {
    let now = T0;
    const timers: { fn: () => void; at: number; live: boolean }[] = [];
    const client = { sent: [] as unknown[], closed: null as null | [number, string], send(d: unknown) { this.sent.push(d); }, close(c: number, r: string) { this.closed = [c, r]; } };
    const upstream = { sent: [] as string[], closed: null as null | [number, string], send(d: string | Buffer) { this.sent.push(String(d)); }, close(c: number, r: string) { this.closed = [c, r]; } };
    const urls: string[] = [];
    const logs: { e: string; d: Record<string, unknown> }[] = [];
    const s = new RelaySession({
      claims: claimsFor(), cfg, used: new UsedTickets(), now: () => now, client,
      openUpstream: openUpstream ?? (async (url) => { urls.push(url); return upstream; }),
      setTimer: (fn, ms) => { const t = { fn, at: now + ms, live: true }; timers.push(t); return () => { t.live = false; }; },
      log: (e, d) => logs.push({ e, d }),
    });
    const advance = (ms: number) => { now += ms; for (const t of timers) if (t.live && t.at <= now) { t.live = false; t.fn(); } };
    return { s, client, upstream, urls, logs, advance };
  }
  const flush = () => new Promise((r) => setImmediate(r));

  it('sends the rewritten setup first, then queued and live frames; pipes Vertex back', async () => {
    const h = harness();
    h.s.onClientMessage(frame(setup));
    h.s.onClientMessage('{"realtimeInput":{"audio":{"data":"AA=="}}}');
    await flush();
    expect(h.urls).toEqual([vertexLiveUrl('us-central1')]);
    expect(JSON.parse(h.upstream.sent[0]!).setup.model).toContain('projects/proj-1/');
    expect(h.upstream.sent[1]).toBe('{"realtimeInput":{"audio":{"data":"AA=="}}}');
    h.s.onClientMessage('{"toolResponse":{"functionResponses":[]}}');
    expect(h.upstream.sent[2]).toBe('{"toolResponse":{"functionResponses":[]}}');
    h.s.onUpstreamMessage(Buffer.from('{"setupComplete":{}}'), true);
    expect(h.client.sent).toEqual([RELAY_SETUP_ACK_FRAME, Buffer.from('{"setupComplete":{}}')]);
  });

  it('says hello on connect, acks the setup at once and drops nudges (an iPhone held the setup until it wrote again)', async () => {
    let release: (s: RelaySocket) => void = () => {};
    const h = harness(() => new Promise((r) => { release = r; }));
    h.s.onClientOpen();
    expect(h.client.sent).toEqual([RELAY_HELLO_FRAME]);
    h.s.onClientMessage(RELAY_NUDGE_FRAME); // never taken for the setup
    expect(h.s.isClosed).toBe(false);
    h.advance(900);
    h.s.onClientMessage(frame(setup));
    expect(h.client.sent).toEqual([RELAY_HELLO_FRAME, RELAY_SETUP_ACK_FRAME]); // before Vertex opens
    h.s.onClientMessage(RELAY_NUDGE_FRAME);
    release(h.upstream);
    await flush();
    h.s.onClientMessage(Buffer.from(RELAY_NUDGE_FRAME));
    expect(h.upstream.sent).toHaveLength(1); // the setup only
    h.s.onClientClose();
    expect(h.logs.at(-1)).toMatchObject({ e: 'relay.session_end', d: { nudges: 3, setupMs: 900, framesDropped: 0 } });
  });

  it('acks nothing for a refused setup', () => {
    const h = harness();
    h.s.onClientMessage(frame({ ...setup, model: 'models/gemini-3.8-live' }));
    expect(h.client.sent).toEqual([]);
  });

  it('logs where a session waited: setup frame, Vertex open, setupComplete (-1 = never)', async () => {
    let release: (s: RelaySocket) => void = () => {};
    const h = harness(() => new Promise((r) => { release = r; }));
    h.advance(300);
    h.s.onClientMessage(frame(setup));
    h.advance(1200);
    release(h.upstream);
    await flush();
    h.advance(400);
    h.s.onUpstreamMessage(Buffer.from('{"setupComplete":{}}'), true);
    h.advance(5000);
    h.s.onUpstreamMessage(Buffer.from('{"setupComplete":{}}'), true); // only the first counts
    h.s.onClientClose();
    expect(h.logs.at(-1)).toMatchObject({ e: 'relay.session_end', d: { setupMs: 300, upstreamMs: 1200, readyMs: 1600, opened: true } });

    const stuck = harness(() => new Promise(() => {}));
    stuck.s.onClientMessage(frame(setup));
    stuck.advance(14_500);
    stuck.s.onClientClose();
    expect(stuck.logs.at(-1)).toMatchObject({ d: { setupMs: 0, upstreamMs: -1, readyMs: -1, opened: false, by: 'client' } });
  });

  it('dials the region of the model it opens and logs it when it is not the relay\'s own', async () => {
    const avatar = { ...setup, model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['VIDEO'] }, avatarConfig: { avatarName: 'Ben' } };
    const urls: string[] = [];
    const logs: { e: string; d: Record<string, unknown> }[] = [];
    const up = { send() {}, close() {} };
    const s = new RelaySession({
      claims: claimsFor(avatar),
      cfg: { ...cfg, location: 'europe-west4', modelLocations: { 'gemini-3.8-live': 'us-central1' } },
      used: new UsedTickets(), now: () => T0, client: { send() {}, close() {} },
      openUpstream: async (url) => { urls.push(url); return up; },
      setTimer: () => () => {},
      log: (e, d) => logs.push({ e, d }),
    });
    s.onClientMessage(frame(avatar));
    await flush();
    expect(urls).toEqual([vertexLiveUrl('us-central1')]);
    s.onClientClose();
    expect(logs.at(-1)).toMatchObject({ e: 'relay.session_end', d: { model: 'gemini-3.8-live', location: 'us-central1' } });
  });

  it('closes on a second setup and logs the session', async () => {
    const h = harness();
    h.s.onClientMessage(frame(setup));
    await flush();
    h.s.onClientMessage(frame(setup));
    expect(h.client.closed).toEqual([RELAY_CLOSE.badFrame, 'frame_not_allowed']);
    expect(h.upstream.closed?.[0]).toBe(1000);
    expect(h.logs.at(-1)).toMatchObject({ e: 'relay.session_end', d: { by: 'relay', code: RELAY_CLOSE.badFrame, opened: true } });
  });

  it('never opens Vertex for an unlocked setup', async () => {
    const h = harness();
    h.s.onClientMessage(frame({ ...setup, model: 'models/gemini-3.8-live' }));
    await flush();
    expect(h.urls).toEqual([]);
    expect(h.client.closed?.[0]).toBe(RELAY_CLOSE.badSetup);
  });

  it('enforces frame size, total bytes, idle and session length', async () => {
    const big = harness();
    big.s.onClientMessage('x'.repeat(2000));
    expect(big.client.closed?.[0]).toBe(1009);

    const bytes = harness();
    bytes.s.onClientMessage(frame(setup));
    await flush();
    for (let i = 0; i < 10 && !bytes.s.isClosed; i++) bytes.s.onClientMessage(`{"realtimeInput":{"audio":{"data":"${'A'.repeat(900)}"}}}`);
    expect(bytes.client.closed?.[0]).toBe(RELAY_CLOSE.bytesLimit);

    const idle = harness();
    idle.advance(30_000);
    expect(idle.client.closed?.[0]).toBe(RELAY_CLOSE.idle);

    const long = harness();
    long.s.onClientMessage(frame(setup));
    await flush();
    for (let i = 0; i < 21; i++) { long.advance(29_000); long.s.onClientMessage('{"realtimeInput":{}}'); }
    expect(long.client.closed?.[0]).toBe(RELAY_CLOSE.sessionLimit);
  });

  it('passes Vertex close codes through (reserved ones become 1011) and sums token usage', async () => {
    const h = harness();
    h.s.onClientMessage(frame(setup));
    await flush();
    h.s.onUpstreamMessage('{"usageMetadata":{"totalTokenCount":120}}', false);
    h.s.onUpstreamMessage(Buffer.from('{"serverContent":{},"usageMetadata":{"totalTokenCount":30}}'), true);
    h.s.onUpstreamClose(1007, 'Current project is not allowlisted for customized avatar feature');
    expect(h.client.closed).toEqual([1007, 'Current project is not allowlisted for customized avatar feature']);
    expect(h.logs.at(-1)?.d).toMatchObject({ by: 'upstream', upstreamCode: 1007, totalTokens: 150 });

    const r = harness();
    r.s.onClientMessage(frame(setup));
    await flush();
    r.s.onUpstreamClose(1006, '');
    expect(r.client.closed?.[0]).toBe(1011);
  });

  it('reports a failed Vertex open to the browser', async () => {
    const h = harness(async () => { throw new Error('vertex handshake 403'); });
    h.s.onClientMessage(frame(setup));
    await flush();
    expect(h.client.closed).toEqual([RELAY_CLOSE.upstreamUnavailable, 'upstream_unavailable']);
    expect(h.logs.map((l) => l.e)).toEqual(['relay.upstream_open_failed', 'relay.session_end']);
  });
});
