/** @jest-environment node */
import { callEventKey, hasCallsField, parseCallEvents, SDP_MAX_CHARS } from './events';
import { PHONE_NUMBER_ID, SDP_OFFER, connectPayload, messagesPayload, statusPayload, terminatePayload } from './testFixtures';

const AT = 1_760_000_000;

describe('WhatsApp call webhook events (mocked Meta payloads)', () => {
  it('tells a calls delivery from a messages delivery', () => {
    expect(hasCallsField(connectPayload({ callId: 'wacid.TEST1', atSec: AT }))).toBe(true);
    expect(hasCallsField(messagesPayload)).toBe(false);
    expect(hasCallsField(null)).toBe(false);
    expect(hasCallsField({ entry: 'x' })).toBe(false);
  });

  it('reads a user-initiated connect with its SDP offer', () => {
    const [e] = parseCallEvents(connectPayload({ callId: 'wacid.TEST1', atSec: AT }));
    expect(e).toEqual({
      kind: 'connect', callId: 'wacid.TEST1', phoneNumberId: PHONE_NUMBER_ID, waId: '995555000111', bsuid: null,
      at: AT * 1000, direction: 'USER_INITIATED', sdp: { type: 'offer', sdp: SDP_OFFER },
    });
  });

  it('keeps a username caller (no number) as waId null with the BSUID', () => {
    const [e] = parseCallEvents(connectPayload({ callId: 'wacid.TEST2', atSec: AT, from: null, fromUserId: 'GE.bsuid.1' }));
    expect(e).toMatchObject({ kind: 'connect', waId: null, bsuid: 'GE.bsuid.1' });
  });

  it('drops a connect whose SDP is not SDP or is too big, but keeps the event', () => {
    const [bad] = parseCallEvents(connectPayload({ callId: 'wacid.TEST3', atSec: AT, sdp: '<script>' }));
    expect(bad).toMatchObject({ kind: 'connect', sdp: null });
    const [big] = parseCallEvents(connectPayload({ callId: 'wacid.TEST4', atSec: AT, sdp: `v=0${'a'.repeat(SDP_MAX_CHARS)}` }));
    expect(big).toMatchObject({ sdp: null });
  });

  it('drops events with a malformed id or timestamp', () => {
    expect(parseCallEvents(connectPayload({ callId: 'x', atSec: AT }))).toEqual([]);
    expect(parseCallEvents(connectPayload({ callId: 'wacid.ok', atSec: 12 }))).toEqual([]);
    expect(parseCallEvents(connectPayload({ callId: 'wacid.bad id with spaces', atSec: AT }))).toEqual([]);
  });

  it('reads terminate: status as a string or a list, duration, error code', () => {
    const [done] = parseCallEvents(terminatePayload({ callId: 'wacid.T', atSec: AT, duration: 125 }));
    expect(done).toMatchObject({ kind: 'terminate', status: 'COMPLETED', durationSec: 125, errorCode: null });
    const [listed] = parseCallEvents(terminatePayload({ callId: 'wacid.T', atSec: AT, status: ['FAILED'], errorCode: 138006 }));
    expect(listed).toMatchObject({ status: 'FAILED', durationSec: null, errorCode: 138006 });
    const [odd] = parseCallEvents(terminatePayload({ callId: 'wacid.T', atSec: AT, status: 'WEIRD' }));
    expect(odd).toMatchObject({ status: null });
  });

  it('reads business-initiated call statuses; ignores message statuses', () => {
    const [s] = parseCallEvents(statusPayload({ callId: 'wacid.OUT1', atSec: AT, status: 'RINGING' }));
    expect(s).toMatchObject({ kind: 'status', status: 'RINGING', waId: '995555000111' });
    expect(parseCallEvents(statusPayload({ callId: 'wacid.OUT1', atSec: AT, status: 'delivered' }))).toEqual([]);
  });

  it('for a call we placed, the person is `to`', () => {
    const p = connectPayload({ callId: 'wacid.OUT2', atSec: AT, direction: 'BUSINESS_INITIATED' });
    const call = (p.entry[0]!.changes[0]!.value as { calls: Array<Record<string, unknown>> }).calls[0]!;
    call.from = '15550000000';
    call.to = '995555000222';
    const [e] = parseCallEvents(p);
    expect(e).toMatchObject({ direction: 'BUSINESS_INITIATED', waId: '995555000222' });
  });

  it('gives each event kind its own dedupe key', () => {
    const [c] = parseCallEvents(connectPayload({ callId: 'wacid.K', atSec: AT }));
    const [t] = parseCallEvents(terminatePayload({ callId: 'wacid.K', atSec: AT }));
    const [r] = parseCallEvents(statusPayload({ callId: 'wacid.K', atSec: AT, status: 'RINGING' }));
    const [a] = parseCallEvents(statusPayload({ callId: 'wacid.K', atSec: AT, status: 'ACCEPTED' }));
    expect(new Set([c, t, r, a].map((e) => callEventKey(e!))).size).toBe(4);
  });
});
