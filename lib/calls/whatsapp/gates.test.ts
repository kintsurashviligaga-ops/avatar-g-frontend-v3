/** @jest-environment node */
import { callCredits, decideInbound, decideOutbound, DEFAULT_CALL_POLICY, type CallPolicy, type InboundFacts, type OutboundFacts } from './gates';

const ON: CallPolicy = { enabled: true, creditsPerMinute: 10, minFundedMinutes: 2, outboundPerDay: 2 };
const facts = (o: Partial<InboundFacts> = {}): InboundFacts => ({
  link: { state: 'linked', userId: 'u1' },
  calls: { enabled: true, perCallMinutes: 15, dailyMinutes: 30 },
  balance: 500,
  minutesToday: 0,
  bridgeReady: true,
  ...o,
});
const out = (o: Partial<OutboundFacts> = {}): OutboundFacts => ({
  ...facts(), permission: 'granted', insideCallWindow: true, outboundToday: 0, unansweredStreak: 0, ...o,
});

describe('WhatsApp call gates', () => {
  it('is off by default, and stays closed while no price is approved', () => {
    expect(decideInbound(DEFAULT_CALL_POLICY, facts())).toEqual({ allow: false, reason: 'calling_off' });
    expect(decideInbound({ ...ON, creditsPerMinute: null }, facts())).toEqual({ allow: false, reason: 'price_not_approved' });
    expect(decideInbound({ ...ON, creditsPerMinute: 0 }, facts())).toEqual({ allow: false, reason: 'price_not_approved' });
    expect(decideInbound({ ...ON, creditsPerMinute: 2.5 }, facts())).toEqual({ allow: false, reason: 'price_not_approved' });
  });

  it('caller ID only finds the link: unlinked, unknown and missing tables are refused', () => {
    expect(decideInbound(ON, facts({ link: { state: 'unlinked' } }))).toEqual({ allow: false, reason: 'not_linked' });
    expect(decideInbound(ON, facts({ link: { state: 'unavailable' } }))).toEqual({ allow: false, reason: 'links_unavailable' });
  });

  it('respects the person\'s own switch and limits', () => {
    expect(decideInbound(ON, facts({ calls: { enabled: false, perCallMinutes: 15, dailyMinutes: 30 } }))).toEqual({ allow: false, reason: 'calls_opted_out' });
    expect(decideInbound(ON, facts({ minutesToday: 30 }))).toEqual({ allow: false, reason: 'daily_cap' });
  });

  it('needs the minimum funded call, and an unreadable balance starts nothing', () => {
    expect(decideInbound(ON, facts({ balance: 19 }))).toEqual({ allow: false, reason: 'insufficient_balance' });
    expect(decideInbound(ON, facts({ balance: null }))).toEqual({ allow: false, reason: 'insufficient_balance' });
    expect(decideInbound(ON, facts({ bridgeReady: false }))).toEqual({ allow: false, reason: 'bridge_unavailable' });
  });

  it('caps the call by per-call minutes, minutes left today and funded minutes', () => {
    expect(decideInbound(ON, facts())).toEqual({ allow: true, userId: 'u1', maxSeconds: 15 * 60, creditsPerMinute: 10 });
    expect(decideInbound(ON, facts({ minutesToday: 26 }))).toMatchObject({ allow: true, maxSeconds: 4 * 60 });
    expect(decideInbound(ON, facts({ balance: 35 }))).toMatchObject({ allow: true, maxSeconds: 3 * 60 });
  });

  it('a call we place also needs WhatsApp permission, the call window and the daily outbound limit', () => {
    expect(decideOutbound(ON, out())).toMatchObject({ allow: true });
    expect(decideOutbound(ON, out({ permission: 'unknown' }))).toEqual({ allow: false, reason: 'no_call_permission' });
    expect(decideOutbound(ON, out({ permission: 'none' }))).toEqual({ allow: false, reason: 'no_call_permission' });
    expect(decideOutbound(ON, out({ insideCallWindow: false }))).toEqual({ allow: false, reason: 'quiet_hours' });
    expect(decideOutbound(ON, out({ outboundToday: 2 }))).toEqual({ allow: false, reason: 'daily_cap' });
    expect(decideOutbound(ON, out({ unansweredStreak: 2 }))).toEqual({ allow: false, reason: 'daily_cap' });
    expect(decideOutbound(DEFAULT_CALL_POLICY, out())).toEqual({ allow: false, reason: 'calling_off' });
  });

  it('charges started minutes at the opening price, nothing for an unconnected call', () => {
    expect(callCredits(0, 10)).toBe(0);
    expect(callCredits(1, 10)).toBe(10);
    expect(callCredits(60, 10)).toBe(10);
    expect(callCredits(61, 10)).toBe(20);
    expect(callCredits(900, 9)).toBe(135);
    expect(callCredits(Number.NaN, 10)).toBe(0);
  });
});
