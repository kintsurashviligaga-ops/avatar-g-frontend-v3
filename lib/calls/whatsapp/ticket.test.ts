/** @jest-environment node */
import { bridgeSecret, issueTicket, signBridgeRequest, TICKET_MARGIN_MS, ticketFromRequest, verifyBridgeRequest, verifyTicket } from './ticket';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const T0 = 1_760_000_000_000;
const input = { callId: 'wacid.T', userId: 'u1', phoneNumberId: 'p', locale: 'ka' as const, maxSeconds: 600, creditsPerMinute: 10, direction: 'USER_INITIATED' as const };

describe('call ticket (bridge pass for one call)', () => {
  it('needs a secret of at least 32 characters, else fails closed', () => {
    expect(bridgeSecret({ CALL_BRIDGE_SECRET: 'short' } as NodeJS.ProcessEnv)).toBe('');
    expect(bridgeSecret({} as NodeJS.ProcessEnv)).toBe('');
    expect(bridgeSecret({ CALL_BRIDGE_SECRET: SECRET } as NodeJS.ProcessEnv)).toBe(SECRET);
    expect(() => issueTicket(input, '', T0)).toThrow();
    expect(verifyTicket('a.b', '', T0)).toEqual({ ok: false, error: 'malformed' });
  });

  it('round-trips and expires after the call cap plus the margin', () => {
    const t = issueTicket(input, SECRET, T0);
    const ok = verifyTicket(t, SECRET, T0 + 1000);
    expect(ok).toMatchObject({ ok: true, ticket: { ...input, v: 1, exp: T0 + 600_000 + TICKET_MARGIN_MS } });
    expect(verifyTicket(t, SECRET, T0 + 600_000 + TICKET_MARGIN_MS)).toEqual({ ok: false, error: 'expired' });
  });

  it('refuses a forged, re-signed or edited ticket', () => {
    const t = issueTicket(input, SECRET, T0);
    expect(verifyTicket(t, `${SECRET}y`, T0)).toEqual({ ok: false, error: 'bad_signature' });
    const [payload, sig] = t.split('.');
    const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), userId: 'u2' })).toString('base64url');
    expect(verifyTicket(`${edited}.${sig}`, SECRET, T0)).toEqual({ ok: false, error: 'bad_signature' });
    expect(verifyTicket('nodot', SECRET, T0)).toEqual({ ok: false, error: 'malformed' });
    expect(verifyTicket(undefined, SECRET, T0)).toEqual({ ok: false, error: 'missing' });
    expect(verifyTicket(`${'a'.repeat(3000)}.b`, SECRET, T0)).toEqual({ ok: false, error: 'malformed' });
  });

  it('every ticket is different (nonce)', () => {
    expect(issueTicket(input, SECRET, T0)).not.toBe(issueTicket(input, SECRET, T0));
  });

  it('reads the Bearer header', () => {
    expect(ticketFromRequest(new Request('https://x', { headers: { authorization: 'Bearer abc.def' } }))).toBe('abc.def');
    expect(ticketFromRequest(new Request('https://x'))).toBeNull();
  });

  it('signs app → bridge requests and refuses replays outside ±60 s', () => {
    const h = signBridgeRequest('{"a":1}', SECRET, T0);
    expect(verifyBridgeRequest('{"a":1}', h, SECRET, T0 + 59_000)).toBe(true);
    expect(verifyBridgeRequest('{"a":1}', h, SECRET, T0 + 61_000)).toBe(false);
    expect(verifyBridgeRequest('{"a":2}', h, SECRET, T0)).toBe(false);
    expect(verifyBridgeRequest('{"a":1}', h, `${SECRET}z`, T0)).toBe(false);
    expect(verifyBridgeRequest('{"a":1}', null, SECRET, T0)).toBe(false);
    expect(verifyBridgeRequest('{"a":1}', 'garbage', SECRET, T0)).toBe(false);
  });
});
