/** @jest-environment node */
/**
 * NO SILENT SWITCH in the remix ops (the owner, 2026-10-09: "აკრძალული პროვაიდერის ჩუმი fallback არ დაუშვა"; MASTER TASK v3.1).
 *
 * Restyle, character swap, background swap and redub ran on outside engines (NanoBanana + Kling, roop, sync lip-sync), and
 * their misses used to fall through to yet other outside engines for the same price. None of them has a Google engine, so
 * all four are refused (503 google_only) right after the op is read, before the service switch, the sign-in gate or the
 * charge, whatever MEDIA_GOOGLE_ONLY says, and their engine calls are gone from the route. Structural, like
 * fallbackRefund.test.ts: the handler sits behind a dozen provider imports.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');

it('the four outside-engine ops are refused before the service switch and the charge', () => {
  expect(src).toContain("const OUTSIDE_ENGINE_OPS = new Set(['restyle', 'character', 'background_remove', 'redub']);");
  const refusal = src.indexOf('if (OUTSIDE_ENGINE_OPS.has(op)) return refuseOutsideEngine(req);');
  expect(refusal).toBeGreaterThan(-1);
  expect(refusal).toBeLessThan(src.indexOf('serviceOffResponse('));
  expect(refusal).toBeLessThan(src.indexOf('await deductCreditsOnce('));
  expect(src).not.toMatch(/isMediaGoogleOnly|const outside = refuseOutsideEngine/);
});

it('no engine those ops used is called from the route any more', () => {
  expect(src).not.toMatch(/roopFaceSwapVideo|klingI2v\(|generateNanoBananaImage|filmLipsyncCreate|lipsyncFetch|extractFrame\(/);
  expect(src).not.toMatch(/case 'redub'|case 'restyle'|case 'character'|case 'background_remove'/);
});
