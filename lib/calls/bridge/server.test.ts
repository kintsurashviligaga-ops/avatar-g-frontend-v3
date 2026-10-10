/**
 * @jest-environment node
 *
 * The bridge's own door: only our app's signed, fresh offers start a call; a call id is taken once; a full bridge says
 * so (health 503) instead of ringing; nothing else is served.
 */
import { signBridgeRequest } from '@/lib/calls/whatsapp/ticket';
import { SDP_OFFER } from '@/lib/calls/whatsapp/testFixtures';
import { BridgeServer, BRIDGE_REQUEST_MAX_BYTES, type HttpIn } from './server';
import type { MediaPeer } from './callBridge';

const SECRET = 'bridge-server-secret-for-tests-'.padEnd(48, 's');
const NOW = 1_760_000_000_000;

function setup(capacity = 2) {
  const peers: MediaPeer[] = [];
  const logs: string[] = [];
  const fetchCalls: string[] = [];
  const server = new BridgeServer({
    secret: SECRET, appOrigin: 'https://myavatar.example', capacity, now: () => NOW,
    newPeer: () => {
      // An answer that never settles keeps the call open for the test.
      const p: MediaPeer = { answer: () => new Promise<string>(() => undefined), onAudio: null, onState: null, sendFrame: () => undefined, close: () => undefined };
      peers.push(p);
      return p;
    },
    openLive: () => { throw new Error('not in this test'); },
    fetch: (async (u: RequestInfo | URL) => { fetchCalls.push(String(u)); return new Response('{}'); }) as typeof fetch,
    log: (e, d) => logs.push(`${e} ${JSON.stringify(d ?? {})}`),
  });
  return { server, peers, logs, fetchCalls };
}

const offer = (callId: string, o: { at?: number; secret?: string; body?: string } = {}): HttpIn => {
  const body = o.body ?? JSON.stringify({ ticket: 'payload.signature', callId, sdpOffer: SDP_OFFER });
  const sig = signBridgeRequest(body, o.secret ?? SECRET, o.at ?? NOW);
  return { method: 'POST', path: '/calls', header: (n) => (n === 'x-call-signature' ? sig : null), body };
};
const health: HttpIn = { method: 'GET', path: '/health', header: () => null, body: '' };

describe('bridge server', () => {
  it('starts a call for a signed, fresh offer and refuses the same call id again (replay)', async () => {
    const { server, peers, logs } = setup();
    expect(await server.handle(offer('wacid.ONE'))).toEqual({ status: 202, body: { accepted: true } });
    expect(server.calls.size).toBe(1);
    expect(peers).toHaveLength(1);
    expect(await server.handle(offer('wacid.ONE'))).toEqual({ status: 409, body: { error: 'duplicate_call' } });
    // The ticket, the SDP and the full call id never reach the log.
    expect(logs.join('\n')).not.toMatch(/payload\.signature|v=0|wacid\.ONE/);
  });

  it('refuses unsigned, wrongly signed and stale offers', async () => {
    const { server } = setup();
    const unsigned = { ...offer('wacid.A'), header: () => null };
    expect((await server.handle(unsigned)).status).toBe(401);
    expect((await server.handle(offer('wacid.B', { secret: 'another-secret-another-secret-another' }))).status).toBe(401);
    expect((await server.handle(offer('wacid.C', { at: NOW - 61_000 }))).status).toBe(401);
    // A valid signature over a different body does not carry over.
    const good = offer('wacid.D');
    expect((await server.handle({ ...good, body: good.body.replace('wacid.D', 'wacid.E') })).status).toBe(401);
    expect(server.calls.size).toBe(0);
  });

  it('validates the offer: JSON, ticket shape, call id, SDP', async () => {
    const { server } = setup();
    expect((await server.handle(offer('x', { body: 'not json' }))).body).toEqual({ error: 'bad_json' });
    expect((await server.handle(offer('x', { body: JSON.stringify({ ticket: 'no-dot', callId: 'wacid.F', sdpOffer: SDP_OFFER }) }))).body).toEqual({ error: 'bad_ticket' });
    expect((await server.handle(offer('x', { body: JSON.stringify({ ticket: 'a.b', callId: 'bad id!', sdpOffer: SDP_OFFER }) }))).body).toEqual({ error: 'bad_call_id' });
    expect((await server.handle(offer('x', { body: JSON.stringify({ ticket: 'a.b', callId: 'wacid.G', sdpOffer: 'hello' }) }))).body).toEqual({ error: 'bad_sdp' });
    expect((await server.handle(offer('x', { body: 'x'.repeat(BRIDGE_REQUEST_MAX_BYTES + 1) }))).status).toBe(413);
  });

  it('when full: health is 503 and a new offer is refused as busy', async () => {
    const { server } = setup(1);
    expect(await server.handle(health)).toEqual({ status: 200, body: { ok: true, active: 0, capacity: 1 } });
    await server.handle(offer('wacid.H'));
    expect(await server.handle(health)).toEqual({ status: 503, body: { ok: false, active: 1, capacity: 1 } });
    expect(await server.handle(offer('wacid.I'))).toEqual({ status: 503, body: { error: 'busy' } });
  });

  it('serves nothing else', async () => {
    const { server } = setup();
    expect((await server.handle({ method: 'GET', path: '/calls', header: () => null, body: '' })).status).toBe(404);
    expect((await server.handle({ method: 'POST', path: '/admin', header: () => null, body: '' })).status).toBe(404);
  });

  it('an ended call frees its place', async () => {
    const { server } = setup(1);
    await server.handle(offer('wacid.J'));
    const c = server.calls.get('wacid.J')!;
    await c.finish('hangup');
    expect(server.calls.size).toBe(0);
    expect((await server.handle(health)).status).toBe(200);
  });
});
