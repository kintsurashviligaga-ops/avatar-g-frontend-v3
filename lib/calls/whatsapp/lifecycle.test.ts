/** @jest-environment node */
import { billableSeconds, CALL_STATES, canCallTransition, moveCall, newCallRecord } from './lifecycle';

const rec = () => newCallRecord({ callId: 'wacid.L', direction: 'USER_INITIATED', phoneNumberId: 'p', userId: 'u1', waMasked: '+995 ••• ••111', at: 1000 });

describe('WhatsApp call lifecycle', () => {
  it('walks requested → ringing → answered → active → ended and stamps the times', () => {
    let r = rec();
    for (const [to, at] of [['ringing', 2000], ['answered', 3000], ['active', 3500], ['ended', 63_500]] as const) {
      const m = moveCall(r, to, at, to === 'ended' ? 'completed' : undefined);
      expect(m.moved).toBe(true);
      r = m.record;
    }
    expect(r.state).toBe('ended');
    expect(r.history.map((h) => h.state)).toEqual(['requested', 'ringing', 'answered', 'active', 'ended']);
    expect(r).toMatchObject({ answeredAt: 3000, activeAt: 3500, endedAt: 63_500 });
    expect(r.failure).toBeUndefined();
    expect(billableSeconds(r)).toBe(61);
  });

  it('never moves a final call, never moves backwards, ignores the same state', () => {
    const ended = moveCall(rec(), 'ended', 2000, 'completed').record;
    expect(moveCall(ended, 'active', 3000)).toMatchObject({ moved: false, why: 'final' });
    expect(moveCall(ended, 'failed', 3000, 'meta_failed')).toMatchObject({ moved: false, why: 'final' });
    const answered = moveCall(rec(), 'answered', 2000).record;
    expect(moveCall(answered, 'ringing', 2500)).toMatchObject({ moved: false, why: 'backwards' });
    expect(moveCall(answered, 'answered', 2500)).toMatchObject({ moved: false, why: 'same' });
  });

  it('records the failure code only for a failed call', () => {
    const f = moveCall(rec(), 'failed', 2000, 'insufficient_balance').record;
    expect(f).toMatchObject({ state: 'failed', failure: 'insufficient_balance', endedAt: 2000 });
    const hung = moveCall(moveCall(rec(), 'answered', 2000).record, 'ended', 5000, 'max_duration').record;
    expect(hung.failure).toBeUndefined();
  });

  it('final states have no way out; every state is in the table', () => {
    for (const s of CALL_STATES) for (const t of CALL_STATES) {
      if (s === 'ended' || s === 'failed') expect(canCallTransition(s, t)).toBe(false);
    }
    expect(canCallTransition('requested', 'active')).toBe(false); // media only after an answer
  });

  it('bills Meta\'s duration first, else answer → end, else nothing', () => {
    const r = moveCall(moveCall(rec(), 'answered', 2000).record, 'ended', 12_000).record;
    expect(billableSeconds(r)).toBe(10);
    expect(billableSeconds({ ...r, durationSec: 7 })).toBe(7);
    expect(billableSeconds(moveCall(rec(), 'failed', 9000, 'not_answered').record)).toBe(0);
  });
});
