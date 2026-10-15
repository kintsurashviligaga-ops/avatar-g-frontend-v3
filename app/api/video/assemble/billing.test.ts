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

test('a FILM\'s "already paid" is decided from durable storage (decideFilmWaiver), a product ad\'s by the shared predicate', () => {
  expect(code).toMatch(/const decision = await decideFilmWaiver\(uid, filmTokenId, crypto\.randomUUID\(\)\)/);
  // busy → 409 and unknown → 503, both before anything is charged or rendered.
  expect(code).toMatch(/decision\.action === 'busy'[\s\S]{0,400}status: 409/);
  expect(code).toMatch(/decision\.action === 'stop'[\s\S]{0,500}status: 503/);
  expect(code).toMatch(/Promise\.all\(\[getFilmStatus\(billingToken\), getFilmPaid\(billingToken\)\]\)/);
  expect(code).toMatch(/filmAlreadyBilled = isFilmPaidUpstream\(prior, paid, uid\)/);
});

test('the leased waiver is settled on every exit: spent by a delivered master, handed back otherwise', () => {
  expect(code).toMatch(/await settleWaiver\(producedSomething\)/);
  expect(code).toMatch(/await settleWaiver\(Boolean\(resultUrl\)\)/);
  // the duplicate refusal, the single-clip catch and the saga compensate all hand it back
  expect((code.match(/await settleWaiver\(false\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  // and nothing restores the cache waiver behind settleWaiver's back any more
  expect((code.match(/restoreFilmBilling\(/g) ?? []).length).toBe(1);
});

test('the duplicate claim outlives the render (600 s maxDuration), not 60 s', () => {
  expect(code).toMatch(/claimIdempotencyKey\(idemOwner, `assemble:\$\{idemKey\}`, FILM_WAIVER_LEASE_SEC\)/);
  expect(code).toMatch(/export const maxDuration = 600/);
});

test('every charge and refund in the route uses that one amount', () => {
  const uses = code.match(/assembleCost/g) ?? [];
  expect(uses.length).toBeGreaterThanOrEqual(7);
  expect(code).not.toMatch(/deductCredits\(uid, \d+,/);
});
