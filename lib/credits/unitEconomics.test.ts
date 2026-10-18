/**
 * The cost side of the price book, held by tests: every op that costs money has a non-zero cost line, the owner's rule is the
 * formula it says it is, and the 2026-10-10 audit's table (kept for comparison) still clears its own 62 % floor. The live
 * prices themselves are held to the rule by lib/credits/priceBook.test.ts.
 */
import { PHONE_COMPRESSION } from '@/lib/calls/whatsapp/phoneSetup';
import {
  AUDIT_2026_10_10,
  CALL_BRIDGE_VM_USD_PER_MONTH,
  CALL_CAP,
  CALL_CAP_FALLBACK,
  CALL_PLANNING_MINUTES_PER_MONTH,
  ECON,
  ECON_2026_10_10,
  FREE_DAILY,
  META_GE_BUSINESS_CALL_USD_PER_MIN,
  META_GE_SERVICE_MESSAGE_USD,
  UNIT_OPS,
  auditVideoCredits,
  creditsForMargin,
  liveCallGeminiUsd,
  marginOf,
  netGelPerCredit,
  opCostGel,
  profitOverCostOf,
  ruleCredits,
  ruleCreditsForCost,
  unitOp,
  usdToCostGel,
  videoCostGel,
} from './unitEconomics';

const TIERS = ['lite', 'fast', 'standard'] as const;
const AUDIT = ECON_2026_10_10;

describe('the money side', () => {
  test('the rule: 100 % profit over full cost, bank fee 3 % (estimated), no VAT, a credit at 0.10 ₾', () => {
    expect(ECON.profitOverCost).toBe(1);
    expect(ECON.paymentFeeRate).toBe(0.03);
    expect(ECON.vatRate).toBe(0);
    expect(ECON.creditGel).toBe(0.1);
  });

  test('every op that costs money has a cost line, and no paid line is 0', () => {
    for (const op of UNIT_OPS) {
      if (op.status === 'BLOCKED') continue;
      for (const line of op.lines) expect(line.usd).toBeGreaterThan(0);
    }
  });

  test('a price from the rule earns 100 % over its full cost, and one credit less does not', () => {
    for (const op of UNIT_OPS) {
      const credits = ruleCredits(op);
      if (credits === 0) continue;
      const cost = opCostGel(op);
      expect(profitOverCostOf(credits, cost)).toBeGreaterThanOrEqual(1 - 1e-9);
      if (credits > 1) expect(profitOverCostOf(credits - 1, cost)).toBeLessThan(1);
    }
  });

  test('the formula, by hand: price = 2 × cost ÷ (1 − 2 × 3 %) on a 1 ₾ cost, a VAT payer pays 18 % on top of the net', () => {
    expect(ruleCreditsForCost(1)).toBe(Math.ceil(2 / 0.94 / 0.1));
    expect(ruleCreditsForCost(1, { ...ECON, vatRate: 0.18 })).toBe(Math.ceil(2 / (1 / 1.18 - 0.06) / 0.1));
    expect(ruleCreditsForCost(0)).toBe(0);
  });

  test('profit over cost reads the same arithmetic back: break-even is 0, and the fee counts even on a free op', () => {
    // 1 ₾ cost sold at a price whose net after the 3 % fee is exactly the cost: profit 0.
    expect(profitOverCostOf(1 / 0.97 / 0.1, 1)).toBeCloseTo(0, 9);
    // Nothing to make, so the only cost is the bank's 3 %: what is left over it.
    expect(profitOverCostOf(10, 0)).toBeCloseTo(0.97 / 0.03, 9);
  });
});

describe('the 2026-10-10 audit, kept for comparison (65 % target, 62 % floor, VAT counted)', () => {
  test('a credit nets 0.10 ₾ less VAT and the card fee under the audit\'s money side', () => {
    expect(netGelPerCredit(AUDIT)).toBeCloseTo((0.1 / 1.18) * 0.97, 6);
  });

  test.each(Object.entries(AUDIT_2026_10_10.ops))('%s at %i credits clears its floor', (id, credits) => {
    const op = unitOp(id);
    expect(op.status).not.toBe('BLOCKED');
    expect(marginOf(credits, opCostGel(op, AUDIT), AUDIT)).toBeGreaterThanOrEqual(AUDIT.floorMargin);
  });

  test.each(TIERS)('a %s video of 8 to 48 s, documentary and music video', (tier) => {
    for (let seconds = 8; seconds <= 48; seconds += 8) {
      for (const musicVideo of [false, true]) {
        expect(marginOf(auditVideoCredits(seconds, tier, musicVideo), videoCostGel(seconds, tier, musicVideo, AUDIT), AUDIT)).toBeGreaterThanOrEqual(AUDIT.floorMargin);
      }
    }
  });

  test('the new rule prices every audited op lower than the audit did (the owner\'s card shows where)', () => {
    for (const [id, credits] of Object.entries(AUDIT_2026_10_10.ops)) expect(ruleCredits(unitOp(id))).toBeLessThan(credits);
    expect(creditsForMargin(unitOp('image.one'), AUDIT.targetMargin)).toBeGreaterThan(ruleCredits(unitOp('image.one')));
  });

  test('a BLOCKED op has no price in either table (it is refused, never sold)', () => {
    for (const op of UNIT_OPS.filter((o) => o.status === 'BLOCKED')) {
      expect(AUDIT_2026_10_10.ops[op.id]).toBeUndefined();
      expect(op.lines).toHaveLength(0);
    }
  });
});

describe('free by design: what a free account can cost', () => {
  test('a free account that maxes every daily cap costs a bounded amount a day', () => {
    const day =
      FREE_DAILY.chatAnswers * opCostGel(unitOp('chat.message')) +
      FREE_DAILY.liveVoiceMinutes * opCostGel(unitOp('agent-g.live.minute')) +
      FREE_DAILY.montages * opCostGel(unitOp('agent-g.montage')) +
      FREE_DAILY.mp3Extracts * opCostGel(unitOp('agent-g.audio')) +
      FREE_DAILY.agentEdits * opCostGel(unitOp('agent-g.edit')) +
      FREE_DAILY.ffmpegRemixEdits * opCostGel(unitOp('video.remix.ffmpeg'));
    // Every cap hit every day, chat at its p95 cost: under 4.5 ₾ a day (about 1.5 ₾ at chat's average cost).
    expect(day).toBeLessThan(4.5);
    expect(day).toBeGreaterThan(0);
  });
});

describe('WhatsApp calls (docs/handoffs/omnichannel/COMMUNICATION_UNIT_ECONOMICS.md)', () => {
  type Cap = typeof CALL_CAP | typeof CALL_CAP_FALLBACK;
  /** One call's variable cost in USD, the way the calculator adds it up: Gemini (+5 % dropped calls), Meta, the result message, egress. */
  const callUsd = (minutes: number, outbound: boolean, cap: Cap) =>
    liveCallGeminiUsd(minutes, cap) * 1.05 + (outbound ? META_GE_BUSINESS_CALL_USD_PER_MIN * minutes : 0) + META_GE_SERVICE_MESSAGE_USD + (0.34 / 1000) * minutes;
  const monthMargin = (credits: number, minutesPerMonth: number, callMinutes: number, outbound: boolean, cap: Cap) => {
    const usd = (minutesPerMonth / callMinutes) * callUsd(callMinutes, outbound, cap) + CALL_BRIDGE_VM_USD_PER_MONTH;
    return marginOf(credits * minutesPerMonth, usdToCostGel(usd, AUDIT), AUDIT);
  };
  const price = AUDIT_2026_10_10.ops['agent-g.whatsapp-call.minute']!;

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
      for (const outbound of [false, true]) expect(monthMargin(price, CALL_PLANNING_MINUTES_PER_MONTH, minutes, outbound, cap)).toBeGreaterThanOrEqual(AUDIT.floorMargin);
    }
  });

  test('on today\'s cap it reaches the 65 % target at 1,000 call-minutes a month for every length and direction', () => {
    for (const minutes of [5, 15, 30]) {
      for (const outbound of [false, true]) expect(monthMargin(price, 1000, minutes, outbound, CALL_CAP)).toBeGreaterThanOrEqual(AUDIT.targetMargin);
    }
  });

  test('at 100 call-minutes a month the VM decides: the doc\'s warning that no near price clears the floor stays true', () => {
    expect(monthMargin(price, 100, 15, false, CALL_CAP)).toBeLessThan(AUDIT.floorMargin);
    expect(monthMargin(price, 100, 15, false, CALL_CAP)).toBeGreaterThan(0);
  });
});
