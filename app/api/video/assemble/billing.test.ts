/** @jest-environment node */
/**
 * Structural guard for /api/video/assemble's billing (the handler is ~1,000 lines of ffmpeg behind a dozen provider imports):
 * there is NO flat stitch price any more, and the route honours the up-front payment through the one shared predicate.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('no flat 20-credit stitch price survives', () => {
  expect(code).not.toMatch(/ASSEMBLE_COST/);
  expect(code).not.toMatch(/=\s*20;\s*\/\/ credits/);
});

test('the fallback stitch is the film quote for the seconds actually handed over', () => {
  expect(code).toMatch(/const assembleCost = videoCredits\(\{\s*seconds: filmSecondsFromClips\(segments\.map/);
});

test('"already paid" is decided by the shared predicate over the status record AND the payment record', () => {
  expect(code).toMatch(/Promise\.all\(\[getFilmStatus\(billedTokenForCheck\), getFilmPaid\(billedTokenForCheck\)\]\)/);
  expect(code).toMatch(/filmAlreadyBilled = isFilmPaidUpstream\(prior, paid, uid\)/);
});

test('every charge and refund in the route uses that one amount', () => {
  const uses = code.match(/assembleCost/g) ?? [];
  expect(uses.length).toBeGreaterThanOrEqual(7);
  expect(code).not.toMatch(/deductCredits\(uid, \d+,/);
});
