/**
 * @jest-environment node
 *
 * The bridge's five requests against a MOCKED Meta, a fake Live mint and an in-memory store (no network).
 */
import { handleBridgeRequest, type BridgeApiDeps } from './bridgeApi';
import { handleCallEvents, MAX_LIVE_MINTS, type CallServiceDeps } from './callService';
import { memoryKv, readCall, readHeard } from './callStore';
import { parseCallEvents } from './events';
import type { PhoneToolDeps } from './phoneTools';
import { SDP_ANSWER, connectPayload } from './testFixtures';

const SECRET = 'bridge-api-secret-for-tests-'.padEnd(48, 'z');
const T0 = 1_760_000_000_000;

function setup() {
  const kv = memoryKv();
  const clock = { t: T0 + 1000 };
  const offers: string[] = [];
  const metaCalls: string[] = [];
  const mints: Array<string | null> = [];
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
    now: () => clock.t, scope: 'service', mediaOpen: async () => false, balance: async () => 42, listTasks: async () => [],
    cancelTask: async () => 'not_found', heard: (id: string) => readHeard(kv, id), plans: { list: async () => [], add: async () => { throw new Error('x'); } },
    planMp3: async () => ({ ok: false, error: 'x' }), startFree: async () => ({ ok: false, error: 'x' }), sendConfirm: async () => false,
    deliver: async () => ({ sent: false, mode: 'none' }), scheduleCallback: async () => 'unavailable',
  } as PhoneToolDeps;
  const deps: BridgeApiDeps = {
    call, tools,
    session: async (_t, handle) => { mints.push(handle); return { ok: true, token: `tok-${mints.length}`, setupMessage: { setup: { model: 'm' } } as never, expiresAt: 'x' }; },
  };
  return { deps, kv, clock, offers, metaCalls, mints };
}

async function offered(w: ReturnType<typeof setup>) {
  await handleCallEvents(w.deps.call, parseCallEvents(connectPayload({ callId: 'wacid.API', atSec: T0 / 1000 })));
  return w.offers[0]!;
}

describe('bridge API', () => {
  it('refuses unknown ops and missing or foreign tickets', async () => {
    const w = setup();
    expect(await handleBridgeRequest(w.deps, 'charge', 'x', {})).toEqual({ status: 404, body: { error: 'unknown_op' } });
    expect(await handleBridgeRequest(w.deps, 'answer', null, {})).toEqual({ status: 401, body: { error: 'missing' } });
    expect(await handleBridgeRequest(w.deps, 'answer', 'abc.def', {})).toMatchObject({ status: 401 });
  });

  it('answer → session → heard → tool → event(end): one call, start to finish', async () => {
    const w = setup();
    const t = await offered(w);
    // No Live session before the call is answered (media may not flow yet).
    expect(await handleBridgeRequest(w.deps, 'session', t, {})).toEqual({ status: 409, body: { error: 'not_answered' } });
    expect(await handleBridgeRequest(w.deps, 'answer', t, { sdp: SDP_ANSWER })).toEqual({ status: 200, body: { ok: true, maxSeconds: 900 } });
    expect(w.metaCalls).toEqual(['pre_accept', 'accept']);

    expect(await handleBridgeRequest(w.deps, 'session', t, {})).toMatchObject({ status: 200, body: { token: 'tok-1' } });
    expect(await handleBridgeRequest(w.deps, 'session', t, { resumptionHandle: 'h1' })).toMatchObject({ status: 200, body: { token: 'tok-2' } });
    expect(w.mints).toEqual([null, 'h1']);

    expect(await handleBridgeRequest(w.deps, 'event', t, { type: 'active' })).toEqual({ status: 200, body: { ok: true } });
    expect(await handleBridgeRequest(w.deps, 'heard', t, { text: 'რა ბალანსი მაქვს?', at: w.clock.t })).toEqual({ status: 200, body: { ok: true } });
    expect(await readHeard(w.kv, 'wacid.API')).toEqual([{ text: 'რა ბალანსი მაქვს?', at: w.clock.t }]);
    expect(await handleBridgeRequest(w.deps, 'tool', t, { name: 'account_summary', args: {} })).toEqual({ status: 200, body: { response: { balance_credits: 42, running_tasks: 0, recent_tasks: 0 } } });
    expect(await handleBridgeRequest(w.deps, 'tool', t, { name: 'click_element', args: {} })).toEqual({ status: 200, body: { response: { error: 'unknown_tool' } } });

    expect(await handleBridgeRequest(w.deps, 'event', t, { type: 'end', reason: 'hangup', metrics: { replyLatencyP50Ms: 900 } })).toEqual({ status: 200, body: { ok: true } });
    expect(w.metaCalls.at(-1)).toBe('terminate');
    expect(await readCall(w.kv, 'wacid.API')).toMatchObject({ state: 'ended', metrics: { replyLatencyP50Ms: 900 } });
    // The ticket died with the call.
    expect(await handleBridgeRequest(w.deps, 'tool', t, { name: 'account_summary' })).toEqual({ status: 409, body: { error: 'call_over' } });
  });

  it('heard refuses an utterance dated before the call or in the future (a forged early yes)', async () => {
    const w = setup();
    const t = await offered(w);
    expect(await handleBridgeRequest(w.deps, 'heard', t, { text: 'yes', at: T0 - 60_000 })).toEqual({ status: 400, body: { error: 'bad_utterance' } });
    expect(await handleBridgeRequest(w.deps, 'heard', t, { text: 'yes', at: w.clock.t + 60_000 })).toEqual({ status: 400, body: { error: 'bad_utterance' } });
    expect(await handleBridgeRequest(w.deps, 'heard', t, { text: '   ', at: w.clock.t })).toEqual({ status: 400, body: { error: 'bad_utterance' } });
  });

  it('tools only run while the call is live; Live sessions per call are capped', async () => {
    const w = setup();
    const t = await offered(w);
    expect(await handleBridgeRequest(w.deps, 'tool', t, { name: 'account_summary' })).toEqual({ status: 409, body: { error: 'not_live' } });
    await handleBridgeRequest(w.deps, 'answer', t, { sdp: SDP_ANSWER });
    for (let i = 0; i < MAX_LIVE_MINTS; i += 1) expect((await handleBridgeRequest(w.deps, 'session', t, {})).status).toBe(200);
    expect(await handleBridgeRequest(w.deps, 'session', t, {})).toEqual({ status: 429, body: { error: 'too_many_sessions' } });
  });

  it('events are strict', async () => {
    const w = setup();
    const t = await offered(w);
    expect(await handleBridgeRequest(w.deps, 'event', t, { type: 'charge', credits: 1 })).toEqual({ status: 400, body: { error: 'bad_event' } });
  });
});
