/** @jest-environment node */
/**
 * lib/studio/shootQuote — the number on the Interior designer's / Photographer's button is the number on the bill.
 * Every figure here is derived from the function its route charges with; the sources of those routes are read to pin it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creditCostFor } from '@/lib/credits/pricing';
import { quoteCredits } from '@/lib/credits/quote';
import { videoCredits } from '@/lib/credits/videoPricing';
import { PRODUCE_COST } from '@/lib/orchestrator/produceCost';
import {
  PLAN_3D_CREDITS, SHOOT_ASPECTS, SHOOT_COUNTS, SHOOT_MAX_PHOTOS, WALKTHROUGH_SECONDS, nearestAspect, shootCredits, shootTargetSec,
  shootTiles, walkthroughCredits,
} from './shootQuote';

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

describe('what a press costs', () => {
  test('a press is photos × renders-per-photo (one photo-less press is one render per count)', () => {
    expect(shootTiles(0, 1)).toBe(1);
    expect(shootTiles(0, 4)).toBe(4);
    expect(shootTiles(1, 1)).toBe(1);
    expect(shootTiles(2, 3)).toBe(6);
    expect(shootTiles(SHOOT_MAX_PHOTOS, 4)).toBe(12);
  });

  test('out-of-range and non-finite input is clamped, never a free or an unbounded press', () => {
    expect(shootTiles(-5, 0)).toBe(1);
    expect(shootTiles(99, 99)).toBe(SHOOT_MAX_PHOTOS * SHOOT_COUNTS[SHOOT_COUNTS.length - 1]!);
    expect(shootTiles(Number.NaN, Number.NaN)).toBe(1);
    expect(shootTiles(1.9, 2.9)).toBe(2);
    expect(shootCredits(-1, -1)).toBeGreaterThan(0);
  });

  test('the price is the image function\'s: creditCostFor(\'image\', { count }) — the one the route charges per render', () => {
    for (const photos of [0, 1, 2, 3]) {
      for (const count of SHOOT_COUNTS) {
        const tiles = shootTiles(photos, count);
        expect(shootCredits(photos, count)).toBe(creditCostFor('image', { count: tiles }));
        expect(shootCredits(photos, count)).toBe(quoteCredits({ tool: 'image', count: tiles }));
        expect(shootCredits(photos, count)).toBe(tiles * creditCostFor('image')); // = renders × the per-render debit
      }
    }
    expect(shootCredits(0, 1)).toBe(2);
  });

  test('both tools are registered in lib/credits/quote under their own names, at the same price as an image render', () => {
    for (const tiles of [1, 2, 4, 12]) {
      expect(quoteCredits({ tool: 'interior', count: tiles })).toBe(creditCostFor('image', { count: tiles }));
      expect(quoteCredits({ tool: 'photoshoot', count: tiles })).toBe(creditCostFor('image', { count: tiles }));
    }
    expect(quoteCredits({ tool: 'interior' })).toBe(creditCostFor('image'));
  });

  test('the route reserves creditCostFor(\'image\') per render and refunds the same amount — nothing else', () => {
    const route = read('app', 'api', 'nanobanana', 'image', 'route.ts');
    expect(route).toContain("deductCredits(rUser.id, creditCostFor('image'), reserveRef)");
    expect(route).toContain("refundCredits(reservedUid, creditCostFor('image'), `${reserveRef}:refund`)");
    // …and the studio's request never carries a price: the client sends no `credits`/`price`/`cost` the route could trust.
    expect(route).not.toMatch(/body\.(credits|price|cost)\b/);
  });
});

describe('the two secondary actions carry their OWN prices, each from the constant its route charges with', () => {
  test('3D plan = PRODUCE_COST.interior, which /api/orchestrator/interior/produce reserves before it runs', () => {
    expect(PLAN_3D_CREDITS).toBe(PRODUCE_COST.interior);
    const route = read('app', 'api', 'orchestrator', 'interior', 'produce', 'route.ts');
    expect(route).toContain('reserveProduce(user.id, PRODUCE_COST.interior, ref)');
    expect(route).toContain('refundProduce(user.id, PRODUCE_COST.interior, ref, reservation.charged)');
  });

  test('the server-only rate-limit module re-exports the SAME constant (one number, two readers)', () => {
    const rl = read('lib', 'orchestrator', 'rate-limit.ts');
    expect(rl).toContain("export { PRODUCE_COST, type ProduceKind } from './produceCost';");
    expect(read('lib', 'orchestrator', 'produceCost.ts')).not.toContain("'server-only'"); // a button can import it
  });

  test('Walkthrough = the Video studio\'s price for ONE 8 s clip — videoCredits, not a literal', () => {
    expect(WALKTHROUGH_SECONDS).toBe(8);
    expect(walkthroughCredits()).toBe(videoCredits({ seconds: 8 }));
    expect(walkthroughCredits()).toBe(quoteCredits({ tool: 'video', seconds: 8 }));
  });
});

describe('shape and pace', () => {
  test('the aspect list is the image route\'s ratios', () => {
    for (const a of ['1:1', '4:5', '3:4', '2:3', '9:16', '4:3', '3:2', '16:9']) expect(SHOOT_ASPECTS as readonly string[]).toContain(a);
  });
  test('the room photo of the brief (748×1600, a phone portrait) maps to 9:16; a landscape to 3:2', () => {
    expect(nearestAspect(748, 1600)).toBe('9:16');
    expect(nearestAspect(1600, 1067)).toBe('3:2');
    expect(nearestAspect(1000, 1000)).toBe('1:1');
    expect(nearestAspect(1920, 1080)).toBe('16:9');
    expect(nearestAspect(0, 0)).toBe('1:1');
    expect(nearestAspect(Number.NaN, 100)).toBe('1:1');
  });
  test('the render target follows the tier\'s measured time', () => {
    expect(shootTargetSec('standard')).toBeLessThan(shootTargetSec('high'));
    expect(shootTargetSec('high')).toBeLessThan(shootTargetSec('ultra'));
  });
});
