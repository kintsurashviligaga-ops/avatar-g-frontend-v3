/**
 * The pricing audit's rule, held by tests: every proposed price clears the owner's 62 % floor against the op's FULL cost
 * (list price, re-renders, compute, storage, FX reserve) measured on what a credit nets after VAT and the card fee.
 */
import { PHONE_COMPRESSION } from '@/lib/calls/whatsapp/phoneSetup';
import {
  CALL_BRIDGE_VM_USD_PER_MONTH,
  CALL_CAP,
  CALL_CAP_FALLBACK,
  CALL_PLANNING_MINUTES_PER_MONTH,
  ECON,
  FREE_DAILY,
  META_GE_BUSINESS_CALL_USD_PER_MIN,
  META_GE_SERVICE_MESSAGE_USD,
  PROPOSED,
  PROPOSED_VIDEO_PER_SEC,
  UNIT_OPS,
  deckCostGel,
  floorCredits,
  liveCallGeminiUsd,
  marginAt,
  marginOf,
  netGelPerCredit,
  opCostGel,
  proposedDeckCredits,
  proposedVideoCredits,
  targetCredits,
  unitOp,
  usdToCostGel,
  videoCostGel,
} from './unitEconomics';

const TIERS = Object.keys(PROPOSED_VIDEO_PER_SEC) as Array<keyof typeof PROPOSED_VIDEO_PER_SEC>;

describe('the money side', () => {
  test('a credit nets 0.10 ₾ less VAT and the card fee', () => {
    expect(netGelPerCredit()).toBeCloseTo((0.1 / 1.18) * 0.97, 6);
    expect(ECON.targetMargin).toBe(0.65);
    expect(ECON.floorMargin).toBe(0.62);
  });

  test('every op that costs money has a cost line, and no paid line is 0', () => {
    for (const op of UNIT_OPS) {
      if (op.status === 'BLOCKED') continue;
      for (const line of op.lines) expect(line.usd).toBeGreaterThan(0);
    }
  });

  test('the target price is never below the floor price', () => {
    for (const op of UNIT_OPS) expect(targetCredits(op)).toBeGreaterThanOrEqual(floorCredits(op));
  });
});

describe('every proposed price clears the 62 % floor', () => {
  test.each(Object.entries(PROPOSED))('%s at %i credits', (id, credits) => {
    const op = unitOp(id);
    expect(op.status).not.toBe('BLOCKED');
    expect(marginAt(op, credits)).toBeGreaterThanOrEqual(ECON.floorMargin);
    // …and at or above the target-margin price, so a rounding never spends the headroom.
    expect(credits).toBeGreaterThanOrEqual(targetCredits(op));
  });

  test.each(TIERS)('a %s video of 8 to 48 s, documentary and music video', (tier) => {
    for (let seconds = 8; seconds <= 48; seconds += 8) {
      for (const musicVideo of [false, true]) {
        const m = marginOf(proposedVideoCredits(seconds, tier, musicVideo), videoCostGel(seconds, tier, musicVideo));
        expect(m).toBeGreaterThanOrEqual(ECON.floorMargin);
      }
    }
  });

  test('a deck of 1 to 12 slides, with and without pictures', () => {
    for (let slides = 1; slides <= 12; slides += 1) {
      for (const illustrated of [true, false]) {
        expect(marginOf(proposedDeckCredits(slides, illustrated), deckCostGel(slides, illustrated))).toBeGreaterThanOrEqual(ECON.floorMargin);
      }
    }
  });

  test('a BLOCKED op has no proposed price (it is refused, never sold)', () => {
    for (const op of UNIT_OPS.filter((o) => o.status === 'BLOCKED')) expect(PROPOSED[op.id]).toBeUndefined();
  });

  test('every paid op has a price: nothing that costs money is left out of the table', () => {
    const priced = new Set([
      ...Object.keys(PROPOSED),
      // Priced through their compositions above.
      ...UNIT_OPS.filter((o) => o.id.startsWith('video.clip.')).map((o) => o.id),
      'video.film.base', 'video.music-video.song', 'design.presentation.deck',
    ]);
    const freeByDesign = UNIT_OPS.filter((o) => o.status === 'FREE_CAPPED').map((o) => o.id);
    for (const op of UNIT_OPS) {
      if (op.status === 'BLOCKED' || freeByDesign.includes(op.id)) continue;
      expect(priced.has(op.id)).toBe(true);
    }
  });
});

describe('stress: what a pack and a free account can cost', () => {
  // Packs and (future) plans sell every credit at the same 0.10 ₾ — no bonus credits until the margin is proven — so the
  // worst a buyer can do is spend a whole pack on the op with the thinnest margin.
  const lowestMargin = Math.min(
    ...Object.entries(PROPOSED).map(([id, c]) => marginAt(unitOp(id), c)),
    ...TIERS.map((t) => marginOf(proposedVideoCredits(8, t), videoCostGel(8, t))),
  );

  test.each([10, 20, 50])('a %i ₾ pack spent on the thinnest-margin op still clears the floor', (gel) => {
    const credits = gel / ECON.creditGel;
    const revenue = credits * netGelPerCredit();
    const worstCost = revenue * (1 - lowestMargin);
    expect(1 - worstCost / revenue).toBeGreaterThanOrEqual(ECON.floorMargin);
  });

  test('a free account that maxes every daily cap costs a bounded amount a day', () => {
    const day =
      FREE_DAILY.chatAnswers * opCostGel(unitOp('chat.message')) +
      FREE_DAILY.liveVoiceMinutes * opCostGel(unitOp('agent-g.live.minute')) +
      FREE_DAILY.montages * opCostGel(unitOp('agent-g.montage')) +
      FREE_DAILY.mp3Extracts * opCostGel(unitOp('agent-g.audio')) +
      FREE_DAILY.agentEdits * opCostGel(unitOp('agent-g.edit')) +
      FREE_DAILY.ffmpegRemixEdits * opCostGel(unitOp('video.remix.ffmpeg'));
    // Every cap hit every day, chat at its p95 cost: under 4.5 ₾ a day (about 1.5 ₾ at chat's average cost). The doc
    // states the figure; the global daily ceiling (BillingGuard) bounds the sum across accounts.
    expect(day).toBeLessThan(4.5);
    expect(day).toBeGreaterThan(0);
  });

  test('the sign-up grant (50 credits) costs at most what 50 credits of the thinnest-margin op cost', () => {
    const grantCost = 50 * netGelPerCredit() * (1 - lowestMargin);
    expect(grantCost).toBeLessThan(1.6);
  });
});

describe('today\'s prices against the same rule (what the audit found)', () => {
  // Pinned so a change to a live price or a cost shows up here and in the doc together.
  const belowFloorToday = UNIT_OPS.filter((o) => (o.currentCredits ?? 0) > 0 && o.status !== 'BLOCKED' && marginAt(o, o.currentCredits as number) < ECON.floorMargin)
    .map((o) => o.id)
    .sort();

  test('ops sold below the 62 % floor today', () => {
    expect(belowFloorToday).toEqual([
      'image.one',
      'music.track.180',
      'music.track.60',
      'music.track.90',
      'research.deep',
      'video.clip.fast',
      'video.clip.lite',
      'video.clip.standard',
    ]);
  });

  test('an 8 s Fast scene sells below its cost today', () => {
    expect(marginAt(unitOp('video.clip.fast'), 25)).toBeLessThan(0);
  });
});

describe('WhatsApp calls (docs/handoffs/omnichannel/COMMUNICATION_UNIT_ECONOMICS.md)', () => {
  type Cap = typeof CALL_CAP | typeof CALL_CAP_FALLBACK;
  /** One call's variable cost in USD, the way the calculator adds it up: Gemini (+5 % dropped calls), Meta, the result message, egress. */
  const callUsd = (minutes: number, outbound: boolean, cap: Cap) =>
    liveCallGeminiUsd(minutes, cap) * 1.05 + (outbound ? META_GE_BUSINESS_CALL_USD_PER_MIN * minutes : 0) + META_GE_SERVICE_MESSAGE_USD + (0.34 / 1000) * minutes;
  const monthMargin = (credits: number, minutesPerMonth: number, callMinutes: number, outbound: boolean, cap: Cap) => {
    const usd = (minutesPerMonth / callMinutes) * callUsd(callMinutes, outbound, cap) + CALL_BRIDGE_VM_USD_PER_MONTH;
    return marginOf(credits * minutesPerMonth, usdToCostGel(usd));
  };
  const price = PROPOSED['agent-g.whatsapp-call.minute']!;

  test('the Gemini call model gives the calculator\'s numbers (research/wa_cost.py)', () => {
    expect(liveCallGeminiUsd(5, CALL_CAP)).toBeCloseTo(0.236, 2);
    expect(liveCallGeminiUsd(15, CALL_CAP)).toBeCloseTo(0.958, 2);
    expect(liveCallGeminiUsd(30, CALL_CAP)).toBeCloseTo(2.023, 2);
    expect(liveCallGeminiUsd(30, CALL_CAP_FALLBACK)).toBeCloseTo(2.691, 2);
    expect(liveCallGeminiUsd(30, null)).toBeCloseTo(5.97, 2);
  });

  test('the cap the price assumes is the cap the phone session sends to Google', () => {
    expect(CALL_CAP).toEqual(PHONE_COMPRESSION);
  });

  test('without an explicit cap a 30-minute call costs Google about 3x as much (the cap is not optional)', () => {
    expect(liveCallGeminiUsd(30, null) / liveCallGeminiUsd(30, CALL_CAP)).toBeGreaterThan(2.5);
  });

  test('not sold today: no current price, and the proposal is one number for both directions', () => {
    expect(unitOp('agent-g.whatsapp-call.minute').currentCredits).toBeNull();
    expect(price).toBe(12);
  });

  test.each([
    ['today\'s 8k → 4k cap', CALL_CAP],
    ['the 12k → 6k fallback', CALL_CAP_FALLBACK],
  ] as const)('at 1,000 call-minutes a month, VM included, it clears the floor for every length and direction (%s)', (_label, cap) => {
    for (const minutes of [1, 2, 5, 10, 15, 20, 30]) {
      for (const outbound of [false, true]) expect(monthMargin(price, CALL_PLANNING_MINUTES_PER_MONTH, minutes, outbound, cap)).toBeGreaterThanOrEqual(ECON.floorMargin);
    }
  });

  test('on today\'s cap it reaches the 65 % target at 1,000 call-minutes a month for every length and direction', () => {
    for (const minutes of [5, 15, 30]) {
      for (const outbound of [false, true]) expect(monthMargin(price, 1000, minutes, outbound, CALL_CAP)).toBeGreaterThanOrEqual(ECON.targetMargin);
    }
  });

  test('at 100 call-minutes a month the VM decides: the doc\'s warning that no near price clears the floor stays true', () => {
    expect(monthMargin(price, 100, 15, false, CALL_CAP)).toBeLessThan(ECON.floorMargin);
    expect(monthMargin(price, 100, 15, false, CALL_CAP)).toBeGreaterThan(0);
  });
});
