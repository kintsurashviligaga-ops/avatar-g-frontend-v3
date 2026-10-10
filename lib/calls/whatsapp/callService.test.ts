/**
 * @jest-environment node
 *
 * The whole call flow against a MOCKED Meta (recorded requests, scripted answers), a FAKE media bridge and an in-memory
 * store. No request leaves the machine; nothing here proves a real WhatsApp call (BUILT_NOT_PROVEN until one is made).
 */
import { parseCallEvents } from './events';
import { answerCall, authorizeBridge, bridgeEvent, CONNECT_FRESH_MS, handleCallEvents, MAX_LIVE_MINTS, parseBridgeEvent, takeLiveMint, type CallServiceDeps } from './callService';
import { createCall, memoryKv, minutesToday, readCall } from './callStore';
import { newCallRecord } from './lifecycle';
import { issueTicket } from './ticket';
import type { CallPolicy, LinkFact } from './gates';
import type { CallAction, MetaResult } from './metaCalls';
import { SDP_ANSWER, connectPayload, statusPayload, terminatePayload } from './testFixtures';

const SECRET = 'bridge-secret-for-tests-'.padEnd(48, 'q');
const T0 = 1_760_000_000_000;
const AT = T0 / 1000;
const ON: CallPolicy = { enabled: true, creditsPerMinute: 10, minFundedMinutes: 2, outboundPerDay: 2 };

interface World {
  deps: CallServiceDeps;
  clock: { t: number };
  meta: Array<{ callId: string; action: CallAction; sdpAnswer?: string; opaque?: string }>;
  offers: Array<{ ticket: string; callId: string; sdpOffer: string }>;
  told: Array<{ waId: string; text: string }>;
  audits: Array<{ phase: string; outcome: string; detail?: string; userId: string | null }>;
  charges: Array<{ userId: string; callId: string; credits: number }>;
  kv: ReturnType<typeof memoryKv>;
}

function world(o: {
  policy?: CallPolicy;
  links?: Record<string, LinkFact>;
  balance?: number | null;
  callsOn?: boolean;
  bridgeTakes?: boolean;
  metaAnswers?: Partial<Record<CallAction, MetaResult>>;
  charge?: boolean;
  secret?: string;
} = {}): World {
  const kv = memoryKv();
  const clock = { t: T0 + 2000 };
  const w: Omit<World, 'deps'> = { clock, meta: [], offers: [], told: [], audits: [], charges: [], kv };
  const links = o.links ?? { '995555000111': { state: 'linked', userId: 'u1' } };
  const deps: CallServiceDeps = {
    kv,
    now: () => clock.t,
    policy: o.policy ?? ON,
    secret: o.secret ?? SECRET,
    origin: 'https://myavatar.example',
    findLink: async (waId) => links[waId] ?? { state: 'unlinked' },
    readCallPrefs: async () => ({ calls: { enabled: o.callsOn ?? true, perCallMinutes: 15, dailyMinutes: 30 }, timezone: 'Asia/Tbilisi' }),
    balance: async () => (o.balance === undefined ? 500 : o.balance),
    minutesToday: (userId, day) => minutesToday(kv, userId, day),
    bridge: {
      ready: async () => true,
      offer: async (x) => { w.offers.push(x); return o.bridgeTakes ?? true; },
    },
    meta: async (x) => { w.meta.push(x); return o.metaAnswers?.[x.action] ?? { ok: true, status: 200, errorCode: null }; },
    tell: async (waId, text) => { w.told.push({ waId, text }); },
    audit: async (e) => { w.audits.push(e); },
    ...(o.charge === false ? {} : { charge: async (x: { userId: string; callId: string; credits: number }) => { w.charges.push(x); return true; } }),
  };
  return { ...w, deps };
}

const connect = (callId = 'wacid.C1', extra: Parameters<typeof connectPayload>[0] extends infer P ? Partial<P> : never = {}) =>
  parseCallEvents(connectPayload({ callId, atSec: AT, ...extra }));

async function answered(w: World, callId = 'wacid.C1') {
  expect(await handleCallEvents(w.deps, connect(callId))).toEqual([{ callId, outcome: 'offered' }]);
  const auth = await authorizeBridge(w.deps, w.offers.at(-1)!.ticket);
  if (!auth.ok) throw new Error('auth failed');
  expect(await answerCall(w.deps, auth, SDP_ANSWER)).toEqual({ ok: true });
  return auth;
}

describe('WhatsApp calls: refusals', () => {
  it('while calling is off (the default), every call is rejected at once and nobody is messaged', async () => {
    const w = world({ policy: { ...ON, enabled: false } });
    expect(await handleCallEvents(w.deps, connect())).toEqual([{ callId: 'wacid.C1', outcome: 'refused' }]);
    expect(w.meta).toEqual([{ callId: 'wacid.C1', action: 'reject' }]);
    expect(w.told).toEqual([]);
    expect(w.offers).toEqual([]);
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ state: 'failed', failure: 'calling_off' });
  });

  it('an unlinked number is rejected and told how to link (caller ID authorizes nothing)', async () => {
    const w = world({ links: {} });
    await handleCallEvents(w.deps, connect());
    expect(w.meta.map((m) => m.action)).toEqual(['reject']);
    expect(w.told).toEqual([{ waId: '995555000111', text: expect.stringContaining('https://myavatar.example/ka/settings#whatsapp') }]);
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ userId: null, failure: 'not_linked', waMasked: '+995 ••• ••111' });
  });

  it('a username caller with no number cannot match a link', async () => {
    const w = world();
    await handleCallEvents(w.deps, connect('wacid.C2', { from: null, fromUserId: 'GE.bsuid' }));
    expect(await readCall(w.kv, 'wacid.C2')).toMatchObject({ failure: 'not_linked' });
    expect(w.told).toEqual([]); // no number to write to
  });

  it('low balance, calls switched off, missing link tables: each refused with its reason', async () => {
    const low = world({ balance: 5 });
    await handleCallEvents(low.deps, connect());
    expect(low.told[0]!.text).toContain('/ka/pricing');
    expect(await readCall(low.kv, 'wacid.C1')).toMatchObject({ failure: 'insufficient_balance' });

    const off = world({ callsOn: false });
    await handleCallEvents(off.deps, connect());
    expect(await readCall(off.kv, 'wacid.C1')).toMatchObject({ failure: 'calls_opted_out' });

    const noTables = world({ links: { '995555000111': { state: 'unavailable' } } });
    await handleCallEvents(noTables.deps, connect());
    expect(await readCall(noTables.kv, 'wacid.C1')).toMatchObject({ failure: 'links_unavailable' });
  });

  it('no price approved: no call starts (no unexpected charges, no free unlimited calls)', async () => {
    const w = world({ policy: { ...ON, creditsPerMinute: null } });
    await handleCallEvents(w.deps, connect());
    expect(w.offers).toEqual([]);
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ failure: 'price_not_approved' });
  });

  it('no bridge secret configured: nothing is handed to a bridge', async () => {
    const w = world({ secret: '' });
    await handleCallEvents(w.deps, connect());
    expect(w.offers).toEqual([]);
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ failure: 'bridge_unavailable' });
  });

  it('a connect without an SDP offer is rejected', async () => {
    const w = world();
    await handleCallEvents(w.deps, connect('wacid.C3', { sdp: null }));
    expect(w.meta.map((m) => m.action)).toEqual(['reject']);
  });
});

describe('WhatsApp calls: replay and freshness', () => {
  it('the same webhook delivered twice is handled once', async () => {
    const w = world();
    const evs = connect();
    await handleCallEvents(w.deps, evs);
    expect(await handleCallEvents(w.deps, evs)).toEqual([{ callId: 'wacid.C1', outcome: 'duplicate' }]);
    expect(w.offers).toHaveLength(1);
  });

  it('a connect older than the answer window is ignored, not answered', async () => {
    const w = world();
    w.clock.t = T0 + CONNECT_FRESH_MS + 1;
    expect(await handleCallEvents(w.deps, connect())).toEqual([{ callId: 'wacid.C1', outcome: 'stale' }]);
    expect(w.meta).toEqual([]);
  });

  it('one bad event does not stop the others', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = world();
    w.deps.findLink = async (waId) => { if (waId === '995555000999') throw new Error('db down'); return { state: 'linked', userId: 'u1' }; };
    const evs = [...connect('wacid.BAD', { from: '995555000999' }), ...connect('wacid.OK')];
    expect(await handleCallEvents(w.deps, evs)).toEqual([{ callId: 'wacid.BAD', outcome: 'failed' }, { callId: 'wacid.OK', outcome: 'offered' }]);
    expect(JSON.stringify(err.mock.calls)).not.toContain('995555000999');
    err.mockRestore();
  });
});

describe('WhatsApp calls: a full call (mocked Meta, fake bridge)', () => {
  it('requested → ringing → answered → active → ended; minutes counted; charged once at the opening price', async () => {
    const w = world();
    const auth = await answered(w);
    expect(w.meta.map((m) => m.action)).toEqual(['pre_accept', 'accept']);
    expect(w.meta[1]).toMatchObject({ sdpAnswer: SDP_ANSWER, opaque: auth.ticket.nonce });
    expect(auth.ticket).toMatchObject({ userId: 'u1', maxSeconds: 900, creditsPerMinute: 10, locale: 'ka' });

    const live = await authorizeBridge(w.deps, w.offers[0]!.ticket);
    if (!live.ok) throw new Error('auth');
    await bridgeEvent(w.deps, live, { type: 'active' });
    const metricsAuth = await authorizeBridge(w.deps, w.offers[0]!.ticket);
    if (!metricsAuth.ok) throw new Error('auth');
    await bridgeEvent(w.deps, metricsAuth, { type: 'metrics', metrics: { replyLatencyP50Ms: 820, bargeIns: 1 } });

    w.deps.policy = { ...ON, creditsPerMinute: 99 }; // a later price change never reprices an open call
    w.clock.t += 125_000;
    const term = parseCallEvents(terminatePayload({ callId: 'wacid.C1', atSec: AT + 127, duration: 125 }));
    expect(await handleCallEvents(w.deps, term)).toEqual([{ callId: 'wacid.C1', outcome: 'ended' }]);

    const r = await readCall(w.kv, 'wacid.C1');
    expect(r?.history.map((h) => h.state)).toEqual(['requested', 'ringing', 'answered', 'active', 'ended']);
    expect(r).toMatchObject({ durationSec: 125, metrics: { replyLatencyP50Ms: 820, bargeIns: 1 } });
    expect(w.charges).toEqual([{ userId: 'u1', callId: 'wacid.C1', credits: 30 }]);
    expect(await minutesToday(w.kv, 'u1', new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi' }).format(new Date(T0)))).toBe(3);

    // Meta redelivers terminate: nothing is charged twice.
    expect(await handleCallEvents(w.deps, term)).toEqual([{ callId: 'wacid.C1', outcome: 'duplicate' }]);
    expect(w.charges).toHaveLength(1);
  });

  it('Agent G hangs up (end_call / cap): we terminate at Meta and Meta\'s duration still bills', async () => {
    const w = world();
    const auth = await answered(w);
    await bridgeEvent(w.deps, auth, { type: 'end', reason: 'max_duration' });
    expect(w.meta.at(-1)).toEqual({ callId: 'wacid.C1', action: 'terminate' });
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ state: 'ended' });
    await handleCallEvents(w.deps, parseCallEvents(terminatePayload({ callId: 'wacid.C1', atSec: AT + 900, duration: 900 })));
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ state: 'ended', durationSec: 900 });
    expect(w.charges).toEqual([{ userId: 'u1', callId: 'wacid.C1', credits: 150 }]);
  });

  it('a failed call (media or Live down) is never charged, but its minutes count toward the cap', async () => {
    const w = world();
    const auth = await answered(w);
    await bridgeEvent(w.deps, auth, { type: 'end', reason: 'live_failed' });
    await handleCallEvents(w.deps, parseCallEvents(terminatePayload({ callId: 'wacid.C1', atSec: AT + 40, duration: 30 })));
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ state: 'failed', failure: 'live_failed' });
    expect(w.charges).toEqual([]);
  });

  it('no charger wired (price not live): an ended call charges nothing', async () => {
    const w = world({ charge: false });
    await answered(w);
    await handleCallEvents(w.deps, parseCallEvents(terminatePayload({ callId: 'wacid.C1', atSec: AT + 70, duration: 61 })));
    expect(w.charges).toEqual([]);
    expect(w.audits.some((a) => a.phase === 'charge')).toBe(false);
  });

  it('the caller hangs up before we answer: failed, not_answered, nothing billed', async () => {
    const w = world();
    await handleCallEvents(w.deps, connect());
    await handleCallEvents(w.deps, parseCallEvents(terminatePayload({ callId: 'wacid.C1', atSec: AT + 10 })));
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ state: 'failed', failure: 'not_answered' });
    expect(w.charges).toEqual([]);
  });

  it('the bridge refuses the call: Meta reject, bridge_unavailable', async () => {
    const w = world({ bridgeTakes: false });
    expect(await handleCallEvents(w.deps, connect())).toEqual([{ callId: 'wacid.C1', outcome: 'bridge_refused' }]);
    expect(w.meta.map((m) => m.action)).toEqual(['reject']);
    expect(await readCall(w.kv, 'wacid.C1')).toMatchObject({ failure: 'bridge_unavailable' });
  });

  it('Meta refuses pre_accept → reject; refuses accept → terminate', async () => {
    const a = world({ metaAnswers: { pre_accept: { ok: false, status: 400, errorCode: 138006 } } });
    await handleCallEvents(a.deps, connect());
    const authA = await authorizeBridge(a.deps, a.offers[0]!.ticket);
    if (!authA.ok) throw new Error('auth');
    expect(await answerCall(a.deps, authA, SDP_ANSWER)).toEqual({ ok: false, error: 'pre_accept_failed' });
    expect(a.meta.map((m) => m.action)).toEqual(['pre_accept', 'reject']);

    const b = world({ metaAnswers: { accept: { ok: false, status: 400, errorCode: 138006 } } });
    await handleCallEvents(b.deps, connect());
    const authB = await authorizeBridge(b.deps, b.offers[0]!.ticket);
    if (!authB.ok) throw new Error('auth');
    expect(await answerCall(b.deps, authB, SDP_ANSWER)).toEqual({ ok: false, error: 'accept_failed' });
    expect(b.meta.map((m) => m.action)).toEqual(['pre_accept', 'accept', 'terminate']);
    expect(await readCall(b.kv, 'wacid.C1')).toMatchObject({ state: 'failed', failure: 'meta_refused' });
  });

  it('the answer must be SDP, and only once', async () => {
    const w = world();
    await answered(w);
    const again = await authorizeBridge(w.deps, w.offers[0]!.ticket); // each bridge request re-reads the record
    if (!again.ok) throw new Error('auth');
    expect(await answerCall(w.deps, again, SDP_ANSWER)).toEqual({ ok: false, error: 'not_waiting' });
    expect(await answerCall(w.deps, again, 'hello')).toEqual({ ok: false, error: 'bad_sdp' });
  });
});

describe('WhatsApp calls: bridge authorization and user isolation', () => {
  it('a ticket only works for its own call and user, and dies with the call', async () => {
    const w = world({ links: { '995555000111': { state: 'linked', userId: 'u1' }, '995555000222': { state: 'linked', userId: 'u2' } } });
    await handleCallEvents(w.deps, connect('wacid.A', { from: '995555000111' }));
    await handleCallEvents(w.deps, connect('wacid.B', { from: '995555000222' }));
    const [ta, tb] = w.offers.map((o) => o.ticket);
    const a = await authorizeBridge(w.deps, ta!);
    const b = await authorizeBridge(w.deps, tb!);
    expect(a).toMatchObject({ ok: true, ticket: { callId: 'wacid.A', userId: 'u1' } });
    expect(b).toMatchObject({ ok: true, ticket: { callId: 'wacid.B', userId: 'u2' } });

    // A ticket claiming call B for user u1 (signed with the real secret) still fails: the record says u2.
    const forged = issueTicket({ callId: 'wacid.B', userId: 'u1', phoneNumberId: 'p', locale: 'en', maxSeconds: 60, creditsPerMinute: 10, direction: 'USER_INITIATED' }, SECRET, w.clock.t);
    expect(await authorizeBridge(w.deps, forged)).toEqual({ ok: false, status: 404, error: 'unknown_call' });
    // Signed with another secret: refused before any lookup.
    const foreign = issueTicket({ callId: 'wacid.A', userId: 'u1', phoneNumberId: 'p', locale: 'en', maxSeconds: 60, creditsPerMinute: 10, direction: 'USER_INITIATED' }, `${SECRET}x`, w.clock.t);
    expect(await authorizeBridge(w.deps, foreign)).toEqual({ ok: false, status: 401, error: 'bad_signature' });
    expect(await authorizeBridge(w.deps, null)).toEqual({ ok: false, status: 401, error: 'missing' });

    // Once call A is over, its ticket is dead even before it expires.
    await handleCallEvents(w.deps, parseCallEvents(terminatePayload({ callId: 'wacid.A', atSec: AT + 5 })));
    expect(await authorizeBridge(w.deps, ta!)).toEqual({ ok: false, status: 409, error: 'call_over' });
  });

  it('Live sessions per call are bounded', async () => {
    const w = world();
    const kv = w.kv;
    let r = newCallRecord({ callId: 'wacid.M', direction: 'USER_INITIATED', phoneNumberId: 'p', userId: 'u1', waMasked: null, at: T0 });
    await createCall(kv, r);
    for (let i = 0; i < MAX_LIVE_MINTS; i += 1) {
      expect(await takeLiveMint({ kv }, r)).toBe(true);
      r = (await readCall(kv, 'wacid.M'))!;
    }
    expect(await takeLiveMint({ kv }, r)).toBe(false);
  });

  it('bridge events are parsed strictly', () => {
    expect(parseBridgeEvent({ type: 'active' })).toEqual({ type: 'active' });
    expect(parseBridgeEvent({ type: 'end', reason: 'hangup', metrics: { bargeIns: 2, evil: 'x', reconnects: -1 } })).toEqual({ type: 'end', reason: 'hangup', metrics: { bargeIns: 2 } });
    expect(parseBridgeEvent({ type: 'end', reason: 'other' })).toBeNull();
    expect(parseBridgeEvent({ type: 'charge', credits: 100 })).toBeNull();
    expect(parseBridgeEvent('active')).toBeNull();
  });
});

describe('WhatsApp calls Agent G placed (status webhooks)', () => {
  it('RINGING → ringing, ACCEPTED → answered, REJECTED → failed(rejected); unknown calls are ignored', async () => {
    const w = world();
    await createCall(w.kv, newCallRecord({ callId: 'wacid.OUT', direction: 'BUSINESS_INITIATED', phoneNumberId: 'p', userId: 'u1', waMasked: null, at: T0 }));
    await handleCallEvents(w.deps, parseCallEvents(statusPayload({ callId: 'wacid.OUT', atSec: AT, status: 'RINGING' })));
    expect(await readCall(w.kv, 'wacid.OUT')).toMatchObject({ state: 'ringing' });
    await handleCallEvents(w.deps, parseCallEvents(statusPayload({ callId: 'wacid.OUT', atSec: AT + 3, status: 'ACCEPTED' })));
    expect(await readCall(w.kv, 'wacid.OUT')).toMatchObject({ state: 'answered' });

    await createCall(w.kv, newCallRecord({ callId: 'wacid.OUT2', direction: 'BUSINESS_INITIATED', phoneNumberId: 'p', userId: 'u1', waMasked: null, at: T0 }));
    await handleCallEvents(w.deps, parseCallEvents(statusPayload({ callId: 'wacid.OUT2', atSec: AT, status: 'REJECTED' })));
    expect(await readCall(w.kv, 'wacid.OUT2')).toMatchObject({ state: 'failed', failure: 'rejected' });

    expect(await handleCallEvents(w.deps, parseCallEvents(statusPayload({ callId: 'wacid.NONE', atSec: AT, status: 'RINGING' }))))
      .toEqual([{ callId: 'wacid.NONE', outcome: 'unknown_call' }]);
  });
});
