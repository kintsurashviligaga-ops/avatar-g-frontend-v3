/**
 * The pricing audit's rule, held by tests: every proposed price clears the owner's 62 % floor against the op's FULL cost
 * (list price, re-renders, compute, storage, FX reserve) measured on what a credit nets after VAT and the card fee.
 */
import {
  ECON,
  FREE_DAILY,
  PROPOSED,
  PROPOSED_VIDEO_PER_SEC,
  UNIT_OPS,
  deckCostGel,
  floorCredits,
  marginAt,
  marginOf,
  netGelPerCredit,
  opCostGel,
  proposedDeckCredits,
  proposedVideoCredits,
  targetCredits,
  unitOp,
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
